/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * API Request & Token Management Tools
 *
 * Provides tools for:
 * - Making HTTP requests with custom headers/body
 * - Managing multiple auth tokens (store, switch, list)
 * - Quick API calls with saved tokens
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ==================== In-Memory Token Store ====================

interface TokenEntry {
  name: string;
  token: string;
  type: string; // e.g. 'firebase', 'jwt', 'api_key', 'bearer', 'custom'
  metadata?: Record<string, string>;
  createdAt: number;
}

const tokenStore = new Map<string, TokenEntry>();
let activeTokenName: string | null = null;

// ==================== Token Management Tools ====================

/**
 * Save a token with a name for later use.
 */
export const saveToken = defineTool({
  name: 'save_token',
  description:
    'Save an authentication token with a name for later use. Supports multiple tokens for different accounts/services. Use list_tokens to see saved tokens and set_active_token to switch between them.',
  annotations: {
    title: 'Save Token',
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    name: zod
      .string()
      .describe(
        'A short name for this token (e.g. "free_account", "trial_user", "pro_user").',
      ),
    token: zod.string().describe('The token value to save.'),
    type: zod
      .enum(['firebase', 'jwt', 'api_key', 'bearer', 'custom'])
      .optional()
      .default('bearer')
      .describe('Type of token (default: "bearer").'),
    metadata: zod
      .record(zod.string())
      .optional()
      .describe(
        'Optional metadata to associate with this token (e.g. {"email": "user@example.com", "plan": "free"}).',
      ),
    setActive: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to set this token as the active token (default: false).'),
  },
  handler: async (request, response) => {
    const {name, token, type, metadata, setActive} = request.params;

    tokenStore.set(name, {
      name,
      token,
      type,
      metadata,
      createdAt: Date.now(),
    });

    if (setActive) {
      activeTokenName = name;
    }

    const preview = token.length > 20
      ? token.substring(0, 10) + '...' + token.substring(token.length - 10)
      : token;

    response.appendResponseLine(`Token "${name}" saved successfully.`);
    response.appendResponseLine(`  Type: ${type}`);
    response.appendResponseLine(`  Preview: ${preview}`);
    if (metadata) {
      response.appendResponseLine(`  Metadata: ${JSON.stringify(metadata)}`);
    }
    if (setActive) {
      response.appendResponseLine(`  ✅ Set as active token.`);
    }
  },
});

/**
 * List all saved tokens.
 */
export const listTokens = defineTool({
  name: 'list_tokens',
  description:
    'List all saved authentication tokens. Shows name, type, metadata, and which one is active.',
  annotations: {
    title: 'List Tokens',
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response) => {
    if (tokenStore.size === 0) {
      response.appendResponseLine('No tokens saved. Use save_token to add one.');
      return;
    }

    response.appendResponseLine(`## Saved Tokens (${tokenStore.size})\n`);

    for (const [name, entry] of tokenStore) {
      const isActive = name === activeTokenName;
      const preview = entry.token.length > 20
        ? entry.token.substring(0, 10) + '...' + entry.token.substring(entry.token.length - 10)
        : entry.token;

      response.appendResponseLine(
        `${isActive ? '✅' : '  '} **${name}** (${entry.type})`,
      );
      response.appendResponseLine(`    Preview: ${preview}`);
      if (entry.metadata) {
        response.appendResponseLine(
          `    Metadata: ${JSON.stringify(entry.metadata)}`,
        );
      }
      response.appendResponseLine('');
    }

    if (activeTokenName) {
      response.appendResponseLine(`Active token: **${activeTokenName}**`);
    } else {
      response.appendResponseLine(
        'No active token set. Use set_active_token to set one.',
      );
    }
  },
});

/**
 * Set the active token.
 */
