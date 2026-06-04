/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Protocol} from '../third_party/index.js';

import {matchUrl} from './match.js';
import type {WsConnection, WsFrame} from './types.js';

/**
 * Captures WebSocket traffic via the CDP `Network` domain
 * (`webSocketCreated` / `webSocketFrameSent` / `webSocketFrameReceived` /
 * `webSocketClosed`).
 *
 * This replaces the old JS monkey-patch approach (`window.WebSocket = ...`),
 * which was injected after page load (missing early/post-navigation sockets),
 * recorded only the byte length of binary frames, was detectable by anti-debug
 * scripts, and only stored message previews in the console.
 *
 * Sockets are aggregated across every bound CDP session (page + auto-attached
 * workers/iframes). CDP `requestId`s are only unique per session, so
 * connections are keyed by a composite `sessionKey\0requestId`.
 */
interface WsSessionHandlers {
  created: (e: Protocol.Network.WebSocketCreatedEvent) => void;
  frameSent: (e: Protocol.Network.WebSocketFrameSentEvent) => void;
  frameReceived: (e: Protocol.Network.WebSocketFrameReceivedEvent) => void;
  closed: (e: Protocol.Network.WebSocketClosedEvent) => void;
}

export class WebSocketTracker {
  #connections = new Map<string, WsConnection>();
  #frames: WsFrame[] = [];
  #nextId = 1;
  #enabled = false;
  #sessions = new Map<CDPSession, {key: string; handlers: WsSessionHandlers}>();
  readonly #maxFrames: number;

  constructor(maxFrames = 5000) {
    this.#maxFrames = maxFrames;
  }

  #key(sessionKey: string, requestId: string): string {
    return `${sessionKey}\u0000${requestId}`;
  }

  bindSession(client: CDPSession, sessionKey: string): void {
    if (this.#sessions.has(client)) {
      return;
    }
    const handlers: WsSessionHandlers = {
      created: e => this.#onCreated(sessionKey, e),
      frameSent: e => this.#record(sessionKey, e.requestId, 'sent', e.response),
      frameReceived: e =>
        this.#record(sessionKey, e.requestId, 'received', e.response),
      closed: e => this.#onClosed(sessionKey, e),
    };
    this.#sessions.set(client, {key: sessionKey, handlers});
    client.on('Network.webSocketCreated', handlers.created);
    client.on('Network.webSocketFrameSent', handlers.frameSent);
    client.on('Network.webSocketFrameReceived', handlers.frameReceived);
    client.on('Network.webSocketClosed', handlers.closed);
  }

  unbindSession(client: CDPSession): void {
    const entry = this.#sessions.get(client);
    if (!entry) {
      return;
    }
    client.off('Network.webSocketCreated', entry.handlers.created);
    client.off('Network.webSocketFrameSent', entry.handlers.frameSent);
    client.off('Network.webSocketFrameReceived', entry.handlers.frameReceived);
    client.off('Network.webSocketClosed', entry.handlers.closed);
    this.#sessions.delete(client);
  }

  unbindAll(): void {
    for (const client of [...this.#sessions.keys()]) {
      this.unbindSession(client);
    }
  }

  /** Whether message capture is active. When false, frames are dropped. */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  isEnabled(): boolean {
    return this.#enabled;
  }

  clear(): void {
    this.#connections.clear();
    this.#frames = [];
  }

  #onCreated = (
    sessionKey: string,
    event: Protocol.Network.WebSocketCreatedEvent,
  ): void => {
    const key = this.#key(sessionKey, event.requestId);
    if (this.#connections.has(key)) {
      return;
    }
    this.#connections.set(key, {
      id: this.#nextId++,
      cdpRequestId: event.requestId,
      url: event.url,
      createdAt: Date.now(),
      closed: false,
      sentCount: 0,
      receivedCount: 0,
    });
  };

  #record(
    sessionKey: string,
    requestId: string,
    direction: 'sent' | 'received',
    frame: Protocol.Network.WebSocketFrame,
  ): void {
    if (!this.#enabled) {
      return;
    }
    const conn = this.#connections.get(this.#key(sessionKey, requestId));
    if (!conn) {
      return;
    }
    if (direction === 'sent') {
      conn.sentCount++;
    } else {
      conn.receivedCount++;
    }
    // opcode 1 = text, 2 = binary, 8 = close, 9 = ping, 10 = pong.
    const isBinary = frame.opcode === 2;
    this.#frames.push({
      connectionId: conn.id,
      url: conn.url,
      direction,
      opcode: frame.opcode,
      isBinary,
      payload: frame.payloadData,
      base64: isBinary,
      timestamp: Date.now(),
    });
    while (this.#frames.length > this.#maxFrames) {
      this.#frames.shift();
    }
  }

  #onClosed = (
    sessionKey: string,
    event: Protocol.Network.WebSocketClosedEvent,
  ): void => {
    const conn = this.#connections.get(this.#key(sessionKey, event.requestId));
    if (conn) {
      conn.closed = true;
    }
  };

  listConnections(): WsConnection[] {
    return [...this.#connections.values()];
  }

  queryFrames(opts: {
    connectionId?: number;
    urlPattern?: string;
    isRegex?: boolean;
    direction?: 'sent' | 'received';
    contains?: string;
    limit?: number;
  }): WsFrame[] {
    let frames = this.#frames.filter(f => {
      if (
        opts.connectionId !== undefined &&
        f.connectionId !== opts.connectionId
      ) {
        return false;
      }
      if (opts.direction && f.direction !== opts.direction) {
        return false;
      }
      if (
        opts.urlPattern &&
        !matchUrl(f.url, opts.urlPattern, opts.isRegex ?? false)
      ) {
        return false;
      }
      if (opts.contains) {
        // Binary frame payloads are stored base64-encoded; decode best-effort
        // so the substring search runs against the actual frame contents.
        const text = f.base64
          ? Buffer.from(f.payload, 'base64').toString('utf8')
          : f.payload;
        if (!text.includes(opts.contains)) {
          return false;
        }
      }
      return true;
    });
    if (opts.limit && opts.limit > 0) {
      frames = frames.slice(-opts.limit);
    }
    return frames;
  }
}
