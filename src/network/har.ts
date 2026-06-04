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

function toHeaders(record: Record<string, string> | undefined): HarHeader[] {
  return Object.entries(record ?? {}).map(([name, value]) => ({name, value}));
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
    const time = r.endTime ? r.endTime - r.startTime : 0;
    const responseBody = bodies.get(r.id);
    return {
      startedDateTime,
      time,
      request: {
        method: r.method,
        url: r.url,
        httpVersion: 'HTTP/1.1',
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
        headers: toHeaders(r.responseHeaders),
        content: {
          size: r.encodedDataLength ?? (responseBody ? responseBody.length : 0),
          mimeType: r.mimeType ?? '',
          text: responseBody,
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: r.encodedDataLength ?? -1,
      },
      cache: {},
      timings: {send: 0, wait: time, receive: 0},
      serverIPAddress: r.remoteIPAddress,
      _resourceType: r.resourceType,
    };
  });

  const har = {
    log: {
      version: '1.2',
      creator: {name: 'js-reverse-mcp', version: '1.0.0'},
      entries,
    },
  };
  return JSON.stringify(har, null, 2);
}