export const setActiveToken = defineTool({
  name: 'set_active_token',
  description:
    'Set a saved token as the active token. The active token is automatically used by api_request when no explicit token is provided.',
  annotations: {
    title: 'Set Active Token',
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    name: zod
      .string()
      .describe('The name of the saved token to set as active.'),
  },
  handler: async (request, response) => {
    const {name} = request.params;

    if (!tokenStore.has(name)) {
      response.appendResponseLine(
        `Token "${name}" not found. Available tokens: ${[...tokenStore.keys()].join(', ') || 'none'}`,
      );
      return;
    }

    activeTokenName = name;
    response.appendResponseLine(`Active token set to: **${name}**`);
  },
});

/**
 * Delete a saved token.
 */
export const deleteToken = defineTool({
  name: 'delete_token',
  description: 'Delete a saved token by name.',
  annotations: {
    title: 'Delete Token',
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    name: zod.string().describe('The name of the token to delete.'),
  },
  handler: async (request, response) => {
    const {name} = request.params;

    if (!tokenStore.has(name)) {
      response.appendResponseLine(`Token "${name}" not found.`);
      return;
    }

    tokenStore.delete(name);
    if (activeTokenName === name) {
      activeTokenName = null;
    }
    response.appendResponseLine(`Token "${name}" deleted.`);
  },
});

// ==================== HTTP Request Tool ====================

/**
 * Make an HTTP request with full control over method, headers, body.
 */
