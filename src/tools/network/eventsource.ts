/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const monitorEventsource = defineTool({
  name: 'monitor_eventsource',
  description:
    'Starts capturing Server-Sent Events (EventSource) messages via CDP. ' +
    'Useful for streaming APIs (e.g. LLM token streams, live feeds).',
  annotations: {
    title: 'Monitor EventSource',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    clear: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Clear previously captured messages first.'),
  },
  handler: async (request, response, context) => {
    const tracker = context.networkManager.eventSource;
    if (request.params.clear) {
      tracker.clear();
    }
    tracker.setEnabled(true);
    response.appendResponseLine('EventSource (SSE) capture enabled.');
    response.appendResponseLine(
      'Use list_eventsource_messages to inspect streamed events.',
    );
  },
});

export const stopEventsourceMonitor = defineTool({
  name: 'stop_eventsource_monitor',
  description:
    'Stops capturing EventSource messages. Captured data is retained.',
  annotations: {
    title: 'Stop EventSource Monitor',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    context.networkManager.eventSource.setEnabled(false);
    response.appendResponseLine('EventSource capture disabled.');
  },
});

export const listEventsourceMessages = defineTool({
  name: 'list_eventsource_messages',
  description: 'Lists captured Server-Sent Events, filterable by URL/content.',
  annotations: {
    title: 'List EventSource Messages',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    urlPattern: zod
      .string()
      .optional()
      .describe('Filter by source URL (glob/substring/regex).'),
    isRegex: zod.boolean().optional().default(false),
    contains: zod
      .string()
      .optional()
      .describe('Only messages whose data contains this text.'),
    maxDataLength: zod
      .number()
      .int()
      .optional()
      .default(2000)
      .describe('Maximum data characters to display (default 2000).'),
    limit: zod
      .number()
      .int()
      .optional()
      .default(100)
      .describe('Maximum number of messages (default 100).'),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    const messages = context.networkManager.eventSource.query({
      urlPattern: params.urlPattern,
      isRegex: params.isRegex,
      contains: params.contains,
      limit: params.limit,
    });
    if (messages.length === 0) {
      response.appendResponseLine('No matching EventSource messages captured.');
      return;
    }
    response.appendResponseLine(`Captured ${messages.length} message(s):`);
    for (const m of messages) {
      let data = m.data;
      if (params.maxDataLength > 0 && data.length > params.maxDataLength) {
        data = `${data.slice(0, params.maxDataLength)}... [truncated]`;
      }
      response.appendResponseLine(
        `- event=${m.eventName || 'message'} id=${m.eventId || '-'} ${m.url}`,
      );
      response.appendResponseLine(`  ${data}`);
    }
  },
});
