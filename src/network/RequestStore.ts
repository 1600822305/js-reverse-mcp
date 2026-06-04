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

export type WaitPhase = 'request' | 'response';

export interface WaitOptions {
  urlPattern?: string;
  isRegex?: boolean;
  method?: string;
  resourceType?: string;
  /**
   * `request` resolves as soon as a matching request is observed; `response`
   * waits until the matching request has a response (or has failed).
   */
  phase: WaitPhase;
  timeoutMs: number;
  /** When true, ignore already-captured matches and wait for a fresh one. */
  newOnly?: boolean;
}

interface Waiter {
  phase: WaitPhase;
  match: (r: CapturedRequest) => boolean;
  resolve: (r: CapturedRequest) => void;
}

interface SessionHandlers {
  requestWillBeSent: (e: Protocol.Network.RequestWillBeSentEvent) => void;
  responseReceived: (e: Protocol.Network.ResponseReceivedEvent) => void;
  loadingFinished: (e: Protocol.Network.LoadingFinishedEvent) => void;
  loadingFailed: (e: Protocol.Network.LoadingFailedEvent) => void;
}

/**
 * Collects request/response metadata from the CDP `Network` domain into a
 * bounded, queryable store on the Node side. Unlike the puppeteer-backed
 * collector this keeps full request/response bodies retrievable on demand and
 * is not tied to the DevTools UI selection.
 *
 * The store aggregates traffic from multiple CDP sessions (the main page plus
 * auto-attached service workers, dedicated workers and OOPIFs). CDP request ids
 * are only unique within a session, so records are keyed by a composite
 * `sessionKey\0requestId` and each record remembers the session that produced
 * it so response bodies can be fetched from the correct target.
 */
export class RequestStore {
  #byKey = new Map<string, CapturedRequest>();
  #order: string[] = [];
  #idToKey = new Map<number, string>();
  #idToSession = new Map<number, CDPSession>();
  #sessions = new Map<CDPSession, {key: string; handlers: SessionHandlers}>();
  #nextId = 1;
  #waiters = new Set<Waiter>();
  readonly #maxEntries: number;

  constructor(maxEntries = 2000) {
    this.#maxEntries = maxEntries;
  }

  bindSession(client: CDPSession, sessionKey: string): void {
    if (this.#sessions.has(client)) {
      return;
    }
    const handlers: SessionHandlers = {
      requestWillBeSent: e => this.#onRequestWillBeSent(sessionKey, client, e),
      responseReceived: e => this.#onResponseReceived(sessionKey, e),
      loadingFinished: e => this.#onLoadingFinished(sessionKey, e),
      loadingFailed: e => this.#onLoadingFailed(sessionKey, e),
    };
    this.#sessions.set(client, {key: sessionKey, handlers});
    client.on('Network.requestWillBeSent', handlers.requestWillBeSent);
    client.on('Network.responseReceived', handlers.responseReceived);
    client.on('Network.loadingFinished', handlers.loadingFinished);
    client.on('Network.loadingFailed', handlers.loadingFailed);
  }

  unbindSession(client: CDPSession): void {
    const entry = this.#sessions.get(client);
    if (!entry) {
      return;
    }
    client.off('Network.requestWillBeSent', entry.handlers.requestWillBeSent);
    client.off('Network.responseReceived', entry.handlers.responseReceived);
    client.off('Network.loadingFinished', entry.handlers.loadingFinished);
    client.off('Network.loadingFailed', entry.handlers.loadingFailed);
    this.#sessions.delete(client);
  }

  unbindAll(): void {
    for (const client of [...this.#sessions.keys()]) {
      this.unbindSession(client);
    }
  }

  clear(): void {
    this.#byKey.clear();
    this.#order = [];
    this.#idToKey.clear();
    this.#idToSession.clear();
  }

  #key(sessionKey: string, requestId: string): string {
    return `${sessionKey}\u0000${requestId}`;
  }

