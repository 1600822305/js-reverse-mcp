/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const monitorWebsocket = defineTool({
  name: 'monitor_websocket',
  description:
    'Starts capturing WebSocket frames via the CDP Network domain. Unlike a ' +
    'JS monkey-patch, this captures connections opened before the call and ' +
    'after navigation, records binary frames (as base64), and is not ' +
    'detectable from page scripts.',
  annotations: {
    title: 'Monitor WebSocket',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    clear: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Clear previously captured frames/connections first.'),
  },
  handler: async (request, response, context) => {
    const tracker = context.networkManager.websocket;
    if (request.params.clear) {
      tracker.clear();
    }
    tracker.setEnabled(true);
    response.appendResponseLine('WebSocket capture enabled (CDP-native).');
    response.appendResponseLine(
      'Use list_websocket_connections and list_websocket_messages to inspect traffic.',
    );
  },
});

export const stopWebsocketMonitor = defineTool({
  name: 'stop_websocket_monitor',
  description:
    'Stops capturing WebSocket frames. Captured frames are retained.',
  annotations: {
    title: 'Stop WebSocket Monitor',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    context.networkManager.websocket.setEnabled(false);
    response.appendResponseLine('WebSocket capture disabled.');
  },
});

export const listWebsocketConnections = defineTool({
  name: 'list_websocket_connections',
  description: 'Lists tracked WebSocket connections and their frame counts.',
  annotations: {
    title: 'List WebSocket Connections',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const connections = context.networkManager.websocket.listConnections();
    if (connections.length === 0) {
      response.appendResponseLine(
        'No WebSocket connections tracked. Call monitor_websocket first (and trigger a connection).',
      );
      return;
    }
    response.appendResponseLine(
      `WebSocket connections (${connections.length}):`,
    );
    for (const c of connections) {
      response.appendResponseLine(
        `- #${c.id} ${c.closed ? '[closed]' : '[open]'} ${c.url}`,
      );
      response.appendResponseLine(
        `    sent: ${c.sentCount}, received: ${c.receivedCount}`,
      );
    }
  },
});

export const listWebsocketMessages = defineTool({
  name: 'list_websocket_messages',
  description:
    'Lists captured WebSocket frames, filterable by connection, direction, ' +
    'URL pattern and payload content. Binary frames are shown as base64.',
  annotations: {
    title: 'List WebSocket Messages',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: {
    connectionId: zod
      .number()
      .int()
      .optional()
      .describe('Filter by connection id (from list_websocket_connections).'),
    direction: zod
      .enum(['sent', 'received'])
      .optional()
      .describe('Filter by frame direction.'),
    urlPattern: zod
      .string()
      .optional()
      .describe('Filter by connection URL (glob/substring/regex).'),
    isRegex: zod.boolean().optional().default(false),
    contains: zod
      .string()
      .optional()
      .describe('Only frames whose payload contains this text.'),
    maxPayloadLength: zod
      .number()
      .int()
      .optional()
      .default(2000)
      .describe('Maximum payload characters to display (default 2000).'),
    limit: zod
      .number()
      .int()
      .optional()
      .default(100)
      .describe('Maximum number of frames (default 100).'),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    const frames = context.networkManager.websocket.queryFrames({
      connectionId: params.connectionId,
      direction: params.direction,
      urlPattern: params.urlPattern,
      isRegex: params.isRegex,
      contains: params.contains,
      limit: params.limit,
    });
    if (frames.length === 0) {
      response.appendResponseLine('No matching WebSocket frames captured.');
      return;
    }
    response.appendResponseLine(`Captured ${frames.length} frame(s):`);
    for (const f of frames) {
      const arrow = f.direction === 'sent' ? '>>' : '<<';
      const kind = f.isBinary ? 'binary/base64' : 'text';
      let payload = f.payload;
      if (
        params.maxPayloadLength > 0 &&
        payload.length > params.maxPayloadLength
      ) {
        payload = `${payload.slice(0, params.maxPayloadLength)}... [truncated]`;
      }
      response.appendResponseLine(`conn#${f.connectionId} ${arrow} (${kind})`);
      response.appendResponseLine(`  ${payload}`);
    }
  },
});
