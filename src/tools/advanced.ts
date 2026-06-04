/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Advanced JS Reverse Engineering Tools
 *
 * This module provides code beautification. Network interception and
 * WebSocket monitoring now live in the CDP-native NetworkManager tools under
 * `src/tools/network/`.
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
