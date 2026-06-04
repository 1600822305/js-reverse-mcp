/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {buildHar} from '../../network/har.js';
import type {CapturedRequest} from '../../network/types.js';
import type {RequestInitiator} from '../../PageCollector.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

function summarize(r: CapturedRequest): string {
  const status = r.failed
    ? `FAILED(${r.errorText ?? 'error'})`
    : (r.status ?? '-');
  return `#${r.id} ${r.method} ${status} ${r.mimeType ?? ''} ${r.url}`;
}

/** Render the top frames of a request's initiator call stack. */
function formatInitiator(
  initiator: RequestInitiator,
  maxFrames: number,
): string[] {
  const lines = [`  initiator: ${initiator.type}`];
  if (initiator.url) {
    lines.push(
      `    at ${initiator.url}:${initiator.lineNumber ?? 0}:${initiator.columnNumber ?? 0}`,
    );
  }
  const frames = initiator.stack?.callFrames ?? [];
  for (const frame of frames.slice(0, maxFrames)) {
    const name = frame.functionName || '(anonymous)';
    lines.push(
      `    at ${name} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`,
    );
  }
  if (frames.length > maxFrames) {
    lines.push(`    ... ${frames.length - maxFrames} more frame(s)`);
  }
  return lines;
}

export const searchNetwork = defineTool({
  name: 'search_network',
  description:
    'Searches captured network requests (CDP-backed store that survives ' +
    'navigation) by URL pattern, method, status and resource type, with an ' +
    'optional full-text search across request/response bodies. Independent of ' +
    'the DevTools UI selection.',
  annotations: {
    title: 'Search Network',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: {
    urlPattern: zod
      .string()
      .optional()
      .describe('URL matcher: glob with *, substring, or regex (isRegex).'),
    isRegex: zod.boolean().optional().default(false),
    method: zod.string().optional().describe('HTTP method filter.'),
    status: zod.number().int().optional().describe('HTTP status filter.'),
    resourceType: zod
      .string()
      .optional()
      .describe('CDP resource type filter (e.g. XHR, Fetch, Script).'),
    bodyContains: zod
      .string()
      .optional()
      .describe(
        'Only return requests whose request or response body contains this text. Fetches response bodies for candidates.',
      ),
    includeBodies: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include a truncated response body for each result.'),
    maxBodyLength: zod
      .number()
      .int()
      .optional()
      .default(2000)
      .describe('Maximum body characters to display (default 2000).'),
    includeInitiator: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Include the JS initiator call stack for each result (main-page ' +
          'requests only). Useful to locate the code that fired a request.',
      ),
    maxFrames: zod
      .number()
      .int()
      .optional()
      .default(5)
      .describe('Maximum initiator call-stack frames to show (default 5).'),
    limit: zod
      .number()
      .int()
      .optional()
      .default(50)
      .describe('Maximum number of results (default 50).'),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    const store = context.networkManager.store;

    let results = store.query({
      urlPattern: params.urlPattern,
      isRegex: params.isRegex,
      method: params.method,
      status: params.status,
      resourceType: params.resourceType,
      limit: params.bodyContains ? undefined : params.limit,
    });

    if (params.bodyContains) {
      const needle = params.bodyContains;
      const filtered: CapturedRequest[] = [];
      for (const r of results) {
        if (r.requestBody?.includes(needle)) {
          filtered.push(r);
          continue;
        }
        const body = await store.getResponseBody(r.id);
        if (!body) {
          continue;
        }
        // Decode base64 bodies so the search works on the actual payload text
        // (e.g. gzipped responses are already inflated by CDP; binary bodies
        // are decoded as UTF-8 best-effort).
        const text = body.base64
          ? Buffer.from(body.body, 'base64').toString('utf8')
          : body.body;
        if (text.includes(needle)) {
          filtered.push(r);
        }
      }
      results = filtered.slice(-params.limit);
    }

    if (results.length === 0) {
      response.appendResponseLine('No matching network requests captured.');
      return;
    }

    response.appendResponseLine(`Matched ${results.length} request(s):`);
    for (const r of results) {
      response.appendResponseLine(summarize(r));
      if (params.includeInitiator) {
        const reqid = context.resolveCdpRequestId(r.cdpRequestId);
        const initiator =
          reqid !== undefined
            ? context.getRequestInitiatorById(reqid)
            : undefined;
        if (initiator) {
          for (const line of formatInitiator(initiator, params.maxFrames)) {
            response.appendResponseLine(line);
          }
        }
      }
      if (params.includeBodies) {
        const body = await store.getResponseBody(r.id);
        if (body) {
          const text = body.base64
            ? `[binary ${body.body.length} base64 chars]`
            : body.body.slice(0, params.maxBodyLength);
          response.appendResponseLine(`  body: ${text}`);
        }
      }
    }
    response.appendResponseLine('');
    response.appendResponseLine(
      'Use get_response_body(requestId) for a full body, or replay_request(requestId) to resend.',
    );
  },
});

export const getResponseBody = defineTool({
  name: 'get_response_body',
  description:
    'Fetches the full response body of a captured request by its numeric id ' +
    '(from search_network). Binary bodies are returned as base64.',
  annotations: {
    title: 'Get Response Body',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: {
    requestId: zod
      .number()
      .int()
      .describe('Numeric request id from search_network.'),
    maxLength: zod
      .number()
      .int()
      .optional()
      .default(20000)
      .describe('Maximum characters to return (default 20000, 0 = unlimited).'),
  },
  handler: async (request, response, context) => {
    const {requestId, maxLength} = request.params;
    const store = context.networkManager.store;
    const record = store.getById(requestId);
    if (!record) {
      response.appendResponseLine(`No captured request with id ${requestId}.`);
      return;
    }
    response.appendResponseLine(`${record.method} ${record.url}`);
    response.appendResponseLine(
      `Status: ${record.status ?? '-'} ${record.statusText ?? ''}`,
    );
    const body = await store.getResponseBody(requestId);
    if (!body) {
      response.appendResponseLine(
        'Response body unavailable (request not finished, evicted, or no body).',
      );
      return;
    }
    let text = body.body;
    if (maxLength > 0 && text.length > maxLength) {
      text = `${text.slice(0, maxLength)}... [truncated]`;
    }
    response.appendResponseLine(
      body.base64 ? '[base64-encoded binary body]' : 'Body:',
    );
    response.appendResponseLine(text);
  },
});

export const exportHar = defineTool({
  name: 'export_har',
  description:
    'Exports captured network traffic as a HAR 1.2 file (optionally filtered ' +
    'and including response bodies).',
  annotations: {
    title: 'Export HAR',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: {
    urlPattern: zod
      .string()
      .optional()
      .describe('Only include requests matching this URL pattern.'),
    isRegex: zod.boolean().optional().default(false),
    includeBodies: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Fetch and embed response bodies (default true).'),
    filePath: zod
      .string()
      .optional()
      .describe('Filename to save the HAR as. Defaults to capture.har.'),
    limit: zod
      .number()
      .int()
      .optional()
      .default(1000)
      .describe('Maximum number of requests to export (default 1000).'),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    const store = context.networkManager.store;
    const records = store.query({
      urlPattern: params.urlPattern,
      isRegex: params.isRegex,
      limit: params.limit,
    });
    if (records.length === 0) {
      response.appendResponseLine('No captured requests to export.');
      return;
    }
    const bodies = new Map<number, string>();
    if (params.includeBodies) {
      for (const r of records) {
        // Pull full request bodies that CDP omitted from the live event so the
        // HAR `postData` is complete.
        await store.getRequestBody(r.id);
        const body = await store.getResponseBody(r.id);
        if (body && !body.base64) {
          bodies.set(r.id, body.body);
        }
      }
    }
    const har = buildHar(records, bodies);
    const filename = params.filePath || 'capture.har';
    const {filename: saved} = await context.saveFile(
      new TextEncoder().encode(har),
      filename,
    );
    response.appendResponseLine(
      `Exported ${records.length} request(s) to ${saved}.`,
    );
  },
});
