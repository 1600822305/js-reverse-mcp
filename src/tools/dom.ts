/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DOM Breakpoint Tools
 *
 * Tools for setting DOM-related breakpoints:
 * - Break on DOM subtree modifications
 * - Break on attribute changes
 * - Break on node removal
 * - Monitor form submissions
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Set a breakpoint on DOM subtree modifications.
 */
export const breakOnSubtreeModified = defineTool({
  name: 'break_on_subtree_modified',
  description:
    'Sets a breakpoint that triggers when the DOM subtree of an element is modified (child added/removed). Useful for tracking dynamic content changes.',
  annotations: {
    title: 'Break on Subtree Modified',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    selector: zod
      .string()
      .describe(
        'CSS selector for the element to monitor (e.g., "#container", ".form-wrapper", "body").',
      ),
  },
  handler: async (request, response, context) => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const {selector} = request.params;
    const client = debugger_.getClient();

    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      // Enable DOM domain
      await client.send('DOM.enable');

      // Get document
      const {root} = await client.send('DOM.getDocument');

      // Find element by selector
      const {nodeId} = await client.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      });

      if (!nodeId) {
        response.appendResponseLine(`❌ Element not found: ${selector}`);
        return;
      }

      // Set DOM breakpoint
      await client.send('DOMDebugger.setDOMBreakpoint', {
        nodeId,
        type: 'subtree-modified',
      });

      response.appendResponseLine(`✅ DOM breakpoint set!`);
      response.appendResponseLine(`- Selector: ${selector}`);
      response.appendResponseLine(`- Type: Subtree Modified`);
      response.appendResponseLine(`- Node ID: ${nodeId}`);
      response.appendResponseLine('');
      response.appendResponseLine(
        'Debugger will pause when child nodes are added/removed.',
      );
      response.appendResponseLine(
        `Use remove_dom_breakpoint(selector: "${selector}", type: "subtree-modified") to remove.`,
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Set a breakpoint on attribute modifications.
 */
export const breakOnAttributeModified = defineTool({
  name: 'break_on_attribute_modified',
  description:
    'Sets a breakpoint that triggers when any attribute of an element is modified. Useful for tracking hidden field changes, class modifications, etc.',
  annotations: {
    title: 'Break on Attribute Modified',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    selector: zod
      .string()
      .describe(
        'CSS selector for the element to monitor (e.g., "input[name=token]", "#hidden-field").',
      ),
  },
  handler: async (request, response, context) => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const {selector} = request.params;
    const client = debugger_.getClient();

    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      await client.send('DOM.enable');
      const {root} = await client.send('DOM.getDocument');
      const {nodeId} = await client.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      });

      if (!nodeId) {
        response.appendResponseLine(`❌ Element not found: ${selector}`);
        return;
      }

      await client.send('DOMDebugger.setDOMBreakpoint', {
        nodeId,
        type: 'attribute-modified',
      });

      response.appendResponseLine(`✅ DOM breakpoint set!`);
      response.appendResponseLine(`- Selector: ${selector}`);
      response.appendResponseLine(`- Type: Attribute Modified`);
      response.appendResponseLine(`- Node ID: ${nodeId}`);
      response.appendResponseLine('');
      response.appendResponseLine(
        'Debugger will pause when element attributes are changed.',
      );
      response.appendResponseLine(
        `Use remove_dom_breakpoint(selector: "${selector}", type: "attribute-modified") to remove.`,
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Set a breakpoint on node removal.
 */
export const breakOnNodeRemoved = defineTool({
  name: 'break_on_node_removed',
  description:
    'Sets a breakpoint that triggers when an element is about to be removed from the DOM.',
  annotations: {
    title: 'Break on Node Removed',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    selector: zod.string().describe('CSS selector for the element to monitor.'),
  },
  handler: async (request, response, context) => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const {selector} = request.params;
    const client = debugger_.getClient();

    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      await client.send('DOM.enable');
      const {root} = await client.send('DOM.getDocument');
      const {nodeId} = await client.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      });

      if (!nodeId) {
        response.appendResponseLine(`❌ Element not found: ${selector}`);
        return;
      }

      await client.send('DOMDebugger.setDOMBreakpoint', {
        nodeId,
        type: 'node-removed',
      });

      response.appendResponseLine(`✅ DOM breakpoint set!`);
      response.appendResponseLine(`- Selector: ${selector}`);
      response.appendResponseLine(`- Type: Node Removed`);
      response.appendResponseLine(`- Node ID: ${nodeId}`);
      response.appendResponseLine('');
      response.appendResponseLine(
        'Debugger will pause when this element is about to be removed.',
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Remove a DOM breakpoint.
 */
export const removeDomBreakpoint = defineTool({
  name: 'remove_dom_breakpoint',
  description: 'Removes a DOM breakpoint from an element.',
  annotations: {
    title: 'Remove DOM Breakpoint',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    selector: zod.string().describe('CSS selector for the element.'),
    type: zod
      .enum(['subtree-modified', 'attribute-modified', 'node-removed'])
      .describe('Type of DOM breakpoint to remove.'),
  },
  handler: async (request, response, context) => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const {selector, type} = request.params;
    const client = debugger_.getClient();

    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      await client.send('DOM.enable');
      const {root} = await client.send('DOM.getDocument');
      const {nodeId} = await client.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      });

      if (!nodeId) {
        response.appendResponseLine(`❌ Element not found: ${selector}`);
        return;
      }

      await client.send('DOMDebugger.removeDOMBreakpoint', {
        nodeId,
        type,
      });

      response.appendResponseLine(
        `✅ DOM breakpoint removed: ${selector} [${type}]`,
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Monitor form submissions.
 */
export const monitorFormSubmit = defineTool({
  name: 'monitor_form_submit',
  description:
    'Monitors form submissions to capture form data before it is sent. Useful for analyzing login forms and finding encryption of passwords.',
  annotations: {
    title: 'Monitor Form Submit',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    selector: zod
      .string()
      .optional()
      .default('form')
      .describe(
        'CSS selector for the form(s) to monitor (default: all forms).',
      ),
    preventDefault: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to prevent form submission (for analysis only). Default: false.',
      ),
    monitorId: zod
      .string()
      .optional()
      .default('form_monitor')
      .describe('Custom ID for this monitor.'),
  },
  handler: async (request, response, context) => {
    const {selector, preventDefault, monitorId} = request.params;

    const monitorCode = `
(function() {
  const selector = ${JSON.stringify(selector)};
  const preventDefault = ${preventDefault};
  const monitorId = ${JSON.stringify(monitorId)};
  
  window.__mcp_form_monitors__ = window.__mcp_form_monitors__ || {};
  
  if (window.__mcp_form_monitors__[monitorId]) {
    return { success: false, message: 'Form monitor already exists: ' + monitorId };
  }
  
  const forms = document.querySelectorAll(selector);
  if (forms.length === 0) {
    return { success: false, message: 'No forms found matching: ' + selector };
  }
  
  const handlers = [];
  
  forms.forEach((form, index) => {
    const handler = function(e) {
      const formData = {};
      const formElements = form.elements;
      
      for (let i = 0; i < formElements.length; i++) {
        const el = formElements[i];
        if (el.name) {
          formData[el.name] = {
            value: el.value,
            type: el.type || 'text',
            tagName: el.tagName.toLowerCase()
          };
          
          // For password fields, also try to capture original value before encryption
          if (el.type === 'password') {
            formData[el.name].originalValue = el.value;
          }
        }
      }
      
      const submitInfo = {
        monitor: monitorId,
        event: 'submit',
        timestamp: new Date().toISOString(),
        form: {
          id: form.id || '(no id)',
          name: form.name || '(no name)',
          action: form.action,
          method: form.method || 'GET',
          index: index
        },
        formData: formData,
        stack: new Error().stack?.split('\\n').slice(2, 8).map(s => s.trim())
      };
      
      console.log('[MCP Form Submit]', submitInfo);
      
      if (preventDefault) {
        e.preventDefault();
        console.log('[MCP Form Submit] Form submission prevented for analysis');
      }
    };
    
    form.addEventListener('submit', handler, true);
    handlers.push({ form, handler });
  });
  
  window.__mcp_form_monitors__[monitorId] = {
    selector,
    handlers,
    formCount: forms.length
  };
  
  return { success: true, monitorId, formCount: forms.length };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = await page.evaluate(monitorCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          const r = result as {monitorId: string; formCount: number};
          response.appendResponseLine(`✅ Form monitor started!`);
          response.appendResponseLine(`- Monitor ID: ${r.monitorId}`);
          response.appendResponseLine(`- Forms monitored: ${r.formCount}`);
          response.appendResponseLine(`- Selector: ${selector}`);
          response.appendResponseLine(
            `- Prevent submission: ${preventDefault}`,
          );
          response.appendResponseLine('');
          response.appendResponseLine(
            'Form submissions will be logged to console with all field values.',
          );
          response.appendResponseLine(
            'Use list_console_messages to view captured submissions.',
          );
          if (preventDefault) {
            response.appendResponseLine('');
            response.appendResponseLine(
              '⚠️ Form submission is being prevented. Data is captured but not sent.',
            );
          }
          response.appendResponseLine(
            `Use stop_form_monitor(monitorId: "${r.monitorId}") to stop.`,
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
 * Stop monitoring form submissions.
 */
export const stopFormMonitor = defineTool({
  name: 'stop_form_monitor',
  description: 'Stops monitoring form submissions.',
  annotations: {
    title: 'Stop Form Monitor',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    monitorId: zod
      .string()
      .optional()
      .default('form_monitor')
      .describe('The monitor ID to stop.'),
  },
  handler: async (request, response, context) => {
    const {monitorId} = request.params;

    const stopCode = `
(function() {
  const monitorId = ${JSON.stringify(monitorId)};
  
  if (!window.__mcp_form_monitors__ || !window.__mcp_form_monitors__[monitorId]) {
    return { success: false, message: 'Form monitor not found: ' + monitorId };
  }
  
  const monitor = window.__mcp_form_monitors__[monitorId];
  
  monitor.handlers.forEach(({ form, handler }) => {
    form.removeEventListener('submit', handler, true);
  });
  
  const formCount = monitor.formCount;
  delete window.__mcp_form_monitors__[monitorId];
  
  return { success: true, formCount };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = await page.evaluate(stopCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          const r = result as {formCount: number};
          response.appendResponseLine(
            `✅ Form monitor "${monitorId}" stopped.`,
          );
          response.appendResponseLine(
            `- Forms were being monitored: ${r.formCount}`,
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
 * Monitor input field changes.
 */
export const monitorInputChanges = defineTool({
  name: 'monitor_input_changes',
  description:
    'Monitors changes to input fields in real-time. Captures every keystroke and value change. Useful for tracking password field modifications before encryption.',
  annotations: {
    title: 'Monitor Input Changes',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    selector: zod
      .string()
      .optional()
      .default('input, textarea')
      .describe(
        'CSS selector for inputs to monitor (default: all inputs and textareas).',
      ),
    monitorId: zod
      .string()
      .optional()
      .default('input_monitor')
      .describe('Custom ID for this monitor.'),
    logKeystrokes: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to log individual keystrokes (verbose). Default: false.',
      ),
  },
  handler: async (request, response, context) => {
    const {selector, monitorId, logKeystrokes} = request.params;

    const monitorCode = `
(function() {
  const selector = ${JSON.stringify(selector)};
  const monitorId = ${JSON.stringify(monitorId)};
  const logKeystrokes = ${logKeystrokes};
  
  window.__mcp_input_monitors__ = window.__mcp_input_monitors__ || {};
  
  if (window.__mcp_input_monitors__[monitorId]) {
    return { success: false, message: 'Input monitor already exists: ' + monitorId };
  }
  
  const inputs = document.querySelectorAll(selector);
  if (inputs.length === 0) {
    return { success: false, message: 'No inputs found matching: ' + selector };
  }
  
  const handlers = [];
  
  inputs.forEach((input, index) => {
    // Track change events
    const changeHandler = function(e) {
      console.log('[MCP Input Change]', {
        monitor: monitorId,
        event: 'change',
        timestamp: new Date().toISOString(),
        input: {
          name: input.name || '(no name)',
          id: input.id || '(no id)',
          type: input.type || 'text',
          index: index
        },
        value: input.value,
        valueLength: input.value.length
      });
    };
    
    // Track input events (every character)
    const inputHandler = function(e) {
      console.log('[MCP Input]', {
        monitor: monitorId,
        event: 'input',
        timestamp: new Date().toISOString(),
        input: {
          name: input.name || '(no name)',
          id: input.id || '(no id)',
          type: input.type || 'text'
        },
        value: input.value,
        valueLength: input.value.length
      });
    };
    
    // Track keystrokes if requested
    const keyHandler = logKeystrokes ? function(e) {
      console.log('[MCP Keystroke]', {
        monitor: monitorId,
        event: 'keydown',
        timestamp: new Date().toISOString(),
        input: {
          name: input.name || '(no name)',
          type: input.type || 'text'
        },
        key: e.key,
        code: e.code,
        currentValue: input.value
      });
    } : null;
    
    // Track focus to know which field is active
    const focusHandler = function(e) {
      console.log('[MCP Input Focus]', {
        monitor: monitorId,
        event: 'focus',
        timestamp: new Date().toISOString(),
        input: {
          name: input.name || '(no name)',
          id: input.id || '(no id)',
          type: input.type || 'text',
          index: index
        },
        currentValue: input.value
      });
    };
    
    input.addEventListener('change', changeHandler, true);
    input.addEventListener('input', inputHandler, true);
    input.addEventListener('focus', focusHandler, true);
    if (keyHandler) {
      input.addEventListener('keydown', keyHandler, true);
    }
    
    handlers.push({ 
      input, 
      changeHandler, 
      inputHandler, 
      focusHandler,
      keyHandler 
    });
  });
  
  window.__mcp_input_monitors__[monitorId] = {
    selector,
    handlers,
    inputCount: inputs.length
  };
  
  return { success: true, monitorId, inputCount: inputs.length };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = await page.evaluate(monitorCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          const r = result as {monitorId: string; inputCount: number};
          response.appendResponseLine(`✅ Input monitor started!`);
          response.appendResponseLine(`- Monitor ID: ${r.monitorId}`);
          response.appendResponseLine(`- Inputs monitored: ${r.inputCount}`);
          response.appendResponseLine(`- Selector: ${selector}`);
          response.appendResponseLine(`- Log keystrokes: ${logKeystrokes}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            'Input changes will be logged to console.',
          );
          response.appendResponseLine(
            'Use list_console_messages to view captured changes.',
          );
          response.appendResponseLine(
            `Use stop_input_monitor(monitorId: "${r.monitorId}") to stop.`,
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
 * Stop monitoring input changes.
 */
export const stopInputMonitor = defineTool({
  name: 'stop_input_monitor',
  description: 'Stops monitoring input field changes.',
  annotations: {
    title: 'Stop Input Monitor',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    monitorId: zod
      .string()
      .optional()
      .default('input_monitor')
      .describe('The monitor ID to stop.'),
  },
  handler: async (request, response, context) => {
    const {monitorId} = request.params;

    const stopCode = `
(function() {
  const monitorId = ${JSON.stringify(monitorId)};
  
  if (!window.__mcp_input_monitors__ || !window.__mcp_input_monitors__[monitorId]) {
    return { success: false, message: 'Input monitor not found: ' + monitorId };
  }
  
  const monitor = window.__mcp_input_monitors__[monitorId];
  
  monitor.handlers.forEach(({ input, changeHandler, inputHandler, focusHandler, keyHandler }) => {
    input.removeEventListener('change', changeHandler, true);
    input.removeEventListener('input', inputHandler, true);
    input.removeEventListener('focus', focusHandler, true);
    if (keyHandler) {
      input.removeEventListener('keydown', keyHandler, true);
    }
  });
  
  const inputCount = monitor.inputCount;
  delete window.__mcp_input_monitors__[monitorId];
  
  return { success: true, inputCount };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = await page.evaluate(stopCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          const r = result as {inputCount: number};
          response.appendResponseLine(
            `✅ Input monitor "${monitorId}" stopped.`,
          );
          response.appendResponseLine(
            `- Inputs were being monitored: ${r.inputCount}`,
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
