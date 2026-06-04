/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from '../third_party/index.js';

/** A fully-resolved request to re-send from the page context. */
export interface ReplayRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export type ReplayResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      durationMs: number;
    }
  | {ok: false; error: string};

// Headers the Fetch API forbids scripts from setting.
const FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'cookie',
  'origin',
  'referer',
  'accept-encoding',
  'accept-charset',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-dest',
]);

export function sanitizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) {
      out[name] = value;
    }
  }
  return out;
}

function buildReplayCode(req: ReplayRequest): string {
  return `
(async () => {
  const url = ${JSON.stringify(req.url)};
  const init = {
    method: ${JSON.stringify(req.method)},
    headers: ${JSON.stringify(req.headers)},
    credentials: 'include',
  };
  ${req.body !== undefined ? `init.body = ${JSON.stringify(req.body)};` : ''}
  const started = performance.now();
  try {
    const resp = await fetch(url, init);
    const text = await resp.text();
    const respHeaders = {};
    resp.headers.forEach((v, k) => { respHeaders[k] = v; });
    return {
      ok: true,
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
      body: text,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})();
`;
}

/** Re-send a single request from the page context via fetch(). */
export async function runReplay(
  page: Page,
  req: ReplayRequest,
): Promise<ReplayResult> {
  return (await page.evaluate(buildReplayCode(req))) as ReplayResult;
}