export const apiRequest = defineTool({
  name: 'api_request',
  description:
    'Make an HTTP request from the browser context. Supports custom method, headers, body, and automatic token injection. The request is executed inside the browser page using fetch(), so it shares cookies and origin with the page. Use tokenName or the active token for automatic auth header injection.',
  annotations: {
    title: 'API Request',
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    url: zod
      .string()
      .describe(
        'The URL to request. Can be relative (e.g. "/_backend/...") or absolute.',
      ),
    method: zod
      .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
      .optional()
      .default('POST')
      .describe('HTTP method (default: POST).'),
    headers: zod
      .record(zod.string())
      .optional()
      .describe(
        'Custom headers to include. Common ones like content-type are auto-set for JSON.',
      ),
    body: zod
      .string()
      .optional()
      .describe(
        'Request body. For JSON, pass a JSON string. For form data, pass URL-encoded string.',
      ),
    jsonBody: zod
      .record(zod.unknown())
      .optional()
      .describe(
        'Request body as a JSON object (alternative to body string). Will be JSON.stringify-ed automatically.',
      ),
    tokenName: zod
      .string()
      .optional()
      .describe(
        'Name of a saved token to use. If omitted, uses the active token.',
      ),
    tokenHeader: zod
      .string()
      .optional()
      .default('x-auth-token')
      .describe(
        'Header name for the auth token (default: "x-auth-token"). Use "Authorization" for Bearer tokens.',
      ),
    includeTokenInBody: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, also includes the token as "auth_token" field in the JSON body.',
      ),
    maxResponseLength: zod
      .number()
      .int()
      .optional()
      .default(2000)
      .describe(
        'Maximum response body length to return (default: 2000). Set to 0 for unlimited.',
      ),
    connectProtocol: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, adds connect-protocol-version: 1 header (for gRPC-Connect APIs).',
      ),
  },
  handler: async (request, response, context) => {
    const {
      url,
      method,
      headers,
      body,
      jsonBody,
      tokenName,
      tokenHeader,
      includeTokenInBody,
      maxResponseLength,
      connectProtocol,
    } = request.params;

    // Resolve token
    const resolvedTokenName = tokenName || activeTokenName;
    let tokenValue: string | null = null;
    if (resolvedTokenName && tokenStore.has(resolvedTokenName)) {
      tokenValue = tokenStore.get(resolvedTokenName)!.token;
    }

    // Build the fetch code to execute in browser
    const page = context.getSelectedPage();

    const result = await page.evaluate(
      async (params: {
        url: string;
        method: string;
        headers: Record<string, string> | undefined;
        body: string | undefined;
        jsonBody: Record<string, unknown> | undefined;
        tokenValue: string | null;
        tokenHeader: string;
        includeTokenInBody: boolean;
        maxResponseLength: number;
        connectProtocol: boolean;
      }) => {
        try {
          const fetchHeaders: Record<string, string> = {};

          // Auto-set content-type for JSON
          if (params.jsonBody || (params.body && params.body.startsWith('{'))) {
            fetchHeaders['content-type'] = 'application/json';
          }

          // Connect protocol header
          if (params.connectProtocol) {
            fetchHeaders['connect-protocol-version'] = '1';
          }

          // Token injection
          if (params.tokenValue) {
            fetchHeaders[params.tokenHeader] = params.tokenValue;
          }

          // Custom headers (override defaults)
          if (params.headers) {
            Object.assign(fetchHeaders, params.headers);
          }

          // Build body
          let fetchBody: string | undefined;
          if (params.jsonBody) {
            const bodyObj = {...params.jsonBody};
            if (params.includeTokenInBody && params.tokenValue) {
              bodyObj['auth_token'] = params.tokenValue;
            }
            fetchBody = JSON.stringify(bodyObj);
          } else if (params.body) {
            if (params.includeTokenInBody && params.tokenValue && params.body.startsWith('{')) {
              try {
                const bodyObj = JSON.parse(params.body);
                bodyObj['auth_token'] = params.tokenValue;
                fetchBody = JSON.stringify(bodyObj);
              } catch {
                fetchBody = params.body;
              }
            } else {
              fetchBody = params.body;
            }
          } else if (params.includeTokenInBody && params.tokenValue) {
            fetchBody = JSON.stringify({auth_token: params.tokenValue});
            fetchHeaders['content-type'] = 'application/json';
          }

          const startTime = Date.now();
          const resp = await fetch(params.url, {
            method: params.method,
            headers: fetchHeaders,
            body: fetchBody,
          });
          const elapsed = Date.now() - startTime;

          // Read response
          const contentType = resp.headers.get('content-type') || '';
          let responseBody: string;

          if (contentType.includes('application/json') || contentType.includes('application/connect+json')) {
            responseBody = await resp.text();
          } else if (contentType.includes('text/')) {
            responseBody = await resp.text();
          } else {
            // Binary response - show as hex preview
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            const hexPreview = Array.from(bytes.slice(0, 200))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' ');
            responseBody = `[Binary ${bytes.length} bytes] ${hexPreview}...`;
          }

          // Truncate if needed
          if (params.maxResponseLength > 0 && responseBody.length > params.maxResponseLength) {
            responseBody = responseBody.substring(0, params.maxResponseLength) + '... [truncated]';
          }

          // Collect response headers
          const respHeaders: Record<string, string> = {};
          resp.headers.forEach((value: string, key: string) => {
            respHeaders[key] = value;
          });

          return JSON.stringify({
            status: resp.status,
            statusText: resp.statusText,
            elapsed: elapsed + 'ms',
            contentType,
            headers: respHeaders,
            body: responseBody,
          });
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          return JSON.stringify({error: error.message});
        }
      },
      {
        url,
        method: method || 'POST',
        headers,
        body,
        jsonBody: jsonBody as Record<string, unknown> | undefined,
        tokenValue,
        tokenHeader: tokenHeader || 'x-auth-token',
        includeTokenInBody: includeTokenInBody || false,
        maxResponseLength: maxResponseLength || 2000,
        connectProtocol: connectProtocol || false,
      },
    );

    // Parse and format output
    try {
      const parsed = JSON.parse(result as string);
      if (parsed.error) {
        response.appendResponseLine(`❌ Request failed: ${parsed.error}`);
        return;
      }

      response.appendResponseLine(`## ${method || 'POST'} ${url}\n`);
      if (resolvedTokenName) {
        response.appendResponseLine(`Token: ${resolvedTokenName}`);
      }
      response.appendResponseLine(`Status: ${parsed.status} ${parsed.statusText}`);
      response.appendResponseLine(`Time: ${parsed.elapsed}`);
      response.appendResponseLine(`Content-Type: ${parsed.contentType}`);
      response.appendResponseLine('');

      // Try to pretty-print JSON
      try {
        const jsonBody = JSON.parse(parsed.body);
        response.appendResponseLine('```json');
        response.appendResponseLine(JSON.stringify(jsonBody, null, 2));
        response.appendResponseLine('```');
      } catch {
        response.appendResponseLine('```');
        response.appendResponseLine(parsed.body);
        response.appendResponseLine('```');
      }
    } catch {
      response.appendResponseLine(`Raw response: ${result}`);
    }
  },
});

