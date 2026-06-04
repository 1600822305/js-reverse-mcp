/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFile} from 'node:fs/promises';

import {matchUrl} from '../../network/match.js';
import {
  runReplay,
  sanitizeHeaders,
  type ReplayRequest,
} from '../../network/replay-exec.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

interface HarHeader {
  name: string;
  value: string;
}

interface HarEntry {
  request?: {
    method?: string;
    url?: string;
    headers?: HarHeader[];
    postData?: {text?: string};
  };
}

function harEntryToReplay(entry: HarEntry): ReplayRequest | undefined {
  const req = entry.request;
  if (!req?.url) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const h of req.headers ?? []) {
    // Skip HTTP/2 pseudo-headers (":method", ":path", ...) the Fetch API rejects.
    if (h.name && !h.name.startsWith(':')) {
      headers[h.name] = h.value;
    }
  }
  const method = (req.method ?? 'GET').toUpperCase();
  return {
    url: req.url,
    method,
    headers: sanitizeHeaders(headers),
    body:
      method === 'GET' || method === 'HEAD' ? undefined : req.postData?.text,
  };
}

export const batchReplay = defineTool({
  name: 'batch_replay',
  description:
    'Replays multiple requests in sequence and summarises each response. ' +
    'Source the requests either from captured ids (requestIds, from ' +
    'search_network) or from a HAR file on disk (harFile, e.g. one exported ' +
    'by export_har). HAR entries can be narrowed by urlPattern/methods/limit. ' +
    'Useful for re-running a recorded flow or fuzzing a sequence of signed ' +
    'API calls. Cookies/auth are included via the page context.',
  annotations: {
    title: 'Batch Replay',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    requestIds: zod
      .array(zod.number().int())
      .optional()
      .describe('Numeric request ids from search_network to replay in order.'),
    harFile: zod
      .string()
      .optional()
      .describe(
        'Path to a HAR file; its log.entries[].request entries are replayed.',
      ),
    urlPattern: zod
      .string()
      .optional()
      .describe(
        'Only replay HAR entries whose URL matches this glob/substring.',
      ),
    isRegex: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Treat urlPattern as a regular expression.'),
    methods: zod
      .array(zod.string())
      .optional()
      .describe('Only replay HAR entries with these HTTP methods.'),
    setHeaders: zod
      .record(zod.string())
      .optional()
      .describe('Headers to add/override on every replayed request.'),
    limit: zod
      .number()
      .int()
      .optional()
      .default(20)
      .describe('Maximum number of requests to replay (default 20).'),
    delayMs: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe('Delay between requests in milliseconds (default 0).'),
    maxResponseLength: zod
      .number()
      .int()
      .optional()
      .default(500)
      .describe(
        'Max response body characters to show per request (default 500).',
      ),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    if (!params.requestIds?.length && !params.harFile) {
      response.appendResponseLine(
        'Provide either requestIds (from search_network) or harFile.',
      );
      return;
    }
    if (params.requestIds?.length && params.harFile) {
      response.appendResponseLine(
        'Provide only one of requestIds or harFile, not both.',
      );
      return;
    }

    const store = context.networkManager.store;
    const reqs: ReplayRequest[] = [];

    if (params.requestIds?.length) {
      for (const id of params.requestIds) {
        const record = store.getById(id);
        if (!record) {
          response.appendResponseLine(`- Skipped id ${id}: not captured.`);
          continue;
        }
        const method = record.method.toUpperCase();
        reqs.push({
          url: record.url,
          method,
          headers: {
            ...sanitizeHeaders(record.requestHeaders),
            ...(params.setHeaders ?? {}),
          },
          body:
            method === 'GET' || method === 'HEAD'
              ? undefined
              : await store.getRequestBody(id),
        });
      }
    } else if (params.harFile) {
      let har: {log?: {entries?: HarEntry[]}};
      try {
        const text = await readFile(params.harFile, 'utf8');
        har = JSON.parse(text);
      } catch (err) {
        response.appendResponseLine(
          `Could not read/parse HAR "${params.harFile}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return;
      }
      const entries = har.log?.entries ?? [];
      const wantMethods = params.methods?.map(m => m.toUpperCase());
      for (const entry of entries) {
        const replay = harEntryToReplay(entry);
        if (!replay) {
          continue;
        }
        if (
          params.urlPattern &&
          !matchUrl(replay.url, params.urlPattern, params.isRegex)
        ) {
          continue;
        }
        if (wantMethods && !wantMethods.includes(replay.method)) {
          continue;
        }
        if (params.setHeaders) {
          replay.headers = {...replay.headers, ...params.setHeaders};
        }
        reqs.push(replay);
      }
    }

    if (reqs.length === 0) {
      response.appendResponseLine('No requests matched; nothing to replay.');
      return;
    }

    const toRun = reqs.slice(0, params.limit);
    response.appendResponseLine(
      `Replaying ${toRun.length} request(s)${
        reqs.length > toRun.length ? ` (of ${reqs.length} matched)` : ''
      }:\n`,
    );

    const page = context.getSelectedPage();
    let okCount = 0;
    for (let i = 0; i < toRun.length; i++) {
      const req = toRun[i];
      if (i > 0 && params.delayMs > 0) {
        await new Promise(r => setTimeout(r, params.delayMs));
      }
      const result = await runReplay(page, req);
      if (!result.ok) {
        response.appendResponseLine(
          `${i + 1}. ${req.method} ${req.url} -> ERROR: ${result.error}`,
        );
        continue;
      }
      okCount++;
      let snippet = result.body.replace(/\s+/g, ' ').trim();
      if (
        params.maxResponseLength > 0 &&
        snippet.length > params.maxResponseLength
      ) {
        snippet = `${snippet.slice(0, params.maxResponseLength)}…`;
      }
      response.appendResponseLine(
        `${i + 1}. ${req.method} ${req.url} -> ${result.status} ${result.statusText} (${result.durationMs}ms)`,
      );
      if (snippet) {
        response.appendResponseLine(`   ${snippet}`);
      }
    }

    response.appendResponseLine(
      `\nDone: ${okCount}/${toRun.length} succeeded.`,
    );
  },
});
