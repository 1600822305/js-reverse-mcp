/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

interface ThrottleProfile {
  offline: boolean;
  latency: number;
  downloadThroughput: number;
  uploadThroughput: number;
}

const PRESETS: Record<string, ThrottleProfile> = {
  'No throttling': {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  },
  Offline: {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  },
  'Slow 3G': {
    offline: false,
    latency: 400,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
  },
  'Fast 3G': {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  },
  'Slow 4G': {
    offline: false,
    latency: 100,
    downloadThroughput: (3 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  },
  'Fast 4G': {
    offline: false,
    latency: 50,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (4.5 * 1024 * 1024) / 8,
  },
};

export const setNetworkConditions = defineTool({
  name: 'set_network_conditions',
  description:
    'Emulates network conditions (offline, throttling, latency) and optionally ' +
    'overrides the User-Agent, via the CDP Network domain. Use a preset or ' +
    'specify raw values.',
  annotations: {
    title: 'Set Network Conditions',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    preset: zod
      .enum([
        'No throttling',
        'Offline',
        'Slow 3G',
        'Fast 3G',
        'Slow 4G',
        'Fast 4G',
      ])
      .optional()
      .describe('Named throttling profile.'),
    offline: zod.boolean().optional().describe('Force the page offline.'),
    latency: zod
      .number()
      .optional()
      .describe('Minimum round-trip latency in milliseconds.'),
    downloadThroughput: zod
      .number()
      .optional()
      .describe('Max download throughput in bytes/sec (-1 to disable).'),
    uploadThroughput: zod
      .number()
      .optional()
      .describe('Max upload throughput in bytes/sec (-1 to disable).'),
    userAgent: zod
      .string()
      .optional()
      .describe('Override the User-Agent string for subsequent requests.'),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    const client = context.networkManager.getClient();
    if (!client) {
      response.appendResponseLine(
        'Network manager is not bound. Select a page first.',
      );
      return;
    }

    const base: ThrottleProfile = params.preset
      ? {...PRESETS[params.preset]}
      : {
          offline: false,
          latency: 0,
          downloadThroughput: -1,
          uploadThroughput: -1,
        };
    const profile: ThrottleProfile = {
      offline: params.offline ?? base.offline,
      latency: params.latency ?? base.latency,
      downloadThroughput: params.downloadThroughput ?? base.downloadThroughput,
      uploadThroughput: params.uploadThroughput ?? base.uploadThroughput,
    };

    await client.send('Network.emulateNetworkConditions', profile);
    // Track the preset so McpContext can adjust navigation timeouts accordingly.
    context.setNetworkConditions(params.preset ?? null);
    response.appendResponseLine(
      `Network conditions set: offline=${profile.offline}, latency=${profile.latency}ms, down=${profile.downloadThroughput}B/s, up=${profile.uploadThroughput}B/s`,
    );

    if (params.userAgent !== undefined) {
      await client.send('Network.setUserAgentOverride', {
        userAgent: params.userAgent,
      });
      response.appendResponseLine(`User-Agent override: ${params.userAgent}`);
    }
  },
});

export const setExtraHeaders = defineTool({
  name: 'set_extra_headers',
  description:
    'Sets extra HTTP headers sent with every subsequent request (CDP ' +
    'Network.setExtraHTTPHeaders). Pass an empty object to clear.',
  annotations: {
    title: 'Set Extra HTTP Headers',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    headers: zod
      .record(zod.string())
      .describe(
        'Header name/value map. Empty object clears all extra headers.',
      ),
  },
  handler: async (request, response, context) => {
    const client = context.networkManager.getClient();
    if (!client) {
      response.appendResponseLine(
        'Network manager is not bound. Select a page first.',
      );
      return;
    }
    await client.send('Network.setExtraHTTPHeaders', {
      headers: request.params.headers,
    });
    const count = Object.keys(request.params.headers).length;
    response.appendResponseLine(
      count === 0
        ? 'Cleared all extra HTTP headers.'
        : `Set ${count} extra HTTP header(s).`,
    );
  },
});

export const clearNetworkConditions = defineTool({
  name: 'clear_network_conditions',
  description:
    'Resets network emulation (back online, no throttling) and clears any ' +
    'User-Agent override and extra headers.',
  annotations: {
    title: 'Clear Network Conditions',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    const client = context.networkManager.getClient();
    if (!client) {
      response.appendResponseLine(
        'Network manager is not bound. Select a page first.',
      );
      return;
    }
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    context.setNetworkConditions(null);
    await client.send('Network.setExtraHTTPHeaders', {headers: {}});
    try {
      await client.send('Network.setUserAgentOverride', {userAgent: ''});
    } catch {
      // Some Chrome versions reject an empty UA; ignore.
    }
    response.appendResponseLine('Network conditions reset to defaults.');
  },
});

export const setCacheDisabled = defineTool({
  name: 'set_cache_disabled',
  description:
    'Toggles the browser cache for the page via CDP Network.setCacheDisabled. ' +
    'Disable it to force real network responses (no 304 / disk cache) while ' +
    'capturing or replaying traffic.',
  annotations: {
    title: 'Set Cache Disabled',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    disabled: zod
      .boolean()
      .describe('True to bypass the cache, false to re-enable it.'),
  },
  handler: async (request, response, context) => {
    const client = context.networkManager.getClient();
    if (!client) {
      response.appendResponseLine(
        'Network manager is not bound. Select a page first.',
      );
      return;
    }
    await client.send('Network.setCacheDisabled', {
      cacheDisabled: request.params.disabled,
    });
    response.appendResponseLine(
      request.params.disabled ? 'Cache disabled.' : 'Cache enabled.',
    );
  },
});

export const clearBrowserCache = defineTool({
  name: 'clear_browser_cache',
  description:
    'Clears the browser HTTP cache via CDP Network.clearBrowserCache so the ' +
    'next requests hit the network.',
  annotations: {
    title: 'Clear Browser Cache',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const client = context.networkManager.getClient();
    if (!client) {
      response.appendResponseLine(
        'Network manager is not bound. Select a page first.',
      );
      return;
    }
    await client.send('Network.clearBrowserCache');
    response.appendResponseLine('Browser cache cleared.');
  },
});
