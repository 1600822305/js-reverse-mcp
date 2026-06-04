/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Protocol} from '../third_party/index.js';

import {matchUrl} from './match.js';
import type {CapturedRequest} from './types.js';

export interface RequestQuery {
  urlPattern?: string;
  isRegex?: boolean;
  method?: string;
  status?: number;
  resourceType?: string;
  limit?: number;
}

/**
 * Collects request/response metadata from the CDP `Network` domain into a
 * bounded, queryable store on the Node side. Unlike the puppeteer-backed
 * collector this keeps full request/response bodies retrievable on demand and
 * is not tied to the DevTools UI selection.
 */
export class RequestStore {
  #client: CDPSession | null = null;
  #byCdpId = new Map<string, CapturedRequest>();
  #order: string[] = [];
  #idToCdpId = new Map<number, string>();
  #nextId = 1;
  readonly #maxEntries: number;

  constructor(maxEntries = 2000) {
    this.#maxEntries = maxEntries;
  }

  bind(client: CDPSession): void {
    this.#client = client;
    client.on('Network.requestWillBeSent', this.#onRequestWillBeSent);
    client.on('Network.responseReceived', this.#onResponseReceived);
    client.on('Network.loadingFinished', this.#onLoadingFinished);
    client.on('Network.loadingFailed', this.#onLoadingFailed);
  }

  unbind(): void {
    const client = this.#client;
    if (!client) {
      return;
    }
    client.off('Network.requestWillBeSent', this.#onRequestWillBeSent);
    client.off('Network.responseReceived', this.#onResponseReceived);
    client.off('Network.loadingFinished', this.#onLoadingFinished);
    client.off('Network.loadingFailed', this.#onLoadingFailed);
    this.#client = null;
  }

  clear(): void {
    this.#byCdpId.clear();
    this.#order = [];
    this.#idToCdpId.clear();
  }

  #onRequestWillBeSent = (
    event: Protocol.Network.RequestWillBeSentEvent,
  ): void => {
    const existing = this.#byCdpId.get(event.requestId);
    if (existing) {
      // Redirect chain reuses the requestId; refresh the target.
      existing.url = event.request.url;
      existing.method = event.request.method;
      existing.requestHeaders = {...event.request.headers};
      if (event.request.postData !== undefined) {
        existing.requestBody = event.request.postData;
      }
      return;
    }
    const record: CapturedRequest = {
      id: this.#nextId++,
      cdpRequestId: event.requestId,
      url: event.request.url,
      method: event.request.method,
      resourceType: event.type,
      requestHeaders: {...event.request.headers},
      requestBody: event.request.postData,
      startTime: event.wallTime ? event.wallTime * 1000 : Date.now(),
      finished: false,
    };
    this.#insert(record);
  };

  #onResponseReceived = (
    event: Protocol.Network.ResponseReceivedEvent,
  ): void => {
    const record = this.#byCdpId.get(event.requestId);
    if (!record) {
      return;
    }
    record.status = event.response.status;
    record.statusText = event.response.statusText;
    record.responseHeaders = {...event.response.headers};
    record.mimeType = event.response.mimeType;
    record.remoteIPAddress = event.response.remoteIPAddress;
    record.fromCache = event.response.fromDiskCache;
    if (!record.resourceType) {
      record.resourceType = event.type;
    }
  };

  #onLoadingFinished = (event: Protocol.Network.LoadingFinishedEvent): void => {
    const record = this.#byCdpId.get(event.requestId);
    if (!record) {
      return;
    }
    record.finished = true;
    record.endTime = Date.now();
    record.encodedDataLength = event.encodedDataLength;
  };

  #onLoadingFailed = (event: Protocol.Network.LoadingFailedEvent): void => {
    const record = this.#byCdpId.get(event.requestId);
    if (!record) {
      return;
    }
    record.finished = true;
    record.failed = true;
    record.errorText = event.errorText;
    record.endTime = Date.now();
  };

  #insert(record: CapturedRequest): void {
    this.#byCdpId.set(record.cdpRequestId, record);
    this.#idToCdpId.set(record.id, record.cdpRequestId);
    this.#order.push(record.cdpRequestId);
    while (this.#order.length > this.#maxEntries) {
      const evicted = this.#order.shift();
      if (evicted !== undefined) {
        const old = this.#byCdpId.get(evicted);
        if (old) {
          this.#idToCdpId.delete(old.id);
        }
        this.#byCdpId.delete(evicted);
      }
    }
  }

  getAll(): CapturedRequest[] {
    return this.#order
      .map(id => this.#byCdpId.get(id))
      .filter((r): r is CapturedRequest => r !== undefined);
  }

  getById(id: number): CapturedRequest | undefined {
    const cdpId = this.#idToCdpId.get(id);
    return cdpId ? this.#byCdpId.get(cdpId) : undefined;
  }

  getByCdpId(cdpRequestId: string): CapturedRequest | undefined {
    return this.#byCdpId.get(cdpRequestId);
  }

  query(q: RequestQuery): CapturedRequest[] {
    const method = q.method?.toUpperCase();
    let results = this.getAll().filter(r => {
      if (q.urlPattern && !matchUrl(r.url, q.urlPattern, q.isRegex ?? false)) {
        return false;
      }
      if (method && r.method.toUpperCase() !== method) {
        return false;
      }
      if (q.status !== undefined && r.status !== q.status) {
        return false;
      }
      if (q.resourceType && r.resourceType !== q.resourceType) {
        return false;
      }
      return true;
    });
    if (q.limit && q.limit > 0) {
      results = results.slice(-q.limit);
    }
    return results;
  }

  /**
   * Lazily fetch a response body via CDP. Returns the decoded text (binary
   * bodies are returned as base64 with `base64: true`).
   */
  async getResponseBody(
    id: number,
  ): Promise<{body: string; base64: boolean} | undefined> {
    const record = this.getById(id);
    if (!record || !this.#client) {
      return undefined;
    }
    try {
      const result = await this.#client.send('Network.getResponseBody', {
        requestId: record.cdpRequestId,
      });
      return {body: result.body, base64: result.base64Encoded};
    } catch {
      return undefined;
    }
  }
}
