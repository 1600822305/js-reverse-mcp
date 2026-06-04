/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Protocol} from '../third_party/index.js';

import {matchUrl} from './match.js';
import type {SseMessage} from './types.js';

/**
 * Captures Server-Sent Events (EventSource) messages via the CDP
 * `Network.eventSourceMessageReceived` event. The store maps the CDP request
 * id back to the originating request URL using a supplied resolver, scoped by
 * the session that captured it (request ids are only unique per session).
 */
export class EventSourceTracker {
  #messages: SseMessage[] = [];
  #enabled = false;
  #sessions = new Map<
    CDPSession,
    (e: Protocol.Network.EventSourceMessageReceivedEvent) => void
  >();
  readonly #maxMessages: number;
  readonly #resolveUrl: (
    sessionKey: string,
    cdpRequestId: string,
  ) => string | undefined;

  constructor(
    resolveUrl: (
      sessionKey: string,
      cdpRequestId: string,
    ) => string | undefined,
    maxMessages = 5000,
  ) {
    this.#resolveUrl = resolveUrl;
    this.#maxMessages = maxMessages;
  }

  bindSession(client: CDPSession, sessionKey: string): void {
    if (this.#sessions.has(client)) {
      return;
    }
    const handler = (
      e: Protocol.Network.EventSourceMessageReceivedEvent,
    ): void => this.#onMessage(sessionKey, e);
    this.#sessions.set(client, handler);
    client.on('Network.eventSourceMessageReceived', handler);
  }

  unbindSession(client: CDPSession): void {
    const handler = this.#sessions.get(client);
    if (!handler) {
      return;
    }
    client.off('Network.eventSourceMessageReceived', handler);
    this.#sessions.delete(client);
  }

  unbindAll(): void {
    for (const client of [...this.#sessions.keys()]) {
      this.unbindSession(client);
    }
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  isEnabled(): boolean {
    return this.#enabled;
  }

  clear(): void {
    this.#messages = [];
  }

  #onMessage = (
    sessionKey: string,
    event: Protocol.Network.EventSourceMessageReceivedEvent,
  ): void => {
    if (!this.#enabled) {
      return;
    }
    this.#messages.push({
      cdpRequestId: event.requestId,
      url: this.#resolveUrl(sessionKey, event.requestId) ?? '',
      eventName: event.eventName,
      data: event.data,
      eventId: event.eventId,
      timestamp: Date.now(),
    });
    while (this.#messages.length > this.#maxMessages) {
      this.#messages.shift();
    }
  };

  query(opts: {
    urlPattern?: string;
    isRegex?: boolean;
    contains?: string;
    limit?: number;
  }): SseMessage[] {
    let messages = this.#messages.filter(m => {
      if (
        opts.urlPattern &&
        !matchUrl(m.url, opts.urlPattern, opts.isRegex ?? false)
      ) {
        return false;
      }
      if (opts.contains && !m.data.includes(opts.contains)) {
        return false;
      }
      return true;
    });
    if (opts.limit && opts.limit > 0) {
      messages = messages.slice(-opts.limit);
    }
    return messages;
  }
}