/**
 * Extract auth token from current page's React fiber state.
 */
export const extractPageToken = defineTool({
  name: 'extract_page_token',
  description:
    'Extract authentication tokens from the current page. Searches React fiber state, cookies, localStorage, and common global variables for auth tokens. Optionally saves the found token.',
  annotations: {
    title: 'Extract Page Token',
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    saveName: zod
      .string()
      .optional()
      .describe(
        'If provided, save the found token with this name.',
      ),
    setActive: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true and saveName is provided, set as active token.'),
  },
  handler: async (request, response, context) => {
    const {saveName, setActive} = request.params;
    const page = context.getSelectedPage();

    const result = await page.evaluate(() => {
      const tokens: Array<{source: string; token: string; metadata?: Record<string, string>}> = [];

      // 1. Search React fiber for auth state
      try {
        const rootEl = document.getElementById('__next') || document.getElementById('root') || document.body;
        const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber$'));
        if (fiberKey) {
          const fiber = (rootEl as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
          function walkFiber(f: Record<string, unknown> | null, depth: number): void {
            if (!f || depth > 60) return;
            const memo = f.memoizedState as Record<string, unknown> | null;
            if (memo) {
              let state = memo as {memoizedState?: Record<string, unknown>; next?: unknown} | null;
              let idx = 0;
              while (state && idx < 20) {
                const val = state.memoizedState;
                if (val && typeof val === 'object') {
                  const v = val as Record<string, unknown>;
                  // Look for accessToken / idToken patterns
                  if (v.accessToken && typeof v.accessToken === 'string') {
                    const meta: Record<string, string> = {};
                    if (v.uid) meta.uid = String(v.uid);
                    if (v.email) meta.email = String(v.email);
                    tokens.push({source: 'react_fiber', token: v.accessToken as string, metadata: meta});
                  }
                  // Look for user objects with token
                  if (v.user && typeof v.user === 'object') {
                    const user = v.user as Record<string, unknown>;
                    if (user.apiKey && typeof user.apiKey === 'string') {
                      const meta: Record<string, string> = {};
                      if (user.email) meta.email = String(user.email);
                      if (user.name) meta.name = String(user.name);
                      if (user.planName || (v as Record<string, unknown>).planInfo) {
                        const planInfo = (v as Record<string, unknown>).planInfo as Record<string, unknown> | undefined;
                        if (planInfo?.planName) meta.plan = String(planInfo.planName);
                      }
                      tokens.push({source: 'react_fiber_apiKey', token: user.apiKey as string, metadata: meta});
                    }
                  }
                }
                state = state.next as typeof state;
                idx++;
              }
            }
            walkFiber(f.child as Record<string, unknown> | null, depth + 1);
            walkFiber(f.sibling as Record<string, unknown> | null, depth + 1);
          }
          walkFiber(fiber, 0);
        }
      } catch { /* ignore */ }

      // 2. Check localStorage
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          const val = localStorage.getItem(key) || '';
          if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth') || key.toLowerCase().includes('jwt')) {
            if (val.length > 20 && val.length < 5000) {
              tokens.push({source: `localStorage:${key}`, token: val});
            }
          }
        }
      } catch { /* ignore */ }

      // 3. Check common global variables
      try {
        const globals = ['__AUTH_TOKEN__', '__TOKEN__', '_token', 'authToken', 'accessToken'];
        for (const g of globals) {
          const val = (window as unknown as Record<string, unknown>)[g];
          if (typeof val === 'string' && val.length > 20) {
            tokens.push({source: `window.${g}`, token: val});
          }
        }
      } catch { /* ignore */ }

      return JSON.stringify(tokens, (key, value) => typeof value === 'bigint' ? value.toString() : value);
    });

    const tokens = JSON.parse(result as string) as Array<{source: string; token: string; metadata?: Record<string, string>}>;

    if (tokens.length === 0) {
      response.appendResponseLine('No tokens found on this page.');
      return;
    }

    response.appendResponseLine(`## Found ${tokens.length} token(s)\n`);

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const preview = t.token.length > 30
        ? t.token.substring(0, 15) + '...' + t.token.substring(t.token.length - 15)
        : t.token;

      response.appendResponseLine(`### Token ${i + 1} (${t.source})`);
      response.appendResponseLine(`  Preview: ${preview}`);
      response.appendResponseLine(`  Length: ${t.token.length}`);
      if (t.metadata) {
        response.appendResponseLine(`  Metadata: ${JSON.stringify(t.metadata)}`);
      }
      response.appendResponseLine('');
    }

    // Save the first token if requested
    if (saveName && tokens.length > 0) {
      const firstToken = tokens[0];
      tokenStore.set(saveName, {
        name: saveName,
        token: firstToken.token,
        type: 'firebase',
        metadata: firstToken.metadata,
        createdAt: Date.now(),
      });
      if (setActive) {
        activeTokenName = saveName;
      }
      response.appendResponseLine(`\n✅ Token saved as "${saveName}"${setActive ? ' (active)' : ''}`);
    }
  },
});