  #onRequestWillBeSent = (
    sessionKey: string,
    client: CDPSession,
    event: Protocol.Network.RequestWillBeSentEvent,
  ): void => {
    const key = this.#key(sessionKey, event.requestId);
    const existing = this.#byKey.get(key);
    if (existing) {
      // CDP reuses the requestId across a redirect chain. Record the hop we are
      // leaving (its URL + 3xx status from redirectResponse) before retargeting.
      const redirect = event.redirectResponse;
      if (redirect) {
        (existing.redirects ??= []).push({
          url: existing.url,
          status: redirect.status,
          statusText: redirect.statusText,
        });
      }
      existing.url = event.request.url;
      existing.method = event.request.method;
      existing.requestHeaders = {...event.request.headers};
      if (event.request.postData !== undefined) {
        existing.requestBody = event.request.postData;
      }
      existing.hasPostData = event.request.hasPostData ?? existing.hasPostData;
      this.#notify(existing, 'request');
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
      hasPostData: event.request.hasPostData,
      startTime: event.wallTime ? event.wallTime * 1000 : Date.now(),
      finished: false,
    };
    this.#insert(key, record, client);
    this.#notify(record, 'request');
  };

  #onResponseReceived = (
    sessionKey: string,
    event: Protocol.Network.ResponseReceivedEvent,
  ): void => {
    const record = this.#byKey.get(this.#key(sessionKey, event.requestId));
    if (!record) {
      return;
    }
    record.status = event.response.status;
    record.statusText = event.response.statusText;
    record.responseHeaders = {...event.response.headers};
    record.mimeType = event.response.mimeType;
    record.remoteIPAddress = event.response.remoteIPAddress;
    record.fromCache = event.response.fromDiskCache;
    record.timing = event.response.timing ?? undefined;
    if (!record.resourceType) {
      record.resourceType = event.type;
    }
    this.#notify(record, 'response');
  };

  #onLoadingFinished = (
    sessionKey: string,
    event: Protocol.Network.LoadingFinishedEvent,
  ): void => {
    const record = this.#byKey.get(this.#key(sessionKey, event.requestId));
    if (!record) {
      return;
    }
    record.finished = true;
    record.endTime = Date.now();
    record.encodedDataLength = event.encodedDataLength;
    this.#notify(record, 'response');
  };

  #onLoadingFailed = (
    sessionKey: string,
    event: Protocol.Network.LoadingFailedEvent,
  ): void => {
    const record = this.#byKey.get(this.#key(sessionKey, event.requestId));
    if (!record) {
      return;
    }
    record.finished = true;
    record.failed = true;
    record.errorText = event.errorText;
    record.endTime = Date.now();
    this.#notify(record, 'response');
  };

  #insert(key: string, record: CapturedRequest, client: CDPSession): void {
    this.#byKey.set(key, record);
    this.#idToKey.set(record.id, key);
    this.#idToSession.set(record.id, client);
    this.#order.push(key);
    while (this.#order.length > this.#maxEntries) {
      const evicted = this.#order.shift();
      if (evicted !== undefined) {
        const old = this.#byKey.get(evicted);
        if (old) {
          this.#idToKey.delete(old.id);
          this.#idToSession.delete(old.id);
        }
        this.#byKey.delete(evicted);
      }
    }
  }

  getAll(): CapturedRequest[] {
    return this.#order
      .map(key => this.#byKey.get(key))
      .filter((r): r is CapturedRequest => r !== undefined);
  }

  getById(id: number): CapturedRequest | undefined {
    const key = this.#idToKey.get(id);
    return key ? this.#byKey.get(key) : undefined;
  }

  /** Look up a record by the session that captured it and its CDP request id. */
  getBySessionCdpId(
    sessionKey: string,
    cdpRequestId: string,
  ): CapturedRequest | undefined {
    return this.#byKey.get(this.#key(sessionKey, cdpRequestId));
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
   * Lazily fetch a response body via CDP from the session that captured the
   * request. Returns the decoded text (binary bodies are returned as base64
   * with `base64: true`). Falls back to `Network.getRequestPostData` semantics
   * are handled by the caller; this only fetches response bodies.
   */
  async getResponseBody(
    id: number,
  ): Promise<{body: string; base64: boolean} | undefined> {
    const record = this.getById(id);
    const client = this.#idToSession.get(id);
    if (!record || !client) {
      return undefined;
    }
    try {
      const result = await client.send('Network.getResponseBody', {
        requestId: record.cdpRequestId,
      });
      return {body: result.body, base64: result.base64Encoded};
    } catch {
      return undefined;
    }
  }

  #notify(record: CapturedRequest, phase: WaitPhase): void {
    if (this.#waiters.size === 0) {
      return;
    }
    for (const waiter of [...this.#waiters]) {
      // A `response` waiter is also satisfied by a `response`-phase event; a
      // `request` waiter only by a `request`-phase event.
      if (waiter.phase === 'request' && phase !== 'request') {
        continue;
      }
      if (waiter.phase === 'response' && phase !== 'response') {
        continue;
      }
      if (waiter.match(record)) {
        this.#waiters.delete(waiter);
        waiter.resolve(record);
      }
    }
  }

  /**
   * Resolve once a request matching `opts` is observed. Returns the matching
   * record, or `undefined` if `timeoutMs` elapses first. Unless `newOnly` is
   * set, an already-captured match is returned immediately.
   */
  waitFor(opts: WaitOptions): Promise<CapturedRequest | undefined> {
    const method = opts.method?.toUpperCase();
    const matchesFilters = (r: CapturedRequest): boolean => {
      if (
        opts.urlPattern &&
        !matchUrl(r.url, opts.urlPattern, opts.isRegex ?? false)
      ) {
        return false;
      }
      if (method && r.method.toUpperCase() !== method) {
        return false;
      }
      if (opts.resourceType && r.resourceType !== opts.resourceType) {
        return false;
      }
      return true;
    };
    const hasResponse = (r: CapturedRequest): boolean =>
      r.status !== undefined || r.failed === true;
    const match = (r: CapturedRequest): boolean => {
      if (!matchesFilters(r)) {
        return false;
      }
      return opts.phase === 'response' ? hasResponse(r) : true;
    };

    if (!opts.newOnly) {
      const existing = this.getAll().filter(match);
      if (existing.length > 0) {
        return Promise.resolve(existing[existing.length - 1]);
      }
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = (r: CapturedRequest | undefined): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.#waiters.delete(waiter);
        resolve(r);
      };
      const timer = setTimeout(() => finish(undefined), opts.timeoutMs);
      const waiter: Waiter = {phase: opts.phase, match, resolve: finish};
      this.#waiters.add(waiter);
    });
  }

  /**
   * Return the request body, lazily fetching it via
   * `Network.getRequestPostData` when CDP omitted it from the
   * `requestWillBeSent` event (large POST bodies are not inlined). The fetched
   * value is cached back onto the record.
   */
  async getRequestBody(id: number): Promise<string | undefined> {
    const record = this.getById(id);
    if (!record) {
      return undefined;
    }
    if (record.requestBody !== undefined) {
      return record.requestBody;
    }
    if (!record.hasPostData) {
      return undefined;
    }
    const client = this.#idToSession.get(id);
    if (!client) {
      return undefined;
    }
    try {
      const result = await client.send('Network.getRequestPostData', {
        requestId: record.cdpRequestId,
      });
      record.requestBody = result.postData;
      return result.postData;
    } catch {
      return undefined;
    }
  }
}
