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
 */
export class WebSocketTracker {
  #client: CDPSession | null = null;
  #connections = new Map<string, WsConnection>();
  #frames: WsFrame[] = [];
  #nextId = 1;
  #enabled = false;
  readonly #maxFrames: number;

  constructor(maxFrames = 5000) {
    this.#maxFrames = maxFrames;
  }

  bind(client: CDPSession): void {
    this.#client = client;
    client.on('Network.webSocketCreated', this.#onCreated);
    client.on('Network.webSocketFrameSent', this.#onFrameSent);
    client.on('Network.webSocketFrameReceived', this.#onFrameReceived);
    client.on('Network.webSocketClosed', this.#onClosed);
  }

  unbind(): void {
    const client = this.#client;
    if (!client) {
      return;
    }
    client.off('Network.webSocketCreated', this.#onCreated);
    client.off('Network.webSocketFrameSent', this.#onFrameSent);
    client.off('Network.webSocketFrameReceived', this.#onFrameReceived);
    client.off('Network.webSocketClosed', this.#onClosed);
    this.#client = null;
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

  #onCreated = (event: Protocol.Network.WebSocketCreatedEvent): void => {
    if (this.#connections.has(event.requestId)) {
      return;
    }
    this.#connections.set(event.requestId, {
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
    requestId: string,
    direction: 'sent' | 'received',
    frame: Protocol.Network.WebSocketFrame,
  ): void {
    if (!this.#enabled) {
      return;
    }
    const conn = this.#connections.get(requestId);
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

  #onFrameSent = (event: Protocol.Network.WebSocketFrameSentEvent): void => {
    this.#record(event.requestId, 'sent', event.response);
  };

  #onFrameReceived = (
    event: Protocol.Network.WebSocketFrameReceivedEvent,
  ): void => {
    this.#record(event.requestId, 'received', event.response);
  };

  #onClosed = (event: Protocol.Network.WebSocketClosedEvent): void => {
    const conn = this.#connections.get(event.requestId);
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
      if (opts.contains && !f.payload.includes(opts.contains)) {
        return false;
      }
      return true;
    });
    if (opts.limit && opts.limit > 0) {
      frames = frames.slice(-opts.limit);
    }
    return frames;
  }
}
