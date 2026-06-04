/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Protocol} from '../third_party/index.js';

/**
 * A single captured network exchange (request + response), collected via the
 * CDP `Network` domain and stored on the Node side so it survives navigations
 * and remains queryable independently of the DevTools UI.
 */
export interface CapturedRequest {
  /** Stable, monotonically increasing numeric id assigned by the store. */
  id: number;
  /** The underlying CDP `Network.RequestId`. */
  cdpRequestId: string;
  url: string;
  method: string;
  resourceType?: string;
  /**
   * Redirect hops that preceded the final request. CDP reuses one
   * `RequestId` across a redirect chain, so each intermediate 3xx is recorded
   * here instead of being overwritten.
   */
  redirects?: Array<{url: string; status: number; statusText?: string}>;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  mimeType?: string;
  remoteIPAddress?: string;
  fromCache?: boolean;
  failed?: boolean;
  errorText?: string;
  /** Wall-clock timestamps in milliseconds. */
  startTime: number;
  endTime?: number;
  encodedDataLength?: number;
  finished: boolean;
}

/** The CDP interception stage a rule applies to. */
export type RuleStage = 'Request' | 'Response';

/** The action a matching rule performs. */
export type RuleAction =
  | 'continue'
  | 'modifyRequest'
  | 'modifyResponse'
  | 'mock'
  | 'block';

export interface NetworkRuleStats {
  matched: number;
  modified: number;
  blocked: number;
  mocked: number;
}

/**
 * A network interception rule. Rules are evaluated by {@link
 * InterceptRegistry} inside a single shared `Fetch.requestPaused` handler.
 */
export interface NetworkRule {
  id: string;
  /** URL matcher. Glob (`*`) by default, or a JS regex when `isRegex`. */
  urlPattern: string;
  isRegex: boolean;
  /** Uppercase HTTP methods to match. Empty/undefined means any. */
  methods?: string[];
  /** CDP resource types to match. Empty/undefined means any. */
  resourceTypes?: string[];
  stage: RuleStage;
  action: RuleAction;
  // ----- request modifications (modifyRequest) -----
  setUrl?: string;
  setMethod?: string;
  setHeaders?: Record<string, string>;
  removeHeaders?: string[];
  setRequestBody?: string;
  // ----- response (modifyResponse / mock) -----
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  /** Delay applied before fulfilling a mock/modifyResponse, in milliseconds. */
  delayMs?: number;
  // ----- block -----
  failReason?: Protocol.Network.ErrorReason;
  stats: NetworkRuleStats;
}

export interface WsConnection {
  id: number;
  cdpRequestId: string;
  url: string;
  createdAt: number;
  closed: boolean;
  sentCount: number;
  receivedCount: number;
}

export interface WsFrame {
  connectionId: number;
  url: string;
  direction: 'sent' | 'received';
  opcode: number;
  isBinary: boolean;
  /** Text payload, or base64 for binary frames. */
  payload: string;
  base64: boolean;
  timestamp: number;
}

export interface SseMessage {
  cdpRequestId: string;
  url: string;
  eventName: string;
  data: string;
  eventId: string;
  timestamp: number;
}
