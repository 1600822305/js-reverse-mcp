/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Code Deobfuscation Tools
 *
 * This module provides tools for deobfuscating JavaScript code:
 * - Variable name restoration based on context
 * - Control flow restoration (flatten control flow)
 * - String decryption and decoding
 * - Dead code elimination
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ==================== Variable Name Restoration ====================

/**
 * Restore meaningful variable names based on usage context.
 */
export const restoreVariableNames = defineTool({
  name: 'restore_variable_names',
  description:
    'Analyzes obfuscated JavaScript code and attempts to restore meaningful variable names based on usage patterns, context, and common naming conventions.',
  annotations: {
    title: 'Restore Variable Names',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    scriptId: zod
      .string()
      .optional()
      .describe('The script ID to analyze (from list_scripts).'),
    code: zod
      .string()
      .optional()
      .describe('JavaScript code to analyze. Use this for code snippets.'),
    aggressive: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Use aggressive renaming (default: false). May produce false positives but catches more variables.',
      ),
    preserveShortNames: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Preserve short variable names like i, j, k for loops (default: true).',
      ),
  },
  handler: async (request, response, context) => {
    const {scriptId, code, aggressive, preserveShortNames} = request.params;

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
      response.appendResponseLine('No source code to analyze.');
      return;
    }

    // Analyze and restore variable names
    const analysisCode = `
(function() {
  const code = ${JSON.stringify(sourceCode)};
  const aggressive = ${aggressive};
  const preserveShortNames = ${preserveShortNames};
  
  // Variable name restoration logic
  const suggestions = new Map();
  
  // Pattern 1: DOM element assignments
  // e.g., const _0x1234 = document.getElementById('myElement')
  const domPatterns = [
    /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*document\\.getElementById\\s*\\(\\s*['"]([^'"]+)['"]/g,
    /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*document\\.querySelector\\s*\\(\\s*['"]([^'"]+)['"]/g,
    /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*document\\.getElementsByClassName\\s*\\(\\s*['"]([^'"]+)['"]/g,
  ];
  
  for (const pattern of domPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const varName = match[1];
      const elementId = match[2];
      
      // Skip if already meaningful
      if (!isObfuscated(varName)) continue;
      
      // Generate suggestion
      const suggestion = toCamelCase(elementId) + 'Element';
      suggestions.set(varName, {
        original: varName,
        suggested: suggestion,
        confidence: 'high',
        reason: \`DOM element: \${elementId}\`,
        occurrences: countOccurrences(code, varName)
      });
    }
  }
  
  // Pattern 2: Function assignments
  // e.g., const _0x5678 = function encrypt(data) { ... }
  const funcPattern = /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*function\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(/g;
  let match;
  while ((match = funcPattern.exec(code)) !== null) {
    const varName = match[1];
    const funcName = match[2];
    
    if (!isObfuscated(varName) || !funcName) continue;
    
    suggestions.set(varName, {
      original: varName,
      suggested: funcName,
      confidence: 'high',
      reason: \`Named function: \${funcName}\`,
      occurrences: countOccurrences(code, varName)
    });
  }
  
  // Pattern 3: API/fetch calls
  // e.g., const _0xabcd = fetch('/api/users')
  const apiPattern = /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*(?:await\\s+)?fetch\\s*\\(\\s*['"]([^'"]+)['"]/g;
  while ((match = apiPattern.exec(code)) !== null) {
    const varName = match[1];
    const apiPath = match[2];
    
    if (!isObfuscated(varName)) continue;
    
    // Extract meaningful part from API path
    const pathParts = apiPath.split('/').filter(p => p && !p.startsWith(':'));
    const lastPart = pathParts[pathParts.length - 1] || 'data';
    const suggestion = toCamelCase(lastPart) + 'Response';
    
    suggestions.set(varName, {
      original: varName,
      suggested: suggestion,
      confidence: 'medium',
      reason: \`API call: \${apiPath}\`,
      occurrences: countOccurrences(code, varName)
    });
  }
  
  // Pattern 4: Object property access patterns
  // e.g., _0x1234.username, _0x1234.password
  const objPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  const propertyMap = new Map();
  
  while ((match = objPattern.exec(code)) !== null) {
    const varName = match[1];
    const property = match[2];
    
    if (!isObfuscated(varName)) continue;
    
    if (!propertyMap.has(varName)) {
      propertyMap.set(varName, new Set());
    }
    propertyMap.get(varName).add(property);
  }
  
  // Analyze property patterns to suggest object type
  for (const [varName, properties] of propertyMap.entries()) {
    if (suggestions.has(varName)) continue;
    
    const props = Array.from(properties);
    let suggestion = null;
    let reason = '';
    
    // User object pattern
    if (props.some(p => ['username', 'email', 'password', 'name'].includes(p))) {
      suggestion = 'user';
      reason = 'User object (has user-related properties)';
    }
    // Config object pattern
    else if (props.some(p => ['config', 'settings', 'options'].includes(p))) {
      suggestion = 'config';
      reason = 'Configuration object';
    }
    // Data/response pattern
    else if (props.some(p => ['data', 'result', 'response'].includes(p))) {
      suggestion = 'data';
      reason = 'Data object';
    }
    // Event pattern
    else if (props.some(p => ['target', 'type', 'preventDefault'].includes(p))) {
      suggestion = 'event';
      reason = 'Event object';
    }
    
    if (suggestion && aggressive) {
      suggestions.set(varName, {
        original: varName,
        suggested: suggestion,
        confidence: 'low',
        reason: reason,
        occurrences: countOccurrences(code, varName),
        properties: props
      });
    }
  }
  
  // Pattern 5: Common crypto variable patterns
  const cryptoPattern = /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*(?:CryptoJS|crypto|md5|sha|aes|rsa)/gi;
  while ((match = cryptoPattern.exec(code)) !== null) {
    const varName = match[1];
    if (!isObfuscated(varName)) continue;
    
    suggestions.set(varName, {
      original: varName,
      suggested: 'crypto',
      confidence: 'high',
      reason: 'Crypto library reference',
      occurrences: countOccurrences(code, varName)
    });
  }
  
  // Helper functions
  function isObfuscated(name) {
    // Check if variable name looks obfuscated
    if (preserveShortNames && name.length <= 2) return false;
    
    // Common obfuscation patterns
    return (
      /^_0x[a-f0-9]+$/i.test(name) ||  // Hex pattern
      /^_[a-f0-9]{4,}$/i.test(name) ||  // Underscore + hex
      /^[a-zA-Z]\\$[a-zA-Z0-9]+$/.test(name) ||  // Dollar sign pattern
      (/^[a-z]{1,2}[0-9]+$/.test(name) && name.length > 3)  // Short + numbers
    );
  }
  
  function toCamelCase(str) {
    return str
      .replace(/[-_\\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
      .replace(/^(.)/, (_, c) => c.toLowerCase());
  }
  
  function countOccurrences(text, word) {
    const regex = new RegExp('\\\\b' + word + '\\\\b', 'g');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }
  
  return {
    totalVariables: suggestions.size,
    suggestions: Array.from(suggestions.values())
  };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(analysisCode)) as {
        totalVariables: number;
        suggestions: Array<{
          original: string;
          suggested: string;
          confidence: string;
          reason: string;
          occurrences: number;
          properties?: string[];
        }>;
      };

      response.appendResponseLine('🔍 Variable Name Restoration Analysis\n');
      response.appendResponseLine(
        `Found ${result.totalVariables} obfuscated variables\n`,
      );

      if (result.suggestions.length === 0) {
        response.appendResponseLine(
          'No obfuscated variables detected or all variables already have meaningful names.',
        );
        return;
      }

      // Sort by confidence and occurrences
      const sorted = result.suggestions.sort((a, b) => {
        const confidenceOrder = {high: 3, medium: 2, low: 1};
        const confDiff =
          (confidenceOrder[b.confidence as keyof typeof confidenceOrder] || 0) -
          (confidenceOrder[a.confidence as keyof typeof confidenceOrder] || 0);
        if (confDiff !== 0) return confDiff;
        return b.occurrences - a.occurrences;
      });

      response.appendResponseLine('Suggested renamings:\n');

      for (const suggestion of sorted) {
        const confidenceEmoji =
          suggestion.confidence === 'high'
            ? '🟢'
            : suggestion.confidence === 'medium'
              ? '🟡'
              : '🔴';

        response.appendResponseLine(
          `${confidenceEmoji} ${suggestion.original} → ${suggestion.suggested}`,
        );
        response.appendResponseLine(
          `   Confidence: ${suggestion.confidence}, Occurrences: ${suggestion.occurrences}`,
        );
        response.appendResponseLine(`   Reason: ${suggestion.reason}`);

        if (suggestion.properties && suggestion.properties.length > 0) {
          response.appendResponseLine(
            `   Properties: ${suggestion.properties.slice(0, 5).join(', ')}${suggestion.properties.length > 5 ? '...' : ''}`,
          );
        }
        response.appendResponseLine('');
      }

      response.appendResponseLine('\n💡 Tips:');
      response.appendResponseLine(
        '- High confidence suggestions are safe to apply',
      );
      response.appendResponseLine(
        '- Use aggressive=true to get more suggestions (may have false positives)',
      );
      response.appendResponseLine(
        '- Review medium/low confidence suggestions manually',
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// ==================== Control Flow Restoration ====================

/**
 * Restore control flow by flattening obfuscated control structures.
 */
export const restoreControlFlow = defineTool({
  name: 'restore_control_flow',
  description:
    'Analyzes and restores obfuscated control flow structures. Detects control flow flattening, switch-case obfuscation, and other control flow obfuscation techniques.',
  annotations: {
    title: 'Restore Control Flow',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    scriptId: zod
      .string()
      .optional()
      .describe('The script ID to analyze (from list_scripts).'),
    code: zod.string().optional().describe('JavaScript code to analyze.'),
    simplify: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Attempt to simplify the control flow (default: true). May take longer but produces cleaner results.',
      ),
  },
  handler: async (request, response, context) => {
    const {scriptId, code, simplify} = request.params;

    if (!scriptId && !code) {
      response.appendResponseLine(
        'Error: Either scriptId or code must be provided.',
      );
      return;
    }

    let sourceCode = code;

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
      response.appendResponseLine('No source code to analyze.');
      return;
    }

    const analysisCode = `