/**
 * Login with Firebase email/password and save token.
 */
export const firebaseLogin = defineTool({
  name: 'firebase_login',
  description:
    'Login with email/password using Firebase Auth and save the resulting token. Useful for quickly switching between accounts.',
  annotations: {
    title: 'Firebase Login',
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    email: zod.string().describe('Email address to login with.'),
    password: zod.string().describe('Password.'),
    apiKey: zod
      .string()
      .optional()
      .default('AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY')
      .describe('Firebase API key (default: Windsurf key).'),
    saveName: zod
      .string()
      .describe('Name to save the token as.'),
    setActive: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Set as active token (default: true).'),
  },
  handler: async (request, response, context) => {
    const {email, password, apiKey, saveName, setActive} = request.params;
    const page = context.getSelectedPage();

    const result = await page.evaluate(
      async (params: {email: string; password: string; apiKey: string}) => {
        try {
          const resp = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${params.apiKey}`,
            {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                email: params.email,
                password: params.password,
                returnSecureToken: true,
              }),
            },
          );
          const data = await resp.json();
          if (data.error) {
            return JSON.stringify({error: data.error.message});
          }
          return JSON.stringify({
            idToken: data.idToken,
            uid: data.localId,
            email: data.email,
            expiresIn: data.expiresIn,
          });
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          return JSON.stringify({error: error.message});
        }
      },
      {email, password, apiKey: apiKey || 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY'},
    );

    const parsed = JSON.parse(result as string);

    if (parsed.error) {
      response.appendResponseLine(`❌ Login failed: ${parsed.error}`);
      return;
    }

    // Save token
    tokenStore.set(saveName, {
      name: saveName,
      token: parsed.idToken,
      type: 'firebase',
      metadata: {email: parsed.email, uid: parsed.uid},
      createdAt: Date.now(),
    });

    if (setActive) {
      activeTokenName = saveName;
    }

    const preview = parsed.idToken.substring(0, 15) + '...' + parsed.idToken.substring(parsed.idToken.length - 15);
    response.appendResponseLine(`✅ Login successful!`);
    response.appendResponseLine(`  Email: ${parsed.email}`);
    response.appendResponseLine(`  UID: ${parsed.uid}`);
    response.appendResponseLine(`  Token: ${preview}`);
    response.appendResponseLine(`  Expires in: ${parsed.expiresIn}s`);
    response.appendResponseLine(`  Saved as: "${saveName}"${setActive ? ' (active)' : ''}`);
  },
});
