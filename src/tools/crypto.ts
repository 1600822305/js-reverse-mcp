/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encryption Detection Tools
 *
 * Tools for detecting and analyzing encryption/encoding in JavaScript:
 * - Detect common encryption algorithms (page globals and/or script sources)
 * - Analyze encoded strings
 * - Hook common crypto library functions
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Detect encryption algorithms and crypto libraries in the page.
 */
export const detectEncryption = defineTool({
  name: 'detect_encryption',
  description:
    'Detects encryption algorithms, crypto libraries, and encoding methods. Set scope to scan runtime page globals, loaded script sources for crypto function definitions, or both (default).',
  annotations: {
    title: 'Detect Encryption',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    scope: zod
      .enum(['page', 'scripts', 'both'])
      .optional()
      .default('both')
      .describe(
        'What to scan: "page" = runtime global objects/patterns, "scripts" = crypto function definitions in loaded script sources, "both" = run both (default).',
      ),
    deep: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'For the page scan: perform deep scan including all object properties (slower but more thorough).',
      ),
    keywords: zod
      .array(zod.string())
      .optional()
      .describe(
        'For the scripts scan: custom keywords to search for. Defaults to common crypto terms.',
      ),
    maxResults: zod
      .number()
      .int()
      .optional()
      .default(30)
      .describe(
        'For the scripts scan: maximum number of results per keyword (default: 30).',
      ),
  },
  handler: async (request, response, context) => {
    const {deep, scope, keywords, maxResults} = request.params;
    const scanPage = scope !== 'scripts';
    const scanScripts = scope !== 'page';

    const detectCode = `
(function() {
  const deep = ${deep};
  const results = {
    libraries: [],
    algorithms: [],
    suspiciousFunctions: [],
    encodedStrings: []
  };
  
  // Known crypto library signatures
  const librarySignatures = {
    'CryptoJS': () => typeof window.CryptoJS !== 'undefined',
    'JSEncrypt': () => typeof window.JSEncrypt !== 'undefined',
    'jsrsasign': () => typeof window.KJUR !== 'undefined' || typeof window.KEYUTIL !== 'undefined',
    'forge': () => typeof window.forge !== 'undefined',
    'sjcl': () => typeof window.sjcl !== 'undefined',
    'aes-js': () => typeof window.aesjs !== 'undefined',
    'crypto-js (MD5)': () => typeof window.CryptoJS?.MD5 !== 'undefined',
    'crypto-js (SHA256)': () => typeof window.CryptoJS?.SHA256 !== 'undefined',
    'crypto-js (AES)': () => typeof window.CryptoJS?.AES !== 'undefined',
    'Web Crypto API': () => typeof window.crypto?.subtle !== 'undefined',
    'node-rsa': () => typeof window.NodeRSA !== 'undefined',
    'tweetnacl': () => typeof window.nacl !== 'undefined',
    'elliptic': () => typeof window.elliptic !== 'undefined',
    'bn.js': () => typeof window.BN !== 'undefined',
    'jsbn': () => typeof window.BigInteger !== 'undefined',
    'sm-crypto': () => typeof window.sm2 !== 'undefined' || typeof window.sm3 !== 'undefined' || typeof window.sm4 !== 'undefined',
    'js-md5': () => typeof window.md5 !== 'undefined' && typeof window.md5 === 'function',
    'js-sha256': () => typeof window.sha256 !== 'undefined',
    'base64-js': () => typeof window.base64js !== 'undefined',
    'Buffer': () => typeof window.Buffer !== 'undefined',
  };
  
  // Check for libraries
  for (const [name, check] of Object.entries(librarySignatures)) {
    try {
      if (check()) {
        results.libraries.push(name);
      }
    } catch(e) {}
  }
  
  // Scan for algorithm-related keywords in function names
  const cryptoKeywords = [
    'encrypt', 'decrypt', 'cipher', 'decipher',
    'hash', 'digest', 'hmac',
    'sign', 'verify', 'signature',
    'encode', 'decode', 'base64', 'hex',
    'md5', 'sha1', 'sha256', 'sha512', 'sha3',
    'aes', 'des', '3des', 'blowfish', 'rc4',
    'rsa', 'ecdsa', 'ecdh', 'dh', 'dsa',
    'pbkdf2', 'scrypt', 'bcrypt', 'argon2',
    'jwt', 'token', 'secret', 'key', 'iv', 'salt',
    'sm2', 'sm3', 'sm4', 'gm'
  ];
  
  // Scan window properties for crypto-related names
  const scannedObjects = new WeakSet();
  
  function scanObject(obj, path, depth) {
    if (depth > (deep ? 3 : 1)) return;
    if (!obj || typeof obj !== 'object') return;
    if (scannedObjects.has(obj)) return;
    scannedObjects.add(obj);
    
    try {
      const keys = Object.keys(obj);
      for (const key of keys) {
        const lowerKey = key.toLowerCase();
        
        // Check if key contains crypto keywords
        for (const keyword of cryptoKeywords) {
          if (lowerKey.includes(keyword)) {
            try {
              const value = obj[key];
              const type = typeof value;
              
              if (type === 'function') {
                const funcStr = value.toString();
                const preview = funcStr.length > 150 ? funcStr.substring(0, 150) + '...' : funcStr;
                results.suspiciousFunctions.push({
                  path: path + '.' + key,
                  keyword: keyword,
                  type: 'function',
                  preview: preview.split('\\n')[0]
                });
              } else if (type === 'object' && value !== null) {
                results.suspiciousFunctions.push({
                  path: path + '.' + key,
                  keyword: keyword,
                  type: value.constructor?.name || 'object',
                  keys: Object.keys(value).slice(0, 10)
                });
              }
            } catch(e) {}
            break;
          }
        }
        
        // Recurse into objects if deep scan
        if (deep) {
          try {
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
              scanObject(value, path + '.' + key, depth + 1);
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
  }
  
  // Scan window
  scanObject(window, 'window', 0);
  
  // Check for common algorithm patterns in code
  const algorithmPatterns = [
    { name: 'MD5', pattern: /\\bmd5\\b/i },
    { name: 'SHA-1', pattern: /\\bsha1\\b/i },
    { name: 'SHA-256', pattern: /\\bsha256\\b|\\bsha-256\\b/i },
    { name: 'SHA-512', pattern: /\\bsha512\\b|\\bsha-512\\b/i },
    { name: 'AES', pattern: /\\baes\\b/i },
    { name: 'DES', pattern: /\\bdes\\b|\\b3des\\b/i },
    { name: 'RSA', pattern: /\\brsa\\b/i },
    { name: 'HMAC', pattern: /\\bhmac\\b/i },
    { name: 'Base64', pattern: /\\bbase64\\b|\\batob\\b|\\bbtoa\\b/i },
    { name: 'JWT', pattern: /\\bjwt\\b|\\bjsonwebtoken\\b/i },
    { name: 'PBKDF2', pattern: /\\bpbkdf2\\b/i },
    { name: 'SM2/SM3/SM4 (Chinese)', pattern: /\\bsm[234]\\b/i },
  ];
  
  // Scan script content for patterns (simplified - check function bodies)
  for (const func of results.suspiciousFunctions) {
    if (func.preview) {
      for (const algo of algorithmPatterns) {
        if (algo.pattern.test(func.preview)) {
          if (!results.algorithms.includes(algo.name)) {
            results.algorithms.push(algo.name);
          }
        }
      }
    }
  }
  
  // Look for encoded strings (base64, hex patterns)
  function checkEncodedStrings() {
    const base64Pattern = /^[A-Za-z0-9+/]{20,}={0,2}$/;
    const hexPattern = /^[0-9a-fA-F]{32,}$/;
    const jwtPattern = /^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/;
    
    for (const key of Object.keys(window)) {
      try {
        const value = window[key];
        if (typeof value === 'string' && value.length > 20 && value.length < 10000) {
          if (jwtPattern.test(value)) {
            results.encodedStrings.push({ 
              path: 'window.' + key, 
              type: 'JWT', 
              preview: value.substring(0, 50) + '...',
              length: value.length
            });
          } else if (base64Pattern.test(value)) {
            results.encodedStrings.push({ 
              path: 'window.' + key, 
              type: 'Base64', 
              preview: value.substring(0, 50) + '...',
              length: value.length
            });
          } else if (hexPattern.test(value)) {
            results.encodedStrings.push({ 
              path: 'window.' + key, 
              type: 'Hex', 
              preview: value.substring(0, 50) + '...',
              length: value.length
            });
          }
        }
      } catch(e) {}
    }
  }
  
  checkEncodedStrings();
  
  // Dedupe and limit
  results.suspiciousFunctions = results.suspiciousFunctions.slice(0, 50);
  results.encodedStrings = results.encodedStrings.slice(0, 20);
  
  return results;
})();
`;

    if (scanPage) {
      try {
        const page = context.getSelectedPage();
        const result = (await page.evaluate(detectCode)) as {
          libraries: string[];
          algorithms: string[];
          suspiciousFunctions: Array<{
            path: string;
            keyword: string;
            type: string;
            preview?: string;
            keys?: string[];
          }>;
          encodedStrings: Array<{
            path: string;
            type: string;
            preview: string;
            length: number;
          }>;
        };

        response.appendResponseLine('🔐 Encryption Detection Results\n');

        // Libraries
        if (result.libraries.length > 0) {
          response.appendResponseLine(
            `📚 Detected Crypto Libraries (${result.libraries.length}):`,
          );
          for (const lib of result.libraries) {
            response.appendResponseLine(`  ✓ ${lib}`);
          }
          response.appendResponseLine('');
        } else {
          response.appendResponseLine(
            '📚 No known crypto libraries detected.\n',
          );
        }

        // Algorithms
        if (result.algorithms.length > 0) {
          response.appendResponseLine(
            `🔢 Detected Algorithms (${result.algorithms.length}):`,
          );
          response.appendResponseLine(`  ${result.algorithms.join(', ')}`);
          response.appendResponseLine('');
        }

        // Suspicious functions
        if (result.suspiciousFunctions.length > 0) {
          response.appendResponseLine(
            `🔍 Suspicious Functions/Objects (${result.suspiciousFunctions.length}):`,
          );
          for (const func of result.suspiciousFunctions.slice(0, 20)) {
            response.appendResponseLine(`  - ${func.path} [${func.keyword}]`);
            if (func.preview) {
              response.appendResponseLine(`    ${func.preview}`);
            }
            if (func.keys) {
              response.appendResponseLine(`    Keys: ${func.keys.join(', ')}`);
            }
          }
          if (result.suspiciousFunctions.length > 20) {
            response.appendResponseLine(
              `  ... and ${result.suspiciousFunctions.length - 20} more`,
            );
          }
          response.appendResponseLine('');
        }

        // Encoded strings
        if (result.encodedStrings.length > 0) {
          response.appendResponseLine(
            `📝 Encoded Strings Found (${result.encodedStrings.length}):`,
          );
          for (const str of result.encodedStrings) {
            response.appendResponseLine(
              `  - ${str.path} [${str.type}, ${str.length} chars]`,
            );
            response.appendResponseLine(`    ${str.preview}`);
          }
          response.appendResponseLine('');
        }

        // Summary
        const hasFindings =
          result.libraries.length > 0 ||
          result.suspiciousFunctions.length > 0 ||
          result.encodedStrings.length > 0;

        if (!hasFindings) {
          response.appendResponseLine('No obvious encryption patterns found.');
          response.appendResponseLine(
            'Try: search_in_sources with patterns like "encrypt", "sign", "hash"',
          );
        } else {
          response.appendResponseLine('💡 Tips:');
          response.appendResponseLine(
            '  - Use hook_function to monitor calls to suspicious functions',
          );
          response.appendResponseLine(
            '  - Use set_breakpoint_on_text to debug encryption code',
          );
          response.appendResponseLine(
            '  - Use inspect_object to examine crypto library structure',
          );
        }
      } catch (error) {
        response.appendResponseLine(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (scanScripts) {
      const debugger_ = context.debuggerContext;
      if (!debugger_.isEnabled()) {
        response.appendResponseLine('');
        response.appendResponseLine(
          'ℹ️ Script source scan skipped: debugger not enabled (select a page first).',
        );
        return;
      }

      const searchKeywords = keywords || [
        'encrypt',
        'decrypt',
        'sign',
        'verify',
        'hash',
        'md5',
        'sha',
        'aes',
        'rsa',
        'cipher',
        'hmac',
        'pbkdf',
        'token',
        'secret',
      ];

      const allResults: Array<{
        keyword: string;
        scriptId: string;
        url: string;
        lineNumber: number;
        preview: string;
      }> = [];

      response.appendResponseLine('');
      response.appendResponseLine(
        '🔍 Searching script sources for crypto-related functions...\n',
      );

      for (const keyword of searchKeywords) {
        try {
          const patterns = [
            `function.*${keyword}`,
            `${keyword}.*=.*function`,
            `${keyword}.*=>`,
            `\\.${keyword}\\s*=`,
          ];

          for (const pattern of patterns) {
            const result = await debugger_.searchInScripts(pattern, {
              caseSensitive: false,
              isRegex: true,
            });

            for (const match of result.matches.slice(0, maxResults)) {
              if (match.lineContent.length > 500) continue;

              const exists = allResults.some(
                r =>
                  r.scriptId === match.scriptId &&
                  r.lineNumber === match.lineNumber,
              );
              if (exists) continue;

              allResults.push({
                keyword,
                scriptId: match.scriptId,
                url: match.url || '(inline)',
                lineNumber: match.lineNumber,
                preview: match.lineContent.trim().substring(0, 150),
              });
            }
          }
        } catch {
          // Continue with other keywords
        }
      }

      if (allResults.length === 0) {
        response.appendResponseLine(
          'No crypto-related functions found in scripts.',
        );
        return;
      }

      const byUrl: Record<string, typeof allResults> = {};
      for (const r of allResults) {
        const key = r.url;
        if (!byUrl[key]) byUrl[key] = [];
        byUrl[key].push(r);
      }

      response.appendResponseLine(
        `Found ${allResults.length} potential crypto function(s):\n`,
      );

      for (const [url, matches] of Object.entries(byUrl)) {
        const shortUrl =
          url.length > 60 ? '...' + url.substring(url.length - 57) : url;
        response.appendResponseLine(`📄 ${shortUrl}`);

        for (const m of matches.slice(0, 10)) {
          response.appendResponseLine(
            `   Line ${m.lineNumber + 1} [${m.keyword}]: ${m.preview}`,
          );
        }
        if (matches.length > 10) {
          response.appendResponseLine(`   ... and ${matches.length - 10} more`);
        }
        response.appendResponseLine('');
      }

      response.appendResponseLine('💡 Tips:');
      response.appendResponseLine(
        '  - Use get_script_source(scriptId, startLine, endLine) to see full context',
      );
      response.appendResponseLine(
        '  - Use set_breakpoint to debug specific functions',
      );
      response.appendResponseLine(
        '  - Use hook_function to monitor function calls',
      );
    }
  },
});

/**
 * Analyze a potentially encoded string.
 */
export const analyzeEncodedString = defineTool({
  name: 'analyze_encoded_string',
  description:
    'Analyzes a string to detect its encoding type (Base64, Hex, JWT, URL encoding, etc.) and attempts to decode it.',
  annotations: {
    title: 'Analyze Encoded String',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    input: zod.string().describe('The encoded string to analyze.'),
    tryDecode: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to attempt decoding (default: true).'),
  },
  handler: async (request, response, context) => {
    const {input, tryDecode} = request.params;

    const analyzeCode = `
(function() {
  const input = ${JSON.stringify(input)};
  const tryDecode = ${tryDecode};
  
  const results = {
    input: input.substring(0, 200) + (input.length > 200 ? '...' : ''),
    length: input.length,
    detectedTypes: [],
    decoded: {}
  };
  
  // Patterns
  const patterns = {
    'Base64': /^[A-Za-z0-9+/]+={0,2}$/,
    'Base64URL': /^[A-Za-z0-9_-]+$/,
    'Hex': /^[0-9a-fA-F]+$/,
    'JWT': /^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/,
    'URL Encoded': /%[0-9A-Fa-f]{2}/,
    'Unicode Escaped': /\\\\u[0-9A-Fa-f]{4}/,
    'MD5 Hash': /^[a-fA-F0-9]{32}$/,
    'SHA-1 Hash': /^[a-fA-F0-9]{40}$/,
    'SHA-256 Hash': /^[a-fA-F0-9]{64}$/,
    'UUID': /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  };
  
  // Check patterns
  for (const [name, pattern] of Object.entries(patterns)) {
    if (pattern.test(input)) {
      results.detectedTypes.push(name);
    }
  }
  
  // Additional checks
  if (input.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(input)) {
    results.detectedTypes.push('Likely Base64');
  }
  
  // Try decoding
  if (tryDecode) {
    // Base64
    if (results.detectedTypes.some(t => t.includes('Base64'))) {
      try {
        const decoded = atob(input.replace(/-/g, '+').replace(/_/g, '/'));
        // Check if result is printable
        if (/^[\\x20-\\x7E\\s]+$/.test(decoded)) {
          results.decoded.base64 = decoded.substring(0, 500);
        } else {
          // Try to show as hex
          let hex = '';
          for (let i = 0; i < Math.min(decoded.length, 50); i++) {
            hex += decoded.charCodeAt(i).toString(16).padStart(2, '0') + ' ';
          }
          results.decoded.base64_hex = hex.trim();
        }
      } catch(e) {
        results.decoded.base64_error = e.message;
      }
    }
    
    // JWT
    if (results.detectedTypes.includes('JWT')) {
      try {
        const parts = input.split('.');
        const header = JSON.parse(atob(parts[0]));
        const payload = JSON.parse(atob(parts[1]));
        results.decoded.jwt = { header, payload };
      } catch(e) {
        results.decoded.jwt_error = e.message;
      }
    }
    
    // Hex
    if (results.detectedTypes.includes('Hex') && input.length <= 1000) {
      try {
        let decoded = '';
        for (let i = 0; i < input.length; i += 2) {
          decoded += String.fromCharCode(parseInt(input.substr(i, 2), 16));
        }
        if (/^[\\x20-\\x7E\\s]+$/.test(decoded)) {
          results.decoded.hex = decoded.substring(0, 500);
        }
      } catch(e) {}
    }
    
    // URL decode
    if (results.detectedTypes.includes('URL Encoded')) {
      try {
        results.decoded.url = decodeURIComponent(input).substring(0, 500);
      } catch(e) {
        results.decoded.url_error = e.message;
      }
    }
    
    // Unicode unescape
    if (results.detectedTypes.includes('Unicode Escaped')) {
      try {
        results.decoded.unicode = input.replace(/\\\\u([0-9A-Fa-f]{4})/g, 
          (m, g) => String.fromCharCode(parseInt(g, 16))).substring(0, 500);
      } catch(e) {}
    }
  }
  
  // Entropy analysis (for detecting encryption)
  function calculateEntropy(str) {
    const freq = {};
    for (const c of str) {
      freq[c] = (freq[c] || 0) + 1;
    }
    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }
  
  results.entropy = calculateEntropy(input).toFixed(2);
  results.entropyAnalysis = 
    results.entropy > 5.5 ? 'High entropy - likely encrypted/compressed' :
    results.entropy > 4 ? 'Medium entropy - possibly encoded' :
    'Low entropy - likely plain text or simple encoding';
  
  return results;
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(analyzeCode)) as {
        input: string;
        length: number;
        detectedTypes: string[];
        decoded: Record<string, unknown>;
        entropy: string;
        entropyAnalysis: string;
      };

      response.appendResponseLine('🔍 String Analysis Results\n');
      response.appendResponseLine(`Input: ${result.input}`);
      response.appendResponseLine(`Length: ${result.length} characters`);
      response.appendResponseLine('');

      response.appendResponseLine(`📊 Entropy: ${result.entropy} bits/char`);
      response.appendResponseLine(`   ${result.entropyAnalysis}`);
      response.appendResponseLine('');

      if (result.detectedTypes.length > 0) {
        response.appendResponseLine('🏷️ Detected Types:');
        for (const type of result.detectedTypes) {
          response.appendResponseLine(`  ✓ ${type}`);
        }
        response.appendResponseLine('');
      } else {
        response.appendResponseLine(
          '🏷️ No specific encoding pattern detected.\n',
        );
      }

      if (Object.keys(result.decoded).length > 0) {
        response.appendResponseLine('📝 Decoded Results:');
        for (const [type, value] of Object.entries(result.decoded)) {
          if (type.endsWith('_error')) {
            response.appendResponseLine(
              `  ❌ ${type.replace('_error', '')}: ${value}`,
            );
          } else {
            response.appendResponseLine(`  ✓ ${type}:`);
            if (typeof value === 'object') {
              response.appendResponseLine(
                `    ${JSON.stringify(value, null, 2).replace(/\n/g, '\n    ')}`,
              );
            } else {
              response.appendResponseLine(`    ${value}`);
            }
          }
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
 * Hook common encryption functions automatically.
 */
export const hookCryptoFunctions = defineTool({
  name: 'hook_crypto_functions',
  description:
    'Automatically hooks common crypto library functions to log encryption/decryption calls. Supports CryptoJS, JSEncrypt, Web Crypto API, and more.',
  annotations: {
    title: 'Hook Crypto Functions',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    libraries: zod
      .array(zod.enum(['CryptoJS', 'JSEncrypt', 'WebCrypto', 'all']))
      .optional()
      .default(['all'])
      .describe(
        'Which libraries to hook. Options: CryptoJS, JSEncrypt, WebCrypto, all',
      ),
  },
  handler: async (request, response, context) => {
    const {libraries} = request.params;
    const hookAll = libraries.includes('all');

    const hookCode = `
(function() {
  const hookAll = ${hookAll};
  const libraries = ${JSON.stringify(libraries)};
  const hooked = [];
  
  window.__mcp_crypto_hooks__ = window.__mcp_crypto_hooks__ || {};
  
  function hookMethod(obj, path, methodName, label) {
    if (!obj || typeof obj[methodName] !== 'function') return false;
    
    const hookId = label + '.' + methodName;
    if (window.__mcp_crypto_hooks__[hookId]) return false;
    
    const original = obj[methodName];
    
    obj[methodName] = function(...args) {
      const callInfo = {
        hook: 'crypto',
        method: label + '.' + methodName,
        timestamp: new Date().toISOString(),
        arguments: args.map(arg => {
          if (typeof arg === 'string') return arg.length > 200 ? arg.substring(0, 200) + '...' : arg;
          if (arg?.words) return '[WordArray]'; // CryptoJS
          if (arg instanceof ArrayBuffer) return '[ArrayBuffer:' + arg.byteLength + ']';
          if (arg instanceof Uint8Array) return '[Uint8Array:' + arg.length + ']';
          try {
            return JSON.stringify(arg).substring(0, 200);
          } catch(e) {
            return String(arg);
          }
        }),
        stack: new Error().stack?.split('\\n').slice(2, 6).map(s => s.trim())
      };
      
      console.log('[MCP Crypto]', callInfo);
      
      const result = original.apply(this, args);
      
      // Log result
      if (result && typeof result.then === 'function') {
        return result.then(res => {
          let resStr;
          if (res instanceof ArrayBuffer) resStr = '[ArrayBuffer:' + res.byteLength + ']';
          else if (res instanceof Uint8Array) resStr = '[Uint8Array:' + res.length + ']';
          else if (res?.words) resStr = res.toString ? res.toString() : '[WordArray]';
          else resStr = String(res).substring(0, 200);
          
          console.log('[MCP Crypto Result]', { method: callInfo.method, result: resStr });
          return res;
        });
      }
      
      let resStr;
      if (result?.words) resStr = result.toString ? result.toString().substring(0, 200) : '[WordArray]';
      else if (result?.ciphertext) resStr = result.toString().substring(0, 200);
      else resStr = String(result).substring(0, 200);
      
      console.log('[MCP Crypto Result]', { method: callInfo.method, result: resStr });
      
      return result;
    };
    
    window.__mcp_crypto_hooks__[hookId] = { obj, methodName, original };
    hooked.push(hookId);
    return true;
  }
  
  // Hook CryptoJS
  if ((hookAll || libraries.includes('CryptoJS')) && window.CryptoJS) {
    const crypto = window.CryptoJS;
    
    // Hash functions
    ['MD5', 'SHA1', 'SHA256', 'SHA512', 'SHA3', 'RIPEMD160'].forEach(name => {
      if (crypto[name]) hookMethod(crypto, 'CryptoJS', name, 'CryptoJS');
    });
    
    // Encryption
    ['AES', 'DES', 'TripleDES', 'RC4', 'Rabbit', 'RabbitLegacy'].forEach(name => {
      if (crypto[name]) {
        hookMethod(crypto[name], 'CryptoJS.' + name, 'encrypt', 'CryptoJS.' + name);
        hookMethod(crypto[name], 'CryptoJS.' + name, 'decrypt', 'CryptoJS.' + name);
      }
    });
    
    // HMAC
    if (crypto.HmacMD5) hookMethod(crypto, 'CryptoJS', 'HmacMD5', 'CryptoJS');
    if (crypto.HmacSHA256) hookMethod(crypto, 'CryptoJS', 'HmacSHA256', 'CryptoJS');
    
    // Encoders
    if (crypto.enc) {
      ['Base64', 'Hex', 'Utf8'].forEach(name => {
        if (crypto.enc[name]) {
          hookMethod(crypto.enc[name], 'CryptoJS.enc.' + name, 'stringify', 'CryptoJS.enc.' + name);
          hookMethod(crypto.enc[name], 'CryptoJS.enc.' + name, 'parse', 'CryptoJS.enc.' + name);
        }
      });
    }
  }
  
  // Hook JSEncrypt
  if ((hookAll || libraries.includes('JSEncrypt')) && window.JSEncrypt) {
    const proto = window.JSEncrypt.prototype;
    hookMethod(proto, 'JSEncrypt', 'encrypt', 'JSEncrypt');
    hookMethod(proto, 'JSEncrypt', 'decrypt', 'JSEncrypt');
    hookMethod(proto, 'JSEncrypt', 'sign', 'JSEncrypt');
    hookMethod(proto, 'JSEncrypt', 'verify', 'JSEncrypt');
    hookMethod(proto, 'JSEncrypt', 'setPublicKey', 'JSEncrypt');
    hookMethod(proto, 'JSEncrypt', 'setPrivateKey', 'JSEncrypt');
  }
  
  // Hook Web Crypto API
  if ((hookAll || libraries.includes('WebCrypto')) && window.crypto?.subtle) {
    const subtle = window.crypto.subtle;
    ['encrypt', 'decrypt', 'sign', 'verify', 'digest', 'deriveKey', 'deriveBits'].forEach(name => {
      if (subtle[name]) hookMethod(subtle, 'crypto.subtle', name, 'crypto.subtle');
    });
  }
  
  return { success: true, hooked };
})();
`;

    try {
      const page = context.getSelectedPage();
      const result = (await page.evaluate(hookCode)) as {
        success: boolean;
        hooked: string[];
      };

      if (result.hooked.length === 0) {
        response.appendResponseLine('❌ No crypto functions found to hook.');
        response.appendResponseLine(
          'Make sure the crypto libraries are loaded on the page.',
        );
        response.appendResponseLine('');
        response.appendResponseLine('Try:');
        response.appendResponseLine(
          '  - detect_encryption to see what libraries are available',
        );
        return;
      }

      response.appendResponseLine(
        `✅ Hooked ${result.hooked.length} crypto function(s):\n`,
      );
      for (const name of result.hooked) {
        response.appendResponseLine(`  ✓ ${name}`);
      }
      response.appendResponseLine('');
      response.appendResponseLine(
        'Crypto operations will be logged to console. Use list_console_messages to view.',
      );
      response.appendResponseLine(
        'Logs include: function name, arguments, result, and call stack.',
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