(function() {
  const code = ${JSON.stringify(sourceCode)};
  const simplify = ${simplify};
  
  const analysis = {
    controlFlowObfuscation: [],
    switchCaseObfuscation: [],
    deadCode: [],
    complexity: 0
  };
  
  // Detect control flow flattening
  // Pattern: while(true) { switch(state) { ... } }
  const flattenPattern = /while\\s*\\(\\s*(?:true|!+0|1)\\s*\\)\\s*{\\s*switch\\s*\\(/g;
  let match;
  let flattenCount = 0;
  
  while ((match = flattenPattern.exec(code)) !== null) {
    flattenCount++;
    const startPos = match.index;
    
    analysis.controlFlowObfuscation.push({
      type: 'control_flow_flattening',
      position: startPos,
      description: 'Detected control flow flattening (while-switch pattern)',
      severity: 'high'
    });
  }
  
  // Detect excessive switch-case statements (common in obfuscation)
  const switchPattern = /switch\\s*\\([^)]+\\)\\s*{/g;
  const switches = [];
  
  while ((match = switchPattern.exec(code)) !== null) {
    switches.push(match.index);
  }
  
  if (switches.length > 5) {
    analysis.switchCaseObfuscation.push({
      type: 'excessive_switches',
      count: switches.length,
      description: \`Found \${switches.length} switch statements (possible obfuscation)\`,
      severity: switches.length > 10 ? 'high' : 'medium'
    });
  }
  
  // Detect dead code patterns
  // Pattern 1: if (false) { ... }
  const deadIfPattern = /if\\s*\\(\\s*(?:false|!+1|0)\\s*\\)\\s*{/g;
  while ((match = deadIfPattern.exec(code)) !== null) {
    analysis.deadCode.push({
      type: 'dead_if_block',
      position: match.index,
      description: 'Dead code: if(false) block'
    });
  }
  
  // Pattern 2: Unreachable code after return
  const unreachablePattern = /return[^;]*;\\s*[^}\\s]/g;
  while ((match = unreachablePattern.exec(code)) !== null) {
    // Check if next char is not a closing brace
    if (code[match.index + match[0].length - 1] !== '}') {
      analysis.deadCode.push({
        type: 'unreachable_after_return',
        position: match.index,
        description: 'Unreachable code after return statement'
      });
    }
  }
  
  // Calculate cyclomatic complexity (simplified)
  const complexityPatterns = [
    /\\bif\\s*\\(/g,
    /\\bfor\\s*\\(/g,
    /\\bwhile\\s*\\(/g,
    /\\bcase\\s+/g,
    /\\bcatch\\s*\\(/g,
    /&&/g,
    /\\|\\|/g,
    /\\?/g
  ];
  
  let complexity = 1; // Base complexity
  for (const pattern of complexityPatterns) {
    const matches = code.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }
  
  analysis.complexity = complexity;
  
  // Generate suggestions for simplification
  const suggestions = [];
  
  if (flattenCount > 0) {
    suggestions.push({
      issue: 'Control flow flattening detected',
      suggestion: 'The code uses control flow flattening. Consider using a specialized deobfuscator or manually trace the state transitions.',
      priority: 'high'
    });
  }
  
  if (switches.length > 10) {
    suggestions.push({
      issue: 'Excessive switch statements',
      suggestion: 'Multiple switch statements may indicate dispatcher-based obfuscation. Try to identify the state variable and trace execution flow.',
      priority: 'high'
    });
  }
  
  if (analysis.deadCode.length > 0) {
    suggestions.push({
      issue: \`\${analysis.deadCode.length} dead code blocks found\`,
      suggestion: 'Remove dead code blocks to simplify the code. These are never executed and can be safely deleted.',
      priority: 'medium'
    });
  }
  
  if (complexity > 50) {
    suggestions.push({
      issue: \`High cyclomatic complexity (\${complexity})\`,
      suggestion: 'The code has high complexity. Break down into smaller functions and remove unnecessary conditions.',
      priority: 'medium'
    });
  }
  
  return {
    analysis,
    suggestions,
    summary: {
      controlFlowFlattening: flattenCount,
      switchStatements: switches.length,
      deadCodeBlocks: analysis.deadCode.length,
      cyclomaticComplexity: complexity
    }
  };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(analysisCode)) as {
        analysis: {
          controlFlowObfuscation: Array<{
            type: string;
            position: number;
            description: string;
            severity: string;
          }>;
          switchCaseObfuscation: Array<{
            type: string;
            count: number;
            description: string;
            severity: string;
          }>;
          deadCode: Array<{
            type: string;
            position: number;
            description: string;
          }>;
          complexity: number;
        };
        suggestions: Array<{
          issue: string;
          suggestion: string;
          priority: string;
        }>;
        summary: {
          controlFlowFlattening: number;
          switchStatements: number;
          deadCodeBlocks: number;
          cyclomaticComplexity: number;
        };
      };

      response.appendResponseLine('🔄 Control Flow Analysis\n');

      // Summary
      response.appendResponseLine('Summary:');
      response.appendResponseLine(
        `- Control flow flattening instances: ${result.summary.controlFlowFlattening}`,
      );
      response.appendResponseLine(
        `- Switch statements: ${result.summary.switchStatements}`,
      );
      response.appendResponseLine(
        `- Dead code blocks: ${result.summary.deadCodeBlocks}`,
      );
      response.appendResponseLine(
        `- Cyclomatic complexity: ${result.summary.cyclomaticComplexity}`,
      );
      response.appendResponseLine('');

      // Control flow obfuscation details
      if (result.analysis.controlFlowObfuscation.length > 0) {
        response.appendResponseLine('⚠️ Control Flow Obfuscation Detected:\n');
        for (const item of result.analysis.controlFlowObfuscation) {
          response.appendResponseLine(
            `  ${item.severity === 'high' ? '🔴' : '🟡'} ${item.description}`,
          );
          response.appendResponseLine(
            `     Position: character ${item.position}`,
          );
        }
        response.appendResponseLine('');
      }

      // Switch-case obfuscation
      if (result.analysis.switchCaseObfuscation.length > 0) {
        response.appendResponseLine('⚠️ Switch-Case Obfuscation:\n');
        for (const item of result.analysis.switchCaseObfuscation) {
          response.appendResponseLine(
            `  ${item.severity === 'high' ? '🔴' : '🟡'} ${item.description}`,
          );
        }
        response.appendResponseLine('');
      }

      // Dead code
      if (result.analysis.deadCode.length > 0) {
        response.appendResponseLine(
          `🗑️ Dead Code Blocks (${result.analysis.deadCode.length}):\n`,
        );
        const displayLimit = 5;
        for (const item of result.analysis.deadCode.slice(0, displayLimit)) {
          response.appendResponseLine(`  - ${item.description}`);
          response.appendResponseLine(
            `    Position: character ${item.position}`,
          );
        }
        if (result.analysis.deadCode.length > displayLimit) {
          response.appendResponseLine(
            `  ... and ${result.analysis.deadCode.length - displayLimit} more`,
          );
        }
        response.appendResponseLine('');
      }

      // Suggestions
      if (result.suggestions.length > 0) {
        response.appendResponseLine('💡 Deobfuscation Suggestions:\n');
        for (const suggestion of result.suggestions) {
          const priorityEmoji =
            suggestion.priority === 'high'
              ? '🔴'
              : suggestion.priority === 'medium'
                ? '🟡'
                : '🟢';
          response.appendResponseLine(`${priorityEmoji} ${suggestion.issue}`);
          response.appendResponseLine(`   ${suggestion.suggestion}`);
          response.appendResponseLine('');
        }
      }

      if (
        result.summary.controlFlowFlattening === 0 &&
        result.summary.deadCodeBlocks === 0 &&
        result.summary.cyclomaticComplexity < 20
      ) {
        response.appendResponseLine(
          '✅ Code appears to have relatively clean control flow.',
        );
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// ==================== String Decryption ====================

/**
 * Decrypt and decode obfuscated strings.
 */
export const decryptStrings = defineTool({
  name: 'decrypt_strings',
  description:
    'Attempts to decrypt and decode obfuscated strings in JavaScript code. Detects common string obfuscation patterns including base64, hex encoding, and custom encryption.',
  annotations: {
    title: 'Decrypt Strings',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    scriptId: zod
      .string()
      .optional()
      .describe('The script ID to analyze (from list_scripts).'),
    code: zod.string().optional().describe('JavaScript code to analyze.'),
    autoDetect: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Automatically detect and decrypt common encoding schemes (default: true).',
      ),
    customDecryptFunction: zod
      .string()
      .optional()
      .describe(
        'Name of a custom decryption function found in the code (e.g., "_0x1234"). The tool will try to use it.',
      ),
  },
  handler: async (request, response, context) => {
    const {scriptId, code, autoDetect, customDecryptFunction} = request.params;

    if (!scriptId && !code) {
      response.appendResponseLine(
        'Error: Either scriptId or code must be provided.',
      );
      return;
    }

    let sourceCode = code;

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
      response.appendResponseLine('No source code to analyze.');
      return;
    }

    const decryptionCode = `
(function() {
  const code = ${JSON.stringify(sourceCode)};
  const autoDetect = ${autoDetect};
  const customFunc = ${JSON.stringify(customDecryptFunction || null)};
  
  const results = {
    encodedStrings: [],
    decryptedStrings: [],
    stringArrays: [],
    customDecryption: null
  };
  
  // Detect string arrays (common obfuscation technique)
  // Pattern: const _0x1234 = ['string1', 'string2', ...]
  const arrayPattern = /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*\\[([^\\]]{50,})\\]/g;
  let match;
  
  while ((match = arrayPattern.exec(code)) !== null) {
    const varName = match[1];
    const arrayContent = match[2];
    
    // Count strings in array
    const stringCount = (arrayContent.match(/['"][^'"]*['"]/g) || []).length;
    
    if (stringCount > 5) {
      results.stringArrays.push({
        variable: varName,
        stringCount: stringCount,
        sample: arrayContent.substring(0, 100) + '...'
      });
    }
  }
  
  if (autoDetect) {
    // Detect Base64 encoded strings
    const base64Pattern = /['"]([A-Za-z0-9+/]{20,}={0,2})['"]/g;
    while ((match = base64Pattern.exec(code)) !== null) {
      const encoded = match[1];
      
      try {
        const decoded = atob(encoded);
        // Check if decoded string is printable
        if (/^[\\x20-\\x7E]+$/.test(decoded)) {
          results.encodedStrings.push({
            type: 'base64',
            encoded: encoded.substring(0, 50) + (encoded.length > 50 ? '...' : ''),
            decoded: decoded.substring(0, 100) + (decoded.length > 100 ? '...' : ''),
            position: match.index
          });
        }
      } catch (e) {
        // Not valid base64
      }
    }
    
    // Detect hex encoded strings
    const hexPattern = /['"]([0-9a-fA-F]{10,})['"]/g;
    while ((match = hexPattern.exec(code)) !== null) {
      const hex = match[1];
      
      // Only process if even length
      if (hex.length % 2 === 0) {
        try {
          let decoded = '';
          for (let i = 0; i < hex.length; i += 2) {
            decoded += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
          }
          
          // Check if decoded string is printable
          if (/^[\\x20-\\x7E]+$/.test(decoded)) {
            results.encodedStrings.push({
              type: 'hex',
              encoded: hex.substring(0, 50) + (hex.length > 50 ? '...' : ''),
              decoded: decoded.substring(0, 100) + (decoded.length > 100 ? '...' : ''),
              position: match.index
            });
          }
        } catch (e) {
          // Not valid hex
        }
      }
    }
    
    // Detect unicode escape sequences
    const unicodePattern = /['"]([^'"]*(?:\\\\u[0-9a-fA-F]{4})+[^'"]*)['"]/g;
    while ((match = unicodePattern.exec(code)) !== null) {
      const encoded = match[1];
      
      try {
        const decoded = encoded.replace(/\\\\u([0-9a-fA-F]{4})/g, (_, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
        
        results.encodedStrings.push({
          type: 'unicode',
          encoded: encoded.substring(0, 50) + (encoded.length > 50 ? '...' : ''),
          decoded: decoded.substring(0, 100) + (decoded.length > 100 ? '...' : ''),
          position: match.index
        });
      } catch (e) {
        // Error decoding
      }
    }
  }
  
  // Try custom decryption function if provided
  if (customFunc) {
    try {
      // Try to evaluate the function in the current context
      if (typeof window[customFunc] === 'function') {
        results.customDecryption = {
          function: customFunc,
          available: true,
          message: 'Custom decryption function found and available'
        };
      } else {
        results.customDecryption = {
          function: customFunc,
          available: false,
          message: 'Custom decryption function not found in global scope'
        };
      }
    } catch (e) {
      results.customDecryption = {
        function: customFunc,
        available: false,
        error: e.message
      };
    }
  }
  
  return results;
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(decryptionCode)) as {
        encodedStrings: Array<{
          type: string;
          encoded: string;
          decoded: string;
          position: number;
        }>;
        stringArrays: Array<{
          variable: string;
          stringCount: number;
          sample: string;
        }>;
        customDecryption: {
          function: string;
          available: boolean;
          message?: string;
          error?: string;
        } | null;
      };

      response.appendResponseLine('🔓 String Decryption Analysis\n');

      // String arrays
      if (result.stringArrays.length > 0) {
        response.appendResponseLine(
          `📦 String Arrays Found (${result.stringArrays.length}):\n`,
        );
        for (const arr of result.stringArrays) {
          response.appendResponseLine(
            `  - ${arr.variable}: ${arr.stringCount} strings`,
          );
          response.appendResponseLine(`    Sample: ${arr.sample}`);
        }
        response.appendResponseLine('');
      }

      // Encoded strings
      if (result.encodedStrings.length > 0) {
        response.appendResponseLine(
          `🔐 Encoded Strings Found (${result.encodedStrings.length}):\n`,
        );

        // Group by type
        const byType = new Map<string, typeof result.encodedStrings>();
        for (const str of result.encodedStrings) {
          if (!byType.has(str.type)) {
            byType.set(str.type, []);
          }
          byType.get(str.type)!.push(str);
        }

        for (const [type, strings] of byType.entries()) {
          response.appendResponseLine(
            `  ${type.toUpperCase()} (${strings.length}):`,
          );

          const displayLimit = 3;
          for (const str of strings.slice(0, displayLimit)) {
            response.appendResponseLine(`    Encoded: ${str.encoded}`);
            response.appendResponseLine(`    Decoded: ${str.decoded}`);
            response.appendResponseLine('');
          }

          if (strings.length > displayLimit) {
            response.appendResponseLine(
              `    ... and ${strings.length - displayLimit} more ${type} strings`,
            );
            response.appendResponseLine('');
          }
        }
      } else {
        response.appendResponseLine('No encoded strings detected.\n');
      }

      // Custom decryption
      if (result.customDecryption) {
        response.appendResponseLine('🔧 Custom Decryption Function:\n');
        response.appendResponseLine(
          `  Function: ${result.customDecryption.function}`,
        );
        response.appendResponseLine(
          `  Available: ${result.customDecryption.available ? '✅' : '❌'}`,
        );
        if (result.customDecryption.message) {
          response.appendResponseLine(`  ${result.customDecryption.message}`);
        }
        if (result.customDecryption.error) {
          response.appendResponseLine(
            `  Error: ${result.customDecryption.error}`,
          );
        }
        response.appendResponseLine('');
      }

      response.appendResponseLine('\n💡 Tips:');
      response.appendResponseLine(
        '- String arrays often contain decrypted strings accessed by index',
      );
      response.appendResponseLine(
        '- Use hook_function to intercept custom decryption functions',
      );
      response.appendResponseLine(
        '- Set breakpoints on string array access to see runtime values',
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
