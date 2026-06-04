/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import type {Protocol} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const getCookies = defineTool({
  name: 'get_cookies',
  description:
    'Reads cookies via the CDP Network domain, including httpOnly cookies ' +
    '(where auth/session tokens usually live) with full attributes. By ' +
    'default returns cookies for the current page; pass `urls` to scope to ' +
    'specific URLs, or `nameContains` to filter by name.',
  annotations: {
    title: 'Get Cookies',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    urls: zod
      .array(zod.string())
      .optional()
      .describe('Restrict to cookies that would be sent to these URLs.'),
    nameContains: zod
      .string()
      .optional()
      .describe('Only return cookies whose name contains this substring.'),
  },
  handler: async (request, response, context) => {
    const client = context.networkManager.getClient();
    if (!client) {
      response.appendResponseLine(
        'Network manager is not bound. Select a page first.',
      );
      return;
    }
    const {cookies} = await client.send(
      'Network.getCookies',
      request.params.urls ? {urls: request.params.urls} : {},
    );
    const needle = request.params.nameContains;
    const filtered = needle
      ? cookies.filter(c => c.name.includes(needle))
      : cookies;
    response.appendResponseLine(`${filtered.length} cookie(s):`);
    for (const c of filtered) {
      const attrs = [
        `domain=${c.domain}`,
        `path=${c.path}`,
        c.httpOnly ? 'httpOnly' : '',
        c.secure ? 'secure' : '',
        c.sameSite ? `sameSite=${c.sameSite}` : '',
        c.session ? 'session' : `expires=${c.expires}`,
      ]
        .filter(Boolean)
        .join(', ');
      response.appendResponseLine(`- ${c.name}=${c.value} (${attrs})`);
    }
  },
});

export const setCookie = defineTool({
  name: 'set_cookie',
  description:
    'Sets a cookie via the CDP Network domain. Either `url` or `domain` must ' +
    'be supplied so Chrome can scope the cookie. Useful for replaying with a ' +
    'modified session or forging an authenticated state.',
  annotations: {
    title: 'Set Cookie',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    name: zod.string().describe('Cookie name.'),
    value: zod.string().describe('Cookie value.'),
    url: zod
      .string()
      .optional()
      .describe('Request URL to associate the cookie with (sets domain/path).'),
    domain: zod.string().optional().describe('Cookie domain.'),
    path: zod.string().optional().describe('Cookie path.'),
    secure: zod.boolean().optional().describe('Mark cookie as Secure.'),
    httpOnly: zod.boolean().optional().describe('Mark cookie as HttpOnly.'),
    sameSite: zod
      .enum(['Strict', 'Lax', 'None'])
      .optional()
      .describe('SameSite policy.'),
    expires: zod
      .number()
      .optional()
      .describe('Expiry as a UNIX timestamp in seconds (omit for session).'),
  },
  handler: async (request, response, context) => {
    const client = context.networkManager.getClient();
    if (!client) {
      response.appendResponseLine(
        'Network manager is not bound. Select a page first.',
      );
      return;
    }
    const p = request.params;
    if (!p.url && !p.domain) {
      response.appendResponseLine('Provide either `url` or `domain`.');
      return;
    }
    const cookie: Protocol.Network.SetCookieRequest = {
      name: p.name,
      value: p.value,
      url: p.url,
      domain: p.domain,
      path: p.path,
      secure: p.secure,
      httpOnly: p.httpOnly,
      sameSite: p.sameSite,
      expires: p.expires,
    };
    const {success} = await client.send('Network.setCookie', cookie);
    response.appendResponseLine(
      success ? `Cookie "${p.name}" set.` : `Failed to set cookie "${p.name}".`,
    );
  },
});

export const deleteCookie = defineTool({
  name: 'delete_cookie',
  description:
    'Deletes cookies matching the given name (optionally scoped by url, ' +
    'domain and path) via CDP Network.deleteCookies.',
  annotations: {
    title: 'Delete Cookie',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    name: zod.string().describe('Name of the cookie(s) to delete.'),
    url: zod.string().optional().describe('Scope deletion to this URL.'),
    domain: zod.string().optional().describe('Scope deletion to this domain.'),
    path: zod.string().optional().describe('Scope deletion to this path.'),
  },
  handler: async (request, response, context) => {
    const client = context.networkManager.getClient();
    if (!client) {
      response.appendResponseLine(
        'Network manager is not bound. Select a page first.',
      );
      return;
    }
    const p = request.params;
    await client.send('Network.deleteCookies', {
      name: p.name,
      url: p.url,
      domain: p.domain,
      path: p.path,
    });
    response.appendResponseLine(`Deleted cookie(s) named "${p.name}".`);
  },
});

export const clearCookies = defineTool({
  name: 'clear_cookies',
  description:
    'Clears all browser cookies via CDP Network.clearBrowserCookies. Useful ' +
    'for reproducing a fresh, logged-out session.',
  annotations: {
    title: 'Clear Cookies',
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
    await client.send('Network.clearBrowserCookies');
    response.appendResponseLine('All browser cookies cleared.');
  },
});
