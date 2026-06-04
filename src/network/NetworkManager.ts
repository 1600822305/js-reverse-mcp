/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Debugger} from '../third_party/index.js';

import {EventSourceTracker} from './EventSourceTracker.js';
import {InterceptRegistry} from './InterceptRegistry.js';
import {RequestStore} from './RequestStore.js';
import {WebSocketTracker} from './WebSocketTracker.js';

/**
 * Coordinates all CDP-native network tooling against the currently selected
 * page's CDP session: request/response capture, rule-based interception,
 * WebSocket and EventSource tracking.
 *
 * The manager is rebound whenever the selected page changes (see
 * `McpContext.reinitDebugger`). `Network.enable` is shared with puppeteer's own
 * collector, so it is enabled but never disabled here; only the `Fetch` domain
 * (owned exclusively by the interception registry) is toggled.
 */
export class NetworkManager {
  readonly store: RequestStore;
  readonly intercept: InterceptRegistry;
  readonly websocket: WebSocketTracker;
  readonly eventSource: EventSourceTracker;

  #client: CDPSession | null = null;
  #logger: Debugger;

  constructor(logger: Debugger) {
    this.#logger = logger;
    this.store = new RequestStore();
    this.intercept = new InterceptRegistry();
    this.websocket = new WebSocketTracker();
    this.eventSource = new EventSourceTracker(
      cdpId => this.store.getByCdpId(cdpId)?.url,
    );
  }

  isBound(): boolean {
    return this.#client !== null;
  }

  getClient(): CDPSession | null {
    return this.#client;
  }

  async bind(client: CDPSession): Promise<void> {
    if (this.#client === client) {
      return;
    }
    this.unbind();
    this.#client = client;
    this.store.bind(client);
    this.intercept.bind(client);
    this.websocket.bind(client);
    this.eventSource.bind(client);
    try {
      await client.send('Network.enable');
    } catch (error) {
      this.#logger('Failed to enable Network domain for NetworkManager', error);
    }
  }

  unbind(): void {
    if (!this.#client) {
      return;
    }
    this.store.unbind();
    this.intercept.unbind();
    this.websocket.unbind();
    this.eventSource.unbind();
    this.#client = null;
  }
}
