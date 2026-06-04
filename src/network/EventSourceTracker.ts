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
 * id back to the originating request URL using a supplied resolver.
 */
export class EventSourceTracker {
  #client: CDPSession | null = null;
  #messages: SseMessage[] = [];
  #enabled = false;
  readonly #maxMessages: number;
  readonly #resolveUrl: (cdpRequestId: string) => string | undefined;

  constructor(
    resolveUrl: (cdpRequestId: string) => string | undefined,
    maxMessages = 5000,
  ) {
    this.#resolveUrl = resolveUrl;
    this.#maxMessages = maxMessages;
  }

  bind(client: CDPSession): void {
    this.#client = client;
    client.on('Network.eventSourceMessageReceived', this.#onMessage);
  }

  unbind(): void {
    const client = this.#client;
    if (!client) {
      return;
    }
    client.off('Network.eventSourceMessageReceived', this.#onMessage);
    this.#client = null;
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
    event: Protocol.Network.EventSourceMessageReceivedEvent,
  ): void => {
    if (!this.#enabled) {
      return;
    }
    this.#messages.push({
      cdpRequestId: event.requestId,
      url: this.#resolveUrl(event.requestId) ?? '',
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
