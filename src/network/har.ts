/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CapturedRequest} from './types.js';

interface HarHeader {
  name: string;
  value: string;
}

interface HarCookie {
  name: string;
  value: string;
}

function toHeaders(record: Record<string, string> | undefined): HarHeader[] {
  return Object.entries(record ?? {}).map(([name, value]) => ({name, value}));
}

function findHeader(
  record: Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!record) {
    return undefined;
  }
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(record)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return undefined;
}

/** Parse a request `Cookie` header into HAR cookie objects. */
function requestCookies(
  record: Record<string, string> | undefined,
): HarCookie[] {
  const header = findHeader(record, 'cookie');
  if (!header) {
    return [];
  }
  return header
    .split(';')
    .map(pair => pair.trim())
    .filter(Boolean)
    .map(pair => {
      const eq = pair.indexOf('=');
      return eq === -1
        ? {name: pair, value: ''}
        : {name: pair.slice(0, eq), value: pair.slice(eq + 1)};
    });
}

/** Parse a response `Set-Cookie` header into HAR cookie objects. */
function responseCookies(
  record: Record<string, string> | undefined,
): HarCookie[] {
  const header = findHeader(record, 'set-cookie');
  if (!header) {
    return [];
  }
  // CDP collapses multiple Set-Cookie headers with newlines.
  return header
    .split('\n')
    .map(line => line.split(';')[0].trim())
    .filter(Boolean)
    .map(pair => {
      const eq = pair.indexOf('=');
      return eq === -1
        ? {name: pair, value: ''}
        : {name: pair.slice(0, eq), value: pair.slice(eq + 1)};
    });
}

interface HarTimings {
  blocked: number;
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
}

/**
 * Derive HAR timings (ms) from the CDP `ResourceTiming` breakdown. CDP offsets
 * are milliseconds relative to `requestTime` (seconds). Phases that are not
 * applicable are reported as -1 per the HAR spec. `time` is the sum of the
 * present phases (ssl is part of connect and is not summed separately).
 */
function buildTimings(r: CapturedRequest): {timings: HarTimings; time: number} {
  const t = r.timing;
  if (!t) {
    const total = r.endTime ? r.endTime - r.startTime : 0;
    return {
      timings: {
        blocked: -1,
        dns: -1,
        connect: -1,
        ssl: -1,
        send: 0,
        wait: total,
        receive: 0,
      },
      time: total,
    };
  }
  const span = (a: number, b: number): number =>
    a >= 0 && b >= 0 && b >= a ? b - a : -1;
  const dns = span(t.dnsStart, t.dnsEnd);
  const connect = span(t.connectStart, t.connectEnd);
  const ssl = span(t.sslStart, t.sslEnd);
  const send = span(t.sendStart, t.sendEnd);
  const wait = span(t.sendEnd, t.receiveHeadersEnd);
  const base = t.requestTime * 1000;
  const receive =
    r.endTime !== undefined && t.receiveHeadersEnd >= 0
      ? Math.max(0, r.endTime - base - t.receiveHeadersEnd)
      : -1;
  const timings: HarTimings = {
    blocked: -1,
    dns,
    connect,
    ssl,
    send,
    wait,
    receive,
  };
  const time = [dns, connect, send, wait, receive]
    .filter(v => v >= 0)
    .reduce((a, b) => a + b, 0);
  return {timings, time};
}

function queryString(url: string): HarHeader[] {
  try {
    const parsed = new URL(url);
    return [...parsed.searchParams.entries()].map(([name, value]) => ({
      name,
      value,
    }));
  } catch {
    return [];
  }
}

/**
 * Serialise captured requests into a HAR 1.2 document. Response bodies that
 * were fetched on demand can be supplied via `bodies` keyed by record id.
 */
export function buildHar(
  records: CapturedRequest[],
  bodies = new Map<number, string>(),
): string {
  const entries = records.map(r => {
    const startedDateTime = new Date(r.startTime).toISOString();
    const {timings, time} = buildTimings(r);
    const responseBody = bodies.get(r.id);
    return {
      startedDateTime,
      time,
      request: {
        method: r.method,
        url: r.url,
        httpVersion: 'HTTP/1.1',
        cookies: requestCookies(r.requestHeaders),
        headers: toHeaders(r.requestHeaders),
        queryString: queryString(r.url),
        postData: r.requestBody
          ? {
              mimeType:
                r.requestHeaders['content-type'] ??
                r.requestHeaders['Content-Type'] ??
                'application/octet-stream',
              text: r.requestBody,
            }
          : undefined,
        headersSize: -1,
        bodySize: r.requestBody ? r.requestBody.length : 0,
      },
      response: {
        status: r.status ?? 0,
        statusText: r.statusText ?? (r.failed ? (r.errorText ?? 'Failed') : ''),
        httpVersion: 'HTTP/1.1',
        cookies: responseCookies(r.responseHeaders),
        headers: toHeaders(r.responseHeaders),
        content: {
          size: r.encodedDataLength ?? (responseBody ? responseBody.length : 0),
          mimeType: r.mimeType ?? '',
          text: responseBody,
        },
        redirectURL: findHeader(r.responseHeaders, 'location') ?? '',
        headersSize: -1,
        bodySize: r.encodedDataLength ?? -1,
      },
      cache: {},
      timings,
      serverIPAddress: r.remoteIPAddress,
      _resourceType: r.resourceType,
      _redirects: r.redirects,
    };
  });

  const har = {
    log: {
      version: '1.2',
      creator: {name: 'js-reverse-mcp', version: '1.0.0'},
      pages: [],
      entries,
    },
  };
  return JSON.stringify(har, null, 2);
}
