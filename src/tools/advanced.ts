/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Advanced JS Reverse Engineering Tools
 *
 * This module provides advanced tools for JavaScript reverse engineering:
 * - Code beautification
 * - WebSocket monitoring
 * - Request interception and modification
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ==================== Code Beautification ====================

/**
 * Beautify minified/compressed JavaScript code.
 */
export const beautifyScript = defineTool({
  name: 'beautify_script',
  description:
    'Beautifies minified/compressed JavaScript code to make it more readable. Supports automatic indentation, line breaks, and formatting.',
  annotations: {
    title: 'Beautify Script',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    scriptId: zod
      .string()
      .optional()
      .describe(
        'The script ID to beautify (from list_scripts). If not provided, use the code parameter.',
      ),
    code: zod
      .string()
      .optional()
      .describe(
        'JavaScript code to beautify. Use this if you want to beautify a code snippet instead of a full script.',
      ),
    indentSize: zod
      .number()
      .int()
      .optional()
      .default(2)
      .describe('Number of spaces for indentation (default: 2).'),
    maxLineLength: zod
      .number()
      .int()
      .optional()
      .default(80)
      .describe('Maximum line length before wrapping (default: 80).'),
  },
  handler: async (request, response, context) => {
    const {scriptId, code, indentSize, maxLineLength} = request.params;

    if (!scriptId && !code) {
      response.appendResponseLine(
        'Error: Either scriptId or code must be provided.',
      );
      return;
    }

    let sourceCode = code;

    // Get source from script ID if provided
    if (scriptId) {
      const debugger_ = context.debuggerContext;
      if (!debugger_.isEnabled()) {
        response.appendResponseLine(
          'Debugger is not enabled. Please select a page first.',
        );
        return;
      }

      try {
        sourceCode = await debugger_.getScriptSource(scriptId);
      } catch (error) {
        response.appendResponseLine(
          `Error getting script source: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
    }

    if (!sourceCode) {
      response.appendResponseLine('No source code to beautify.');
      return;
    }

    // Beautify code using a JavaScript-based beautifier injected into the page
    const beautifyCode = `
(function() {
  const code = ${JSON.stringify(sourceCode)};
  const indentSize = ${indentSize};
  const maxLineLength = ${maxLineLength};

  // Simple JavaScript beautifier
  function beautify(src, indent, maxLen) {
    let result = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inLineComment = false;
    let inRegex = false;
    let lastChar = '';
    let currentLine = '';
    
    const indentStr = ' '.repeat(indent);
    
    function addNewline() {
      if (currentLine.trim()) {
        result += currentLine.trimEnd() + '\\n';
      }
      currentLine = indentStr.repeat(depth);
    }
    
    function addChar(c) {
      currentLine += c;
      if (currentLine.length > maxLen && !inString && !inComment) {
        // Try to break at a good point
        const breakPoints = [',', ';', '{', '}', '(', ')', '&&', '||'];
        for (const bp of breakPoints) {
          const idx = currentLine.lastIndexOf(bp);
          if (idx > maxLen / 2) {
            result += currentLine.substring(0, idx + bp.length).trimEnd() + '\\n';
            currentLine = indentStr.repeat(depth) + currentLine.substring(idx + bp.length).trimStart();
            break;
          }
        }
      }
    }
    
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      const nextChar = src[i + 1] || '';
      
      // Handle comments
      if (!inString && !inRegex) {
        if (c === '/' && nextChar === '*' && !inComment) {
          inComment = true;
          addChar(c);
          continue;
        }
        if (c === '*' && nextChar === '/' && inComment) {
          inComment = false;
          addChar(c);
          addChar(nextChar);
          i++;
          continue;
        }
        if (c === '/' && nextChar === '/' && !inComment) {
          inLineComment = true;
          addChar(c);
          continue;
        }
        if (c === '\\n' && inLineComment) {
          inLineComment = false;
          addNewline();
          lastChar = c;
          continue;
        }
      }
      
      if (inComment || inLineComment) {
        addChar(c);
        lastChar = c;
        continue;
      }
      
      // Handle strings
      if ((c === '"' || c === "'" || c === '\`') && lastChar !== '\\\\') {
        if (!inString) {
          inString = true;
          stringChar = c;
        } else if (c === stringChar) {
          inString = false;
        }
        addChar(c);
        lastChar = c;
        continue;
      }
      
      if (inString) {
        addChar(c);
        lastChar = c;
        continue;
      }
      
      // Handle regex (simplified)
      if (c === '/' && !inRegex && (lastChar === '=' || lastChar === '(' || lastChar === ',' || lastChar === ':' || lastChar === '[' || lastChar === '!' || lastChar === '&' || lastChar === '|' || lastChar === ';' || lastChar === '{' || lastChar === '}' || lastChar === '\\n' || lastChar === '')) {
        inRegex = true;
        addChar(c);
        lastChar = c;
        continue;
      }
      if (inRegex && c === '/' && lastChar !== '\\\\') {
        inRegex = false;
        addChar(c);
        lastChar = c;
        continue;
      }
      if (inRegex) {
        addChar(c);
        lastChar = c;
        continue;
      }
      
      // Handle braces
      if (c === '{') {
        addChar(' ');
        addChar(c);
        depth++;
        addNewline();
        lastChar = c;
        continue;
      }
      if (c === '}') {
        depth = Math.max(0, depth - 1);
        addNewline();
        addChar(c);
        if (nextChar !== ',' && nextChar !== ';' && nextChar !== ')' && nextChar !== 'e' && nextChar !== 'c' && nextChar !== 'f' && nextChar !== 'w') {
          addNewline();
        }
        lastChar = c;
        continue;
      }
      
      // Handle semicolons
      if (c === ';') {
        addChar(c);
        if (nextChar !== '}' && nextChar !== '\\n') {
          addNewline();
        }
        lastChar = c;
        continue;
      }
      
      // Handle commas in objects/arrays
      if (c === ',') {
        addChar(c);
        // Check if we're likely in an object/array literal
        let braceCount = 0;
        for (let j = currentLine.length - 1; j >= 0; j--) {
          if (currentLine[j] === '{' || currentLine[j] === '[') braceCount++;
          if (currentLine[j] === '}' || currentLine[j] === ']') braceCount--;
        }
        if (braceCount > 0) {
          addNewline();
        } else {
          addChar(' ');
        }
        lastChar = c;
        continue;
      }
      
      // Handle operators with spacing
      if ((c === '=' || c === '+' || c === '-' || c === '*' || c === '/' || c === '%' || c === '<' || c === '>' || c === '!' || c === '&' || c === '|' || c === '?' || c === ':') && !inString && !inRegex) {
        // Check for compound operators
        const compound = c + nextChar;
        const triple = c + nextChar + (src[i + 2] || '');
        
        if (triple === '===' || triple === '!==' || triple === '>>>' || triple === '...') {
          if (lastChar !== ' ') addChar(' ');
          addChar(c);
          addChar(nextChar);
          addChar(src[i + 2]);
          i += 2;
          addChar(' ');
        } else if (compound === '==' || compound === '!=' || compound === '<=' || compound === '>=' || compound === '&&' || compound === '||' || compound === '+=' || compound === '-=' || compound === '*=' || compound === '/=' || compound === '=>' || compound === '++' || compound === '--' || compound === '<<' || compound === '>>') {
          if (compound !== '++' && compound !== '--' && lastChar !== ' ') addChar(' ');
          addChar(c);
          addChar(nextChar);
          i++;
          if (compound !== '++' && compound !== '--') addChar(' ');
        } else if (c === ':' && (lastChar === '?' || depth > 0)) {
          addChar(c);
          addChar(' ');
        } else if (c !== '+' && c !== '-' && c !== '!' || (lastChar !== '(' && lastChar !== '[' && lastChar !== ',' && lastChar !== '=' && lastChar !== ':' && lastChar !== '?' && lastChar !== ';' && lastChar !== '{' && lastChar !== '\\n' && lastChar !== '')) {
          if (lastChar !== ' ' && lastChar !== '(' && lastChar !== '[') addChar(' ');
          addChar(c);
          if (nextChar !== '=' && nextChar !== c) addChar(' ');
        } else {
          addChar(c);
        }
        lastChar = c;
        continue;
      }
      
      // Skip extra whitespace
      if (c === ' ' || c === '\\t') {
        if (lastChar !== ' ' && lastChar !== '\\n' && lastChar !== '(' && lastChar !== '[' && lastChar !== '{') {
          addChar(' ');
        }
        lastChar = ' ';
        continue;
      }
      
      // Handle newlines
      if (c === '\\n' || c === '\\r') {
        if (c === '\\r' && nextChar === '\\n') {
          i++;
        }
        if (currentLine.trim()) {
          addNewline();
        }
        lastChar = '\\n';
        continue;
      }
      
      addChar(c);
      lastChar = c;
    }
    
    if (currentLine.trim()) {
      result += currentLine.trimEnd();
    }
    
    return result;
  }
  
  return beautify(code, indentSize, maxLineLength);
})();
`;

    try {
      const page = context.getSelectedPage();
      const beautified = await page.evaluate(beautifyCode);

      if (typeof beautified === 'string') {
        // Truncate if too long
        const maxOutput = 50000;
        const truncated =
          beautified.length > maxOutput
            ? beautified.substring(0, maxOutput) +
              `\n\n... (truncated, ${beautified.length - maxOutput} more characters)`
            : beautified;

        response.appendResponseLine('Beautified code:\n');
        response.appendResponseLine('```javascript');
        response.appendResponseLine(truncated);
        response.appendResponseLine('```');

        if (scriptId) {
          const script = context.debuggerContext.getScriptById(scriptId);
          response.appendResponseLine('');
          response.appendResponseLine(
            `Original: ${sourceCode!.length} chars, Beautified: ${beautified.length} chars`,
          );
          if (script?.url) {
            response.appendResponseLine(`Source: ${script.url}`);
          }
        }
      }
    } catch (error) {
      response.appendResponseLine(
        `Error beautifying code: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// ==================== WebSocket Monitoring ====================

/**
 * Start monitoring WebSocket connections.
 */
export const monitorWebsocket = defineTool({
  name: 'monitor_websocket',
  description:
    'Starts monitoring WebSocket connections to capture sent and received messages. Messages are logged to console.',
  annotations: {
    title: 'Monitor WebSocket',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    urlFilter: zod
      .string()
      .optional()
      .describe(
        'Optional URL pattern to filter WebSocket connections (partial match).',
      ),
    monitorId: zod
      .string()
      .optional()
      .default('ws_monitor')
      .describe('Custom ID for this monitor (default: ws_monitor).'),
    logSent: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to log sent messages (default: true).'),
    logReceived: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to log received messages (default: true).'),
    maxMessageLength: zod
      .number()
      .int()
      .optional()
      .default(1000)
      .describe(
        'Maximum message length to log (default: 1000). Set to 0 for unlimited.',
      ),
  },
  handler: async (request, response, context) => {
    const {urlFilter, monitorId, logSent, logReceived, maxMessageLength} =
      request.params;

    const monitorCode = `
(function() {
  const urlFilter = ${JSON.stringify(urlFilter || '')};
  const monitorId = ${JSON.stringify(monitorId)};
  const logSent = ${logSent};
  const logReceived = ${logReceived};
  const maxLen = ${maxMessageLength};
  
  window.__mcp_ws_monitors__ = window.__mcp_ws_monitors__ || {};
  
  if (window.__mcp_ws_monitors__[monitorId]) {
    return { success: false, message: 'WebSocket monitor already exists: ' + monitorId };
  }
  
  const originalWebSocket = window.WebSocket;
  const trackedSockets = [];
  
  // Override WebSocket constructor
  window.WebSocket = function(url, protocols) {
    const ws = protocols ? new originalWebSocket(url, protocols) : new originalWebSocket(url);
    
    // Check URL filter
    if (urlFilter && !url.includes(urlFilter)) {
      return ws;
    }
    
    const socketInfo = {
      url: url,
      createdAt: new Date().toISOString(),
      messageCount: { sent: 0, received: 0 }
    };
    trackedSockets.push({ ws, info: socketInfo });
    
    console.log('[MCP WebSocket]', {
      monitor: monitorId,
      event: 'connect',
      url: url,
      timestamp: socketInfo.createdAt
    });
    
    // Hook send method
    const originalSend = ws.send.bind(ws);
    ws.send = function(data) {
      socketInfo.messageCount.sent++;
      
      if (logSent) {
        let messagePreview = data;
        if (typeof data === 'string') {
          messagePreview = maxLen > 0 && data.length > maxLen ? data.substring(0, maxLen) + '...' : data;
          // Try to parse as JSON for better display
          try {
            const parsed = JSON.parse(data);
            messagePreview = { type: 'json', data: parsed };
          } catch(e) {
            messagePreview = { type: 'text', data: messagePreview };
          }
        } else if (data instanceof ArrayBuffer) {
          messagePreview = { type: 'binary', size: data.byteLength };
        } else if (data instanceof Blob) {
          messagePreview = { type: 'blob', size: data.size };
        }
        
        console.log('[MCP WebSocket Sent]', {
          monitor: monitorId,
          url: url,
          message: messagePreview,
          timestamp: new Date().toISOString()
        });
      }
      
      return originalSend(data);
    };
    
    // Hook message event
    ws.addEventListener('message', function(event) {
      socketInfo.messageCount.received++;
      
      if (logReceived) {
        let messagePreview = event.data;
        if (typeof event.data === 'string') {
          messagePreview = maxLen > 0 && event.data.length > maxLen ? event.data.substring(0, maxLen) + '...' : event.data;
          // Try to parse as JSON for better display
          try {
            const parsed = JSON.parse(event.data);
            messagePreview = { type: 'json', data: parsed };
          } catch(e) {
            messagePreview = { type: 'text', data: messagePreview };
          }
        } else if (event.data instanceof ArrayBuffer) {
          messagePreview = { type: 'binary', size: event.data.byteLength };
        } else if (event.data instanceof Blob) {
          messagePreview = { type: 'blob', size: event.data.size };
        }
        
        console.log('[MCP WebSocket Received]', {
          monitor: monitorId,
          url: url,
          message: messagePreview,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Hook close event
    ws.addEventListener('close', function(event) {
      console.log('[MCP WebSocket]', {
        monitor: monitorId,
        event: 'close',
        url: url,
        code: event.code,
        reason: event.reason,
        messageStats: socketInfo.messageCount,
        timestamp: new Date().toISOString()
      });
    });
    
    // Hook error event
    ws.addEventListener('error', function(event) {
      console.log('[MCP WebSocket]', {
        monitor: monitorId,
        event: 'error',
        url: url,
        timestamp: new Date().toISOString()
      });
    });
    
    return ws;
  };
  
  // Copy static properties
  window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
  window.WebSocket.OPEN = originalWebSocket.OPEN;
  window.WebSocket.CLOSING = originalWebSocket.CLOSING;
  window.WebSocket.CLOSED = originalWebSocket.CLOSED;
  window.WebSocket.prototype = originalWebSocket.prototype;
  
  window.__mcp_ws_monitors__[monitorId] = {
    originalWebSocket,
    trackedSockets,
    urlFilter
  };
  
  return { success: true, monitorId };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = await page.evaluate(monitorCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          response.appendResponseLine(`✅ WebSocket monitor started!`);
          response.appendResponseLine(`- Monitor ID: ${monitorId}`);
          if (urlFilter) {
            response.appendResponseLine(`- URL Filter: ${urlFilter}`);
          }
          response.appendResponseLine(`- Log sent: ${logSent}`);
          response.appendResponseLine(`- Log received: ${logReceived}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            'WebSocket connections and messages will be logged to console.',
          );
          response.appendResponseLine(
            'Use list_console_messages to view captured messages.',
          );
          response.appendResponseLine(
            `Use stop_websocket_monitor(monitorId: "${monitorId}") to stop.`,
          );
        } else {
          response.appendResponseLine(
            `❌ ${(result as {message: string}).message}`,
          );
        }
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Stop WebSocket monitoring.
 */
export const stopWebsocketMonitor = defineTool({
  name: 'stop_websocket_monitor',
  description: 'Stops a WebSocket monitor and restores original WebSocket.',
  annotations: {
    title: 'Stop WebSocket Monitor',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    monitorId: zod
      .string()
      .optional()
      .default('ws_monitor')
      .describe('The monitor ID to stop (default: ws_monitor).'),
  },
  handler: async (request, response, context) => {
    const {monitorId} = request.params;

    const stopCode = `
(function() {
  const monitorId = ${JSON.stringify(monitorId)};
  
  if (!window.__mcp_ws_monitors__ || !window.__mcp_ws_monitors__[monitorId]) {
    return { success: false, message: 'WebSocket monitor not found: ' + monitorId };
  }
  
  const monitor = window.__mcp_ws_monitors__[monitorId];
  
  // Restore original WebSocket
  window.WebSocket = monitor.originalWebSocket;
  
  // Get stats
  const stats = {
    trackedConnections: monitor.trackedSockets.length,
    activeConnections: monitor.trackedSockets.filter(s => s.ws.readyState === 1).length
  };
  
  delete window.__mcp_ws_monitors__[monitorId];
  
  return { success: true, stats };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = await page.evaluate(stopCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          const r = result as {
            stats: {trackedConnections: number; activeConnections: number};
          };
          response.appendResponseLine(
            `✅ WebSocket monitor "${monitorId}" stopped.`,
          );
          response.appendResponseLine(
            `- Tracked connections: ${r.stats.trackedConnections}`,
          );
          response.appendResponseLine(
            `- Active connections: ${r.stats.activeConnections}`,
          );
        } else {
          response.appendResponseLine(
            `❌ ${(result as {message: string}).message}`,
          );
        }
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * List active WebSocket connections.
 */
export const listWebsocketConnections = defineTool({
  name: 'list_websocket_connections',
  description: 'Lists all tracked WebSocket connections from active monitors.',
  annotations: {
    title: 'List WebSocket Connections',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const listCode = `
(function() {
  if (!window.__mcp_ws_monitors__) return { monitors: [] };
  
  const result = { monitors: [] };
  
  for (const [monitorId, monitor] of Object.entries(window.__mcp_ws_monitors__)) {
    const connections = monitor.trackedSockets.map(s => ({
      url: s.info.url,
      createdAt: s.info.createdAt,
      state: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][s.ws.readyState],
      messagesSent: s.info.messageCount.sent,
      messagesReceived: s.info.messageCount.received
    }));
    
    result.monitors.push({
      id: monitorId,
      urlFilter: monitor.urlFilter || '(none)',
      connections
    });
  }
  
  return result;
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(listCode)) as {
        monitors: Array<{
          id: string;
          urlFilter: string;
          connections: Array<{
            url: string;
            createdAt: string;
            state: string;
            messagesSent: number;
            messagesReceived: number;
          }>;
        }>;
      };

      if (!result.monitors || result.monitors.length === 0) {
        response.appendResponseLine(
          'No active WebSocket monitors. Use monitor_websocket to start monitoring.',
        );
        return;
      }

      for (const monitor of result.monitors) {
        response.appendResponseLine(`📡 Monitor: ${monitor.id}`);
        response.appendResponseLine(`   URL Filter: ${monitor.urlFilter}`);
        response.appendResponseLine(
          `   Connections: ${monitor.connections.length}`,
        );
        response.appendResponseLine('');

        if (monitor.connections.length > 0) {
          for (const conn of monitor.connections) {
            response.appendResponseLine(`   - ${conn.url}`);
            response.appendResponseLine(
              `     State: ${conn.state}, Created: ${conn.createdAt}`,
            );
            response.appendResponseLine(
              `     Messages: ${conn.messagesSent} sent, ${conn.messagesReceived} received`,
            );
          }
        }
        response.appendResponseLine('');
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// ==================== Request Interception ====================

/**
 * Start intercepting network requests.
 */
export const interceptRequests = defineTool({
  name: 'intercept_requests',
  description:
    'Starts intercepting network requests. Allows logging, modifying requests before they are sent, blocking them, or returning mock responses (with optional response delay).',
  annotations: {
    title: 'Intercept Requests',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    urlPattern: zod
      .string()
      .describe('URL pattern to intercept (supports * wildcard).'),
    action: zod
      .enum(['log', 'modify', 'block', 'mock'])
      .describe(
        'Action to take: log (just log), modify (modify request), block (block request), mock (return mock response).',
      ),
    modifyHeaders: zod
      .record(zod.string())
      .optional()
      .describe(
        'Headers to add/modify (for modify action). Use null value to remove a header.',
      ),
    modifyBody: zod
      .string()
      .optional()
      .describe('New request body (for modify action).'),
    mockResponse: zod
      .object({
        status: zod.number().optional().default(200),
        headers: zod.record(zod.string()).optional(),
        body: zod.string(),
      })
      .optional()
      .describe('Mock response to return (for mock action).'),
    delay: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe(
        'Response delay in milliseconds before returning the mock response (for mock action). Default: 0.',
      ),
    interceptId: zod
      .string()
      .optional()
      .describe('Custom ID for this interceptor.'),
  },
  handler: async (request, response, context) => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const {
      urlPattern,
      action,
      modifyHeaders,
      modifyBody,
      mockResponse,
      delay,
      interceptId,
    } = request.params;
    const id = interceptId || `intercept_${Date.now()}`;

    const client = debugger_.getClient();
    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      // Enable Fetch domain for request interception
      await client.send('Fetch.enable', {
        patterns: [
          {
            urlPattern: urlPattern,
            requestStage: 'Request',
          },
        ],
      });

      // Store interception config in page context
      const page = context.getSelectedPage();
      await page.evaluate(
        `
        window.__mcp_interceptors__ = window.__mcp_interceptors__ || {};
        window.__mcp_interceptors__[${JSON.stringify(id)}] = {
          urlPattern: ${JSON.stringify(urlPattern)},
          action: ${JSON.stringify(action)},
          modifyHeaders: ${JSON.stringify(modifyHeaders || {})},
          modifyBody: ${JSON.stringify(modifyBody || null)},
          mockResponse: ${JSON.stringify(mockResponse || null)},
          stats: { matched: 0, modified: 0, blocked: 0, mocked: 0 }
        };
      `,
      );

      // Set up request paused handler
      const handleRequestPaused = async (event: {
        requestId: string;
        request: {
          url: string;
          method: string;
          headers: Record<string, string>;
          postData?: string;
        };
        resourceType: string;
      }) => {
        const {requestId, request: req} = event;

        // Check if URL matches pattern
        const pattern = urlPattern.replace(/\*/g, '.*');
        const regex = new RegExp(pattern);

        if (!regex.test(req.url)) {
          // Continue without modification
          try {
            await client.send('Fetch.continueRequest', {requestId});
          } catch {
            // Ignore errors
          }
          return;
        }

        // Update stats in page
        await page.evaluate(
          `
          if (window.__mcp_interceptors__ && window.__mcp_interceptors__[${JSON.stringify(id)}]) {
            window.__mcp_interceptors__[${JSON.stringify(id)}].stats.matched++;
          }
        `,
        );

        // Log the request
        console.log(`[MCP Intercept] ${action}: ${req.method} ${req.url}`);

        switch (action) {
          case 'log':
            // Just continue
            await client.send('Fetch.continueRequest', {requestId});
            break;

          case 'modify': {
            // Modify headers and/or body
            const newHeaders = {...req.headers, ...(modifyHeaders || {})};
            // Remove null headers
            for (const key of Object.keys(newHeaders)) {
              if (newHeaders[key] === null || newHeaders[key] === 'null') {
                delete newHeaders[key];
              }
            }

            await client.send('Fetch.continueRequest', {
              requestId,
              headers: Object.entries(newHeaders).map(([name, value]) => ({
                name,
                value,
              })),
              postData: modifyBody
                ? Buffer.from(modifyBody).toString('base64')
                : undefined,
            });

            await page.evaluate(
              `
              if (window.__mcp_interceptors__ && window.__mcp_interceptors__[${JSON.stringify(id)}]) {
                window.__mcp_interceptors__[${JSON.stringify(id)}].stats.modified++;
              }
            `,
            );
            break;
          }

          case 'block':
            // Block the request
            await client.send('Fetch.failRequest', {
              requestId,
              errorReason: 'BlockedByClient',
            });

            await page.evaluate(
              `
              if (window.__mcp_interceptors__ && window.__mcp_interceptors__[${JSON.stringify(id)}]) {
                window.__mcp_interceptors__[${JSON.stringify(id)}].stats.blocked++;
              }
            `,
            );
            break;

          case 'mock': {
            // Return mock response
            if (!mockResponse) {
              await client.send('Fetch.continueRequest', {requestId});
              return;
            }

            // Apply delay if specified
            if (delay > 0) {
              await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Default to JSON + permissive CORS headers when none are provided.
            const headers =
              mockResponse.headers && Object.keys(mockResponse.headers).length
                ? mockResponse.headers
                : {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                  };
            const responseHeaders = Object.entries(headers).map(
              ([name, value]) => ({name, value}),
            );

            await client.send('Fetch.fulfillRequest', {
              requestId,
              responseCode: mockResponse.status || 200,
              responseHeaders,
              body: Buffer.from(mockResponse.body).toString('base64'),
            });

            await page.evaluate(
              `
              if (window.__mcp_interceptors__ && window.__mcp_interceptors__[${JSON.stringify(id)}]) {
                window.__mcp_interceptors__[${JSON.stringify(id)}].stats.mocked++;
              }
            `,
            );
            break;
          }
        }
      };

      // Store handler reference for cleanup
      client.on('Fetch.requestPaused', handleRequestPaused);

      // Store handler in context for later removal
      await page.evaluate(
        `
        window.__mcp_interceptors__[${JSON.stringify(id)}].active = true;
      `,
      );

      response.appendResponseLine(`✅ Request interceptor started!`);
      response.appendResponseLine(`- Interceptor ID: ${id}`);
      response.appendResponseLine(`- URL Pattern: ${urlPattern}`);
      response.appendResponseLine(`- Action: ${action}`);
      if (action === 'modify') {
        if (modifyHeaders) {
          response.appendResponseLine(
            `- Modify Headers: ${JSON.stringify(modifyHeaders)}`,
          );
        }
        if (modifyBody) {
          response.appendResponseLine(
            `- Modify Body: ${modifyBody.substring(0, 100)}...`,
          );
        }
      }
      if (action === 'mock' && mockResponse) {
        response.appendResponseLine(`- Mock Status: ${mockResponse.status}`);
        response.appendResponseLine(
          `- Mock Body: ${mockResponse.body.substring(0, 100)}...`,
        );
        if (delay > 0) {
          response.appendResponseLine(`- Delay: ${delay}ms`);
        }
      }
      response.appendResponseLine('');
      response.appendResponseLine(
        `Use stop_interceptor(interceptId: "${id}") to stop.`,
      );
      response.appendResponseLine(
        `Use list_interceptors to see stats and active interceptors.`,
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Stop a request interceptor.
 */
export const stopInterceptor = defineTool({
  name: 'stop_interceptor',
  description: 'Stops a request interceptor.',
  annotations: {
    title: 'Stop Interceptor',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    interceptId: zod.string().describe('The interceptor ID to stop.'),
  },
  handler: async (request, response, context) => {
    const debugger_ = context.debuggerContext;
    const {interceptId} = request.params;

    const client = debugger_.getClient();
    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      const page = context.getSelectedPage();

      // Get stats before removing
      const stats = await page.evaluate(
        `
        const interceptor = window.__mcp_interceptors__ && window.__mcp_interceptors__[${JSON.stringify(interceptId)}];
        if (interceptor) {
          delete window.__mcp_interceptors__[${JSON.stringify(interceptId)}];
          interceptor.stats;
        } else {
          null;
        }
      `,
      );

      if (!stats) {
        response.appendResponseLine(`❌ Interceptor not found: ${interceptId}`);
        return;
      }

      // Disable Fetch domain if no more interceptors
      const hasMore = await page.evaluate(
        `Object.keys(window.__mcp_interceptors__ || {}).length > 0`,
      );
      if (!hasMore) {
        try {
          await client.send('Fetch.disable');
        } catch {
          // Ignore errors
        }
      }

      response.appendResponseLine(`✅ Interceptor "${interceptId}" stopped.`);
      response.appendResponseLine(`Stats:`);
      response.appendResponseLine(
        `  - Matched: ${(stats as {matched: number}).matched}`,
      );
      response.appendResponseLine(
        `  - Modified: ${(stats as {modified: number}).modified}`,
      );
      response.appendResponseLine(
        `  - Blocked: ${(stats as {blocked: number}).blocked}`,
      );
      response.appendResponseLine(
        `  - Mocked: ${(stats as {mocked: number}).mocked}`,
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * List active interceptors.
 */
export const listInterceptors = defineTool({
  name: 'list_interceptors',
  description: 'Lists all active request interceptors and their stats.',
  annotations: {
    title: 'List Interceptors',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    try {
      const page = context.getSelectedPage();

      const interceptors = (await page.evaluate(`
        (function() {
          const arr = [];
          if (window.__mcp_interceptors__) {
            for (const [id, config] of Object.entries(window.__mcp_interceptors__)) {
              arr.push({
                id,
                urlPattern: config.urlPattern,
                action: config.action,
                active: config.active,
                stats: config.stats
              });
            }
          }
          return arr;
        })();
      `)) as Array<{
        id: string;
        urlPattern: string;
        action: string;
        active: boolean;
        stats: {
          matched: number;
          modified: number;
          blocked: number;
          mocked: number;
        };
      }>;

      if (!interceptors || interceptors.length === 0) {
        response.appendResponseLine(
          'No active interceptors. Use intercept_requests to start intercepting.',
        );
        return;
      }

      response.appendResponseLine(
        `Active interceptors (${interceptors.length}):\n`,
      );

      for (const i of interceptors) {
        response.appendResponseLine(`🔀 ${i.id}`);
        response.appendResponseLine(`   Pattern: ${i.urlPattern}`);
        response.appendResponseLine(
          `   Action: ${i.action}, Active: ${i.active}`,
        );
        response.appendResponseLine(
          `   Stats: ${i.stats.matched} matched, ${i.stats.modified} modified, ${i.stats.blocked} blocked, ${i.stats.mocked} mocked`,
        );
        response.appendResponseLine('');
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
