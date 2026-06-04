/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CapturedRequest} from '../../network/types.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

const waitSchema = {
  urlPattern: zod
    .string()
    .optional()
    .describe('URL matcher: glob with *, substring, or regex (isRegex).'),
  isRegex: zod.boolean().optional().default(false),
  method: zod.string().optional().describe('HTTP method filter.'),
  resourceType: zod
    .string()
    .optional()
    .describe('CDP resource type filter (e.g. XHR, Fetch, Script).'),
  timeout: zod
    .number()
    .int()
    .optional()
    .default(30000)
    .describe('Maximum wait time in milliseconds (default 30000).'),
  newOnly: zod
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, ignore already-captured matches and wait for a fresh one. ' +
        'Set this before triggering the action if a stale match could exist.',
    ),
};

function describe(r: CapturedRequest): string {
  const status = r.failed
    ? `FAILED(${r.errorText ?? 'error'})`
    : (r.status ?? '-');
  return `#${r.id} ${r.method} ${status} ${r.mimeType ?? ''} ${r.url}`;
}

export const waitForRequest = defineTool({
  name: 'wait_for_request',
  description:
    'Blocks until a network request matching the filters is observed (across ' +
    'the page and all auto-attached targets), then returns it. Use after ' +
    'triggering an action to grab the request it fires. Resolves as soon as ' +
    'the request is seen, before its response arrives.',
  annotations: {
    title: 'Wait For Request',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: waitSchema,
  handler: async (request, response, context) => {
    const p = request.params;
    const record = await context.networkManager.store.waitFor({
      urlPattern: p.urlPattern,
      isRegex: p.isRegex,
      method: p.method,
      resourceType: p.resourceType,
      phase: 'request',
      timeoutMs: p.timeout,
      newOnly: p.newOnly,
    });
    if (!record) {
      response.appendResponseLine(
        `Timed out after ${p.timeout}ms waiting for a matching request.`,
      );
      return;
    }
    response.appendResponseLine('Matched request:');
    response.appendResponseLine(describe(record));
    response.appendResponseLine(
      'Use get_response_body(requestId) once it completes, or ' +
        'wait_for_response to await the response.',
    );
  },
});

export const waitForResponse = defineTool({
  name: 'wait_for_response',
  description:
    'Blocks until a network request matching the filters has received a ' +
    'response (or failed) across the page and all auto-attached targets, then ' +
    'returns it. Use to grab the response of an XHR/fetch fired by an action.',
  annotations: {
    title: 'Wait For Response',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: {
    ...waitSchema,
    includeBody: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include a truncated response body in the result.'),
    maxBodyLength: zod
      .number()
      .int()
      .optional()
      .default(2000)
      .describe('Maximum body characters to display (default 2000).'),
  },
  handler: async (request, response, context) => {
    const p = request.params;
    const store = context.networkManager.store;
    const record = await store.waitFor({
      urlPattern: p.urlPattern,
      isRegex: p.isRegex,
      method: p.method,
      resourceType: p.resourceType,
      phase: 'response',
      timeoutMs: p.timeout,
      newOnly: p.newOnly,
    });
    if (!record) {
      response.appendResponseLine(
        `Timed out after ${p.timeout}ms waiting for a matching response.`,
      );
      return;
    }
    response.appendResponseLine('Matched response:');
    response.appendResponseLine(describe(record));
    if (p.includeBody && !record.failed) {
      const body = await store.getResponseBody(record.id);
      if (body) {
        const text = body.base64
          ? `[binary ${body.body.length} base64 chars]`
          : body.body.slice(0, p.maxBodyLength);
        response.appendResponseLine(`body: ${text}`);
      }
    }
  },
});
