/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Debugger} from '../third_party/index.js';
import {CDPSessionEvent} from '../third_party/index.js';

import {EventSourceTracker} from './EventSourceTracker.js';
import {InterceptRegistry} from './InterceptRegistry.js';
import {RequestStore} from './RequestStore.js';
import {WebSocketTracker} from './WebSocketTracker.js';

interface BoundSession {
  key: string;
  onAttached: (child: CDPSession) => void;
  onDetached: (child: CDPSession) => void;
}

/**
 * Coordinates all CDP-native network tooling for the currently selected page
 * and every target auto-attached beneath it: request/response capture,
 * rule-based interception, WebSocket and EventSource tracking.
 *
 * To cover traffic that the main page session never sees -- service workers,
 * dedicated/shared workers and cross-origin iframes (OOPIFs) -- the manager
 * drives `Target.setAutoAttach({flatten:true})` from the root session and binds
 * every child session that attaches (recursively). Each session is given a
 * stable key so the per-session stores can disambiguate CDP request ids, which
 * are only unique within a single session.
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

  #root: CDPSession | null = null;
  #sessions = new Map<CDPSession, BoundSession>();
  #nextSessionKey = 0;
  #logger: Debugger;

  constructor(logger: Debugger) {
    this.#logger = logger;
    this.store = new RequestStore();
    this.intercept = new InterceptRegistry();
    this.websocket = new WebSocketTracker();
    this.eventSource = new EventSourceTracker(
      (sessionKey, cdpId) =>
        this.store.getBySessionCdpId(sessionKey, cdpId)?.url,
    );
  }

  isBound(): boolean {
    return this.#root !== null;
  }

  /** The root (main page) session. Used by page-scoped tools (conditions). */
  getClient(): CDPSession | null {
    return this.#root;
  }

  /** Number of currently bound CDP sessions (page + auto-attached targets). */
  sessionCount(): number {
    return this.#sessions.size;
  }

  async bind(client: CDPSession): Promise<void> {
    if (this.#root === client) {
      return;
    }
    this.unbind();
    this.#root = client;
    await this.#bindSession(client, true);
  }

  unbind(): void {
    if (!this.#root) {
      return;
    }
    for (const client of [...this.#sessions.keys()]) {
      this.#unbindSession(client);
    }
    this.#root = null;
  }

  async #bindSession(client: CDPSession, isRoot: boolean): Promise<void> {
    if (this.#sessions.has(client)) {
      return;
    }
    const key = `s${this.#nextSessionKey++}`;
    const onAttached = (child: CDPSession): void => {
      void this.#bindSession(child, false);
    };
    const onDetached = (child: CDPSession): void => {
      this.#unbindSession(child);
    };
    this.#sessions.set(client, {key, onAttached, onDetached});

    this.store.bindSession(client, key);
    this.intercept.bindSession(client);
    this.websocket.bindSession(client, key);
    this.eventSource.bindSession(client, key);

    // Listen for child targets before enabling auto-attach so none are missed.
    client.on(CDPSessionEvent.SessionAttached, onAttached);
    client.on(CDPSessionEvent.SessionDetached, onDetached);

    try {
      await client.send('Network.enable');
    } catch (error) {
      this.#logger('Failed to enable Network domain', error);
    }
    try {
      await client.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
      });
    } catch (error) {
      this.#logger('Failed to set auto-attach', error);
    }
    if (!isRoot) {
      // The child paused on start (waitForDebuggerOnStart) so we could enable
      // capture before it ran; resume it now.
      try {
        await client.send('Runtime.runIfWaitingForDebugger');
      } catch {
        // Some target types do not support this; ignore.
      }
    }
  }

  #unbindSession(client: CDPSession): void {
    const bound = this.#sessions.get(client);
    if (!bound) {
      return;
    }
    client.off(CDPSessionEvent.SessionAttached, bound.onAttached);
    client.off(CDPSessionEvent.SessionDetached, bound.onDetached);
    this.store.unbindSession(client);
    this.intercept.unbindSession(client);
    this.websocket.unbindSession(client);
    this.eventSource.unbindSession(client);
    this.#sessions.delete(client);
  }
}
