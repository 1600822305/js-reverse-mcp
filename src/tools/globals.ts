/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global Variable Monitoring Tools
 *
 * Tools for monitoring and analyzing global variables in JavaScript:
 * - List all global variables
 * - Watch specific variable changes
 * - Compare global state before/after operations
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * List all global variables on window object.
 */
export const listGlobals = defineTool({
  name: 'list_globals',
  description:
    'Lists all global variables on the window object, excluding built-in browser APIs. Useful for finding custom variables, configs, tokens, and encryption functions.',
  annotations: {
    title: 'List Global Variables',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    filter: zod
      .string()
      .optional()
      .describe(
        'Filter variables by name (case-insensitive partial match). E.g., "token", "encrypt", "config".',
      ),
    includeBuiltins: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to include built-in browser objects like document, navigator, etc. (default: false).',
      ),
    maxDepth: zod
      .number()
      .int()
      .optional()
      .default(1)
      .describe('Maximum depth to inspect object values (default: 1).'),
    showFunctions: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to show function type variables (default: true).'),
  },
  handler: async (request, response, context) => {
    const {filter, includeBuiltins, maxDepth, showFunctions} = request.params;

    const listCode = `
(function() {
  const filter = ${JSON.stringify(filter || '')}.toLowerCase();
  const includeBuiltins = ${includeBuiltins};
  const maxDepth = ${maxDepth};
  const showFunctions = ${showFunctions};
  
  // Built-in browser globals to exclude by default
  const builtins = new Set([
    'window', 'self', 'document', 'location', 'navigator', 'screen', 'history',
    'localStorage', 'sessionStorage', 'indexedDB', 'caches',
    'console', 'performance', 'crypto', 'fetch', 'XMLHttpRequest',
    'WebSocket', 'Worker', 'SharedWorker', 'ServiceWorker',
    'Blob', 'File', 'FileReader', 'FormData', 'URL', 'URLSearchParams',
    'AbortController', 'AbortSignal', 'Headers', 'Request', 'Response',
    'Event', 'CustomEvent', 'EventTarget', 'MessageChannel', 'MessagePort',
    'Promise', 'Proxy', 'Reflect', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet',
    'Array', 'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Float32Array',
    'Object', 'Function', 'Boolean', 'Number', 'String', 'RegExp', 'Date', 'Error',
    'JSON', 'Math', 'Intl', 'Atomics', 'SharedArrayBuffer', 'BigInt',
    'alert', 'confirm', 'prompt', 'print', 'open', 'close',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
    'queueMicrotask', 'atob', 'btoa', 'escape', 'unescape',
    'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
    'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt',
    'undefined', 'NaN', 'Infinity',
    'getComputedStyle', 'matchMedia', 'moveBy', 'moveTo', 'resizeBy', 'resizeTo',
    'scrollBy', 'scrollTo', 'scroll', 'focus', 'blur',
    'getSelection', 'find', 'stop',
    'postMessage', 'onmessage', 'onerror', 'onload', 'onunload',
    'frames', 'parent', 'top', 'opener', 'length', 'name', 'status',
    'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight',
    'screenX', 'screenY', 'screenLeft', 'screenTop', 'scrollX', 'scrollY',
    'pageXOffset', 'pageYOffset', 'devicePixelRatio',
    'visualViewport', 'speechSynthesis', 'caches', 'cookieStore',
    'origin', 'isSecureContext', 'crossOriginIsolated',
    'chrome', 'clientInformation', 'customElements', 'external',
    'trustedTypes', 'webkitRequestFileSystem', 'webkitResolveLocalFileSystemURL',
    // Common framework globals
    'jQuery', '$', 'React', 'ReactDOM', 'Vue', 'Angular', 'ng',
    '__REACT_DEVTOOLS_GLOBAL_HOOK__', '__VUE_DEVTOOLS_GLOBAL_HOOK__',
    // MCP internal
    '__mcp_hooks__', '__mcp_monitors__', '__mcp_ws_monitors__', '__mcp_interceptors__', '__mcp_mocks__'
  ]);
  
  // Function to inspect value
  function inspectValue(value, depth) {
    if (depth > maxDepth) return '[Max Depth]';
    if (value === null) return null;
    if (value === undefined) return undefined;
    
    const type = typeof value;
    
    if (type === 'function') {
      if (!showFunctions) return null;
      const name = value.name || 'anonymous';
      const str = value.toString();
      const preview = str.length > 100 ? str.substring(0, 100) + '...' : str;
      return { type: 'function', name, preview };
    }
    
    if (type !== 'object') {
      if (type === 'string' && value.length > 200) {
        return value.substring(0, 200) + '...';
      }
      return value;
    }
    
    if (Array.isArray(value)) {
      if (value.length > 10) {
        return { type: 'array', length: value.length, preview: value.slice(0, 5).map(v => inspectValue(v, depth + 1)) };
      }
      return value.map(v => inspectValue(v, depth + 1));
    }
    
    // Object
    if (value.constructor && value.constructor.name !== 'Object') {
      return { type: value.constructor.name, value: '[Object]' };
    }
    
    const keys = Object.keys(value);
    if (keys.length > 20) {
      const preview = {};
      keys.slice(0, 10).forEach(k => {
        preview[k] = inspectValue(value[k], depth + 1);
      });
      return { type: 'object', keys: keys.length, preview };
    }
    
    const result = {};
    keys.forEach(k => {
      result[k] = inspectValue(value[k], depth + 1);
    });
    return result;
  }
  
  const globals = [];
  const windowKeys = Object.keys(window);
  
  for (const key of windowKeys) {
    // Skip builtins unless requested
    if (!includeBuiltins && builtins.has(key)) continue;
    
    // Skip keys starting with common prefixes
    if (!includeBuiltins && (key.startsWith('webkit') || key.startsWith('on') || key.startsWith('HTML'))) continue;
    
    // Apply filter
    if (filter && !key.toLowerCase().includes(filter)) continue;
    
    try {
      const value = window[key];
      const type = typeof value;
      
      // Skip functions if not wanted
      if (type === 'function' && !showFunctions) continue;
      
      const inspected = inspectValue(value, 0);
      if (inspected === null) continue;
      
      globals.push({
        name: key,
        type: type,
        value: inspected
      });
    } catch(e) {
      globals.push({
        name: key,
        type: 'error',
        value: '[Access Error: ' + e.message + ']'
      });
    }
  }
  
  // Sort by type then name
  globals.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    // Functions first, then objects, then primitives
    const order = { 'function': 0, 'object': 1, 'string': 2, 'number': 3, 'boolean': 4 };
    return (order[a.type] || 5) - (order[b.type] || 5);
  });
  
  return { count: globals.length, globals };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(listCode)) as {
        count: number;
        globals: Array<{name: string; type: string; value: unknown}>;
      };

      if (result.count === 0) {
        response.appendResponseLine(
          'No custom global variables found.' +
            (filter ? ` (filter: "${filter}")` : ''),
        );
        return;
      }

      response.appendResponseLine(
        `Found ${result.count} global variable(s)${filter ? ` matching "${filter}"` : ''}:\n`,
      );

      // Group by type
      const functions = result.globals.filter(g => g.type === 'function');
      const objects = result.globals.filter(g => g.type === 'object');
      const primitives = result.globals.filter(
        g => g.type !== 'function' && g.type !== 'object',
      );

      if (functions.length > 0) {
        response.appendResponseLine(`📦 Functions (${functions.length}):`);
        for (const g of functions) {
          const val = g.value as {name: string; preview: string};
          response.appendResponseLine(`  - window.${g.name}`);
          if (val.preview) {
            const preview = val.preview.split('\n')[0];
            response.appendResponseLine(`    ${preview}`);
          }
        }
        response.appendResponseLine('');
      }

      if (objects.length > 0) {
        response.appendResponseLine(`📁 Objects (${objects.length}):`);
        for (const g of objects) {
          response.appendResponseLine(`  - window.${g.name}`);
          const valStr = JSON.stringify(g.value, null, 2);
          if (valStr.length < 200) {
            response.appendResponseLine(
              `    ${valStr.replace(/\n/g, '\n    ')}`,
            );
          } else {
            response.appendResponseLine(
              `    ${valStr.substring(0, 200).replace(/\n/g, '\n    ')}...`,
            );
          }
        }
        response.appendResponseLine('');
      }

      if (primitives.length > 0) {
        response.appendResponseLine(`📝 Primitives (${primitives.length}):`);
        for (const g of primitives) {
          const valStr =
            typeof g.value === 'string' ? `"${g.value}"` : String(g.value);
          response.appendResponseLine(
            `  - window.${g.name} = ${valStr.substring(0, 100)}`,
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
 * Watch a global variable for changes.
 */
export const watchGlobal = defineTool({
  name: 'watch_global',
  description:
    'Watches a global variable for changes. When the variable is modified, logs the old and new values to console.',
  annotations: {
    title: 'Watch Global Variable',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    variableName: zod
      .string()
      .describe(
        'The name of the global variable to watch (e.g., "token", "appConfig.apiKey").',
      ),
    watchId: zod
      .string()
      .optional()
      .describe('Custom ID for this watcher. Defaults to variable name.'),
    logStack: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to log the call stack when variable changes (default: true).',
      ),
  },
  handler: async (request, response, context) => {
    const {variableName, watchId, logStack} = request.params;
    const id = watchId || variableName.replace(/[^a-zA-Z0-9]/g, '_');

    const watchCode = `
(function() {
  const varName = ${JSON.stringify(variableName)};
  const watchId = ${JSON.stringify(id)};
  const logStack = ${logStack};
  
  window.__mcp_watchers__ = window.__mcp_watchers__ || {};
  
  if (window.__mcp_watchers__[watchId]) {
    return { success: false, message: 'Watcher already exists: ' + watchId };
  }
  
  // Parse variable path (e.g., "config.api.key" -> ["config", "api", "key"])
  const parts = varName.split('.');
  const propName = parts.pop();
  let target = window;
  
  // Navigate to parent object
  for (const part of parts) {
    if (target[part] === undefined) {
      return { success: false, message: 'Path not found: ' + parts.join('.') };
    }
    target = target[part];
  }
  
  if (typeof target !== 'object' || target === null) {
    return { success: false, message: 'Target is not an object' };
  }
  
  // Store current value
  const originalValue = target[propName];
  const originalDescriptor = Object.getOwnPropertyDescriptor(target, propName);
  
  // Create getter/setter
  let currentValue = originalValue;
  let changeCount = 0;
  
  Object.defineProperty(target, propName, {
    configurable: true,
    enumerable: originalDescriptor ? originalDescriptor.enumerable : true,
    get() {
      return currentValue;
    },
    set(newValue) {
      const oldValue = currentValue;
      currentValue = newValue;
      changeCount++;
      
      const changeInfo = {
        watcher: watchId,
        variable: varName,
        changeNumber: changeCount,
        timestamp: new Date().toISOString(),
        oldValue: oldValue,
        newValue: newValue,
        oldType: typeof oldValue,
        newType: typeof newValue
      };
      
      if (logStack) {
        changeInfo.stack = new Error().stack?.split('\\n').slice(2, 8).map(s => s.trim());
      }
      
      console.log('[MCP Watch]', changeInfo);
    }
  });
  
  window.__mcp_watchers__[watchId] = {
    varName,
    target,
    propName,
    originalDescriptor,
    originalValue,
    getChangeCount: () => changeCount
  };
  
  return { 
    success: true, 
    watchId,
    currentValue: typeof originalValue === 'function' ? '[Function]' : 
                  typeof originalValue === 'object' ? JSON.stringify(originalValue).substring(0, 200) :
                  originalValue
  };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = await page.evaluate(watchCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          const r = result as {watchId: string; currentValue: unknown};
          response.appendResponseLine(`✅ Watcher installed successfully!`);
          response.appendResponseLine(`- Watch ID: ${r.watchId}`);
          response.appendResponseLine(`- Variable: ${variableName}`);
          response.appendResponseLine(
            `- Current Value: ${JSON.stringify(r.currentValue)}`,
          );
          response.appendResponseLine(`- Log Stack: ${logStack}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            'Variable changes will be logged to console. Use list_console_messages to view.',
          );
          response.appendResponseLine(
            `Use unwatch_global(watchId: "${r.watchId}") to stop watching.`,
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
 * Stop watching a global variable.
 */
export const unwatchGlobal = defineTool({
  name: 'unwatch_global',
  description:
    'Stops watching a global variable and restores original behavior.',
  annotations: {
    title: 'Unwatch Global Variable',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    watchId: zod.string().describe('The watcher ID to remove.'),
  },
  handler: async (request, response, context) => {
    const {watchId} = request.params;

    const unwatchCode = `
(function() {
  const watchId = ${JSON.stringify(watchId)};
  
  if (!window.__mcp_watchers__ || !window.__mcp_watchers__[watchId]) {
    return { success: false, message: 'Watcher not found: ' + watchId };
  }
  
  const watcher = window.__mcp_watchers__[watchId];
  const { target, propName, originalDescriptor, originalValue } = watcher;
  const changeCount = watcher.getChangeCount();
  
  // Restore original property
  if (originalDescriptor) {
    Object.defineProperty(target, propName, originalDescriptor);
  } else {
    delete target[propName];
    target[propName] = originalValue;
  }
  
  delete window.__mcp_watchers__[watchId];
  
  return { success: true, changeCount };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = await page.evaluate(unwatchCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          const r = result as {changeCount: number};
          response.appendResponseLine(`✅ Watcher "${watchId}" removed.`);
          response.appendResponseLine(
            `- Total changes detected: ${r.changeCount}`,
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
 * List all active watchers.
 */
export const listWatchers = defineTool({
  name: 'list_watchers',
  description: 'Lists all active global variable watchers.',
  annotations: {
    title: 'List Watchers',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const listCode = `
(function() {
  if (!window.__mcp_watchers__) return [];
  
  return Object.entries(window.__mcp_watchers__).map(([id, w]) => ({
    id,
    variable: w.varName,
    changeCount: w.getChangeCount()
  }));
})();
`;

    try {
      const page = context.getSelectedPage();
      const watchers = (await page.evaluate(listCode)) as Array<{
        id: string;
        variable: string;
        changeCount: number;
      }>;

      if (!watchers || watchers.length === 0) {
        response.appendResponseLine(
          'No active watchers. Use watch_global to start watching a variable.',
        );
        return;
      }

      response.appendResponseLine(`Active watchers (${watchers.length}):\n`);
      for (const w of watchers) {
        response.appendResponseLine(`👁️ ${w.id}`);
        response.appendResponseLine(`   Variable: ${w.variable}`);
        response.appendResponseLine(`   Changes detected: ${w.changeCount}`);
        response.appendResponseLine('');
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Take a snapshot of global variables for later comparison.
 */
export const snapshotGlobals = defineTool({
  name: 'snapshot_globals',
  description:
    'Takes a snapshot of current global variables for later comparison with diff_globals. Useful for finding what changed after an action (e.g., login, button click).',
  annotations: {
    title: 'Snapshot Globals',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    snapshotId: zod
      .string()
      .optional()
      .default('default')
      .describe('ID for this snapshot (default: "default").'),
  },
  handler: async (request, response, context) => {
    const {snapshotId} = request.params;

    const snapshotCode = `
(function() {
  const snapshotId = ${JSON.stringify(snapshotId)};
  
  window.__mcp_snapshots__ = window.__mcp_snapshots__ || {};
  
  // Built-ins to skip
  const skip = new Set([
    'window', 'self', 'document', 'location', 'navigator', 'screen', 'history',
    'localStorage', 'sessionStorage', 'console', 'performance', 'crypto',
    'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker',
    '__mcp_hooks__', '__mcp_monitors__', '__mcp_ws_monitors__', 
    '__mcp_interceptors__', '__mcp_mocks__', '__mcp_watchers__', '__mcp_snapshots__'
  ]);
  
  const snapshot = {};
  let count = 0;
  
  for (const key of Object.keys(window)) {
    if (skip.has(key)) continue;
    if (key.startsWith('webkit') || key.startsWith('on') || key.startsWith('HTML')) continue;
    
    try {
      const value = window[key];
      const type = typeof value;
      
      // Skip functions for snapshot (usually too big)
      if (type === 'function') {
        snapshot[key] = { type: 'function', name: value.name || 'anonymous' };
      } else if (type === 'object' && value !== null) {
        try {
          // Try to serialize, limit size
          const str = JSON.stringify(value);
          if (str.length < 10000) {
            snapshot[key] = JSON.parse(str);
          } else {
            snapshot[key] = { type: 'object', size: str.length, keys: Object.keys(value).slice(0, 20) };
          }
        } catch(e) {
          snapshot[key] = { type: value.constructor?.name || 'object', error: 'not serializable' };
        }
      } else {
        snapshot[key] = value;
      }
      count++;
    } catch(e) {
      // Skip inaccessible
    }
  }
  
  window.__mcp_snapshots__[snapshotId] = {
    timestamp: new Date().toISOString(),
    data: snapshot,
    count
  };
  
  return { success: true, snapshotId, count };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(snapshotCode)) as {
        success: boolean;
        snapshotId: string;
        count: number;
      };

      response.appendResponseLine(
        `✅ Snapshot "${result.snapshotId}" created!`,
      );
      response.appendResponseLine(`- Variables captured: ${result.count}`);
      response.appendResponseLine('');
      response.appendResponseLine(
        'Now perform an action (e.g., click a button, submit a form), then use diff_globals to see what changed.',
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Compare current globals with a previous snapshot.
 */
export const diffGlobals = defineTool({
  name: 'diff_globals',
  description:
    'Compares current global variables with a previous snapshot. Shows added, removed, and changed variables. Use after snapshot_globals to find what changed.',
  annotations: {
    title: 'Diff Globals',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    snapshotId: zod
      .string()
      .optional()
      .default('default')
      .describe('ID of the snapshot to compare with (default: "default").'),
    showUnchanged: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to show unchanged variables (default: false).'),
  },
  handler: async (request, response, context) => {
    const {snapshotId, showUnchanged} = request.params;

    const diffCode = `
(function() {
  const snapshotId = ${JSON.stringify(snapshotId)};
  const showUnchanged = ${showUnchanged};
  
  if (!window.__mcp_snapshots__ || !window.__mcp_snapshots__[snapshotId]) {
    return { error: 'Snapshot not found: ' + snapshotId + '. Use snapshot_globals first.' };
  }
  
  const snapshot = window.__mcp_snapshots__[snapshotId];
  const oldData = snapshot.data;
  
  // Built-ins to skip
  const skip = new Set([
    'window', 'self', 'document', 'location', 'navigator', 'screen', 'history',
    'localStorage', 'sessionStorage', 'console', 'performance', 'crypto',
    'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker',
    '__mcp_hooks__', '__mcp_monitors__', '__mcp_ws_monitors__', 
    '__mcp_interceptors__', '__mcp_mocks__', '__mcp_watchers__', '__mcp_snapshots__'
  ]);
  
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  
  // Current state
  const currentKeys = new Set();
  for (const key of Object.keys(window)) {
    if (skip.has(key)) continue;
    if (key.startsWith('webkit') || key.startsWith('on') || key.startsWith('HTML')) continue;
    currentKeys.add(key);
    
    try {
      const value = window[key];
      const type = typeof value;
      
      let currentVal;
      if (type === 'function') {
        currentVal = { type: 'function', name: value.name || 'anonymous' };
      } else if (type === 'object' && value !== null) {
        try {
          const str = JSON.stringify(value);
          if (str.length < 10000) {
            currentVal = JSON.parse(str);
          } else {
            currentVal = { type: 'object', size: str.length };
          }
        } catch(e) {
          currentVal = { type: value.constructor?.name || 'object' };
        }
      } else {
        currentVal = value;
      }
      
      if (!(key in oldData)) {
        added.push({ name: key, value: currentVal });
      } else {
        const oldVal = oldData[key];
        const oldStr = JSON.stringify(oldVal);
        const newStr = JSON.stringify(currentVal);
        
        if (oldStr !== newStr) {
          changed.push({ name: key, oldValue: oldVal, newValue: currentVal });
        } else if (showUnchanged) {
          unchanged.push({ name: key, value: currentVal });
        }
      }
    } catch(e) {
      // Skip
    }
  }
  
  // Check for removed
  for (const key of Object.keys(oldData)) {
    if (!currentKeys.has(key)) {
      removed.push({ name: key, value: oldData[key] });
    }
  }
  
  return {
    snapshotTimestamp: snapshot.timestamp,
    added,
    removed,
    changed,
    unchanged: showUnchanged ? unchanged : undefined,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length
    }
  };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(diffCode)) as {
        error?: string;
        snapshotTimestamp: string;
        added: Array<{name: string; value: unknown}>;
        removed: Array<{name: string; value: unknown}>;
        changed: Array<{name: string; oldValue: unknown; newValue: unknown}>;
        unchanged?: Array<{name: string; value: unknown}>;
        summary: {
          added: number;
          removed: number;
          changed: number;
          unchanged: number;
        };
      };

      if (result.error) {
        response.appendResponseLine(`❌ ${result.error}`);
        return;
      }

      response.appendResponseLine(
        `📊 Global Variables Diff (since ${result.snapshotTimestamp}):\n`,
      );
      response.appendResponseLine(
        `Summary: +${result.summary.added} added, -${result.summary.removed} removed, ~${result.summary.changed} changed`,
      );
      response.appendResponseLine('');

      if (result.added.length > 0) {
        response.appendResponseLine(`➕ Added (${result.added.length}):`);
        for (const item of result.added) {
          const valStr = JSON.stringify(item.value);
          response.appendResponseLine(
            `  - ${item.name} = ${valStr.substring(0, 100)}${valStr.length > 100 ? '...' : ''}`,
          );
        }
        response.appendResponseLine('');
      }

      if (result.removed.length > 0) {
        response.appendResponseLine(`➖ Removed (${result.removed.length}):`);
        for (const item of result.removed) {
          response.appendResponseLine(`  - ${item.name}`);
        }
        response.appendResponseLine('');
      }

      if (result.changed.length > 0) {
        response.appendResponseLine(`🔄 Changed (${result.changed.length}):`);
        for (const item of result.changed) {
          response.appendResponseLine(`  - ${item.name}:`);
          const oldStr = JSON.stringify(item.oldValue);
          const newStr = JSON.stringify(item.newValue);
          response.appendResponseLine(
            `    Before: ${oldStr.substring(0, 80)}${oldStr.length > 80 ? '...' : ''}`,
          );
          response.appendResponseLine(
            `    After:  ${newStr.substring(0, 80)}${newStr.length > 80 ? '...' : ''}`,
          );
        }
        response.appendResponseLine('');
      }

      if (
        result.summary.added === 0 &&
        result.summary.removed === 0 &&
        result.summary.changed === 0
      ) {
        response.appendResponseLine('No changes detected since snapshot.');
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
