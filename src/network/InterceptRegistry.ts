/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Protocol} from '../third_party/index.js';

import {matchUrl, recordToHeaderEntries, toCdpUrlPattern} from './match.js';
import type {NetworkRule, RuleStage} from './types.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function headerArrayToRecord(
  headers: Protocol.Fetch.HeaderEntry[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const {name, value} of headers ?? []) {
    out[name] = value;
  }
  return out;
}

/** Case-insensitive header lookup. */
function findHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return undefined;
}

/** Every named header must exist and contain the expected substring. */
function headersContain(
  headers: Record<string, string>,
  conditions: Record<string, string>,
): boolean {
  for (const [name, expected] of Object.entries(conditions)) {
    const actual = findHeader(headers, name);
    if (
      actual === undefined ||
      !actual.toLowerCase().includes(expected.toLowerCase())
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Owns a single `Fetch.requestPaused` handler and a registry of interception
 * rules. This replaces the old `intercept_requests` design which:
 *   - called `Fetch.enable` per interceptor (CDP replaces patterns, so a second
 *     interceptor clobbered the first);
 *   - registered one Node-side handler per interceptor (every handler fired for
 *     every paused request, double-resolving the same requestId);
 *   - never removed handlers on stop (listener leak);
 *   - only supported the Request stage (no response inspection/rewrite).
 */
interface InterceptSession {
  handler: (e: Protocol.Fetch.RequestPausedEvent) => void;
  fetchEnabled: boolean;
}

export class InterceptRegistry {
  #rules = new Map<string, NetworkRule>();
  #sessions = new Map<CDPSession, InterceptSession>();

  bindSession(client: CDPSession): void {
    if (this.#sessions.has(client)) {
      return;
    }
    const handler = (e: Protocol.Fetch.RequestPausedEvent): void => {
      void this.#onRequestPaused(client, e);
    };
    this.#sessions.set(client, {handler, fetchEnabled: false});
    client.on('Fetch.requestPaused', handler);
    // Apply existing rules onto the new session (e.g. an auto-attached worker).
    if (this.#rules.size > 0) {
      void this.#applyPatternsTo(client);
    }
  }

  unbindSession(client: CDPSession): void {
    const entry = this.#sessions.get(client);
    if (!entry) {
      return;
    }
    client.off('Fetch.requestPaused', entry.handler);
    if (entry.fetchEnabled) {
      void client.send('Fetch.disable').catch(() => undefined);
    }
    this.#sessions.delete(client);
  }

  unbindAll(): void {
    for (const client of [...this.#sessions.keys()]) {
      this.unbindSession(client);
    }
  }

  listRules(): NetworkRule[] {
    return [...this.#rules.values()];
  }

  getRule(id: string): NetworkRule | undefined {
    return this.#rules.get(id);
  }

  async addRule(rule: NetworkRule): Promise<void> {
    this.#rules.set(rule.id, rule);
    await this.#applyPatterns();
  }

  async removeRule(id: string): Promise<boolean> {
    const existed = this.#rules.delete(id);
    if (existed) {
      await this.#applyPatterns();
    }
    return existed;
  }

  #buildPatterns(): Protocol.Fetch.RequestPattern[] {
    // De-duplicate (urlPattern, stage) pairs across all *active* rules.
    // `continue` rules are observe-only and handled passively by the request
    // store, so they emit no Fetch pattern (avoids interception latency) and
    // never participate in dispatch.
    const seen = new Set<string>();
    const patterns: Protocol.Fetch.RequestPattern[] = [];
    for (const rule of this.#rules.values()) {
      if (rule.action === 'continue') {
        continue;
      }
      const urlPattern = toCdpUrlPattern(rule.urlPattern, rule.isRegex);
      const key = `${urlPattern}\u0000${rule.stage}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      patterns.push({urlPattern, requestStage: rule.stage});
    }
    return patterns;
  }

  async #applyPatterns(): Promise<void> {
    await Promise.all(
      [...this.#sessions.keys()].map(client => this.#applyPatternsTo(client)),
    );
  }

  async #applyPatternsTo(client: CDPSession): Promise<void> {
    const entry = this.#sessions.get(client);
    if (!entry) {
      return;
    }
    const patterns = this.#buildPatterns();
    if (patterns.length === 0) {
      if (entry.fetchEnabled) {
        await client.send('Fetch.disable').catch(() => undefined);
        entry.fetchEnabled = false;
      }
      return;
    }
    await client.send('Fetch.enable', {patterns}).catch(() => undefined);
    entry.fetchEnabled = true;
  }

  #matchRule(
    stage: RuleStage,
    event: Protocol.Fetch.RequestPausedEvent,
  ): NetworkRule | undefined {
    const {request, resourceType} = event;
    const reqHeaders = request.headers;
    const respHeaders = headerArrayToRecord(event.responseHeaders);
    for (const rule of this.#rules.values()) {
      // `continue` rules are observe-only: they emit no Fetch pattern and must
      // not shadow a real action rule that caused this pause.
      if (rule.action === 'continue') {
        continue;
      }
      if (rule.stage !== stage) {
        continue;
      }
      if (!matchUrl(request.url, rule.urlPattern, rule.isRegex)) {
        continue;
      }
      if (
        rule.methods &&
        rule.methods.length > 0 &&
        !rule.methods.includes(request.method.toUpperCase())
      ) {
        continue;
      }
      if (
        rule.resourceTypes &&
        rule.resourceTypes.length > 0 &&
        !rule.resourceTypes.includes(resourceType)
      ) {
        continue;
      }
      if (
        rule.requestHeaderContains &&
        !headersContain(reqHeaders, rule.requestHeaderContains)
      ) {
        continue;
      }
      if (rule.requestBodyContains !== undefined) {
        const body = request.postData ?? '';
        if (
          !body.toLowerCase().includes(rule.requestBodyContains.toLowerCase())
        ) {
          continue;
        }
      }
      if (
        rule.responseHeaderContains &&
        !headersContain(respHeaders, rule.responseHeaderContains)
      ) {
        continue;
      }
      return rule;
    }
    return undefined;
  }

  #onRequestPaused = async (
    client: CDPSession,
    event: Protocol.Fetch.RequestPausedEvent,
  ): Promise<void> => {
    const {requestId, request} = event;
    const isResponseStage =
      event.responseStatusCode !== undefined ||
      event.responseErrorReason !== undefined;
    const stage: RuleStage = isResponseStage ? 'Response' : 'Request';

    const passThrough = async (): Promise<void> => {
      try {
        if (isResponseStage) {
          await client.send('Fetch.continueResponse', {requestId});
        } else {
          await client.send('Fetch.continueRequest', {requestId});
        }
      } catch {
        // Request may already be resolved or gone.
      }
    };

    const rule = this.#matchRule(stage, event);
    if (!rule) {
      await passThrough();
      return;
    }
    rule.stats.matched++;

    try {
      switch (rule.action) {
        case 'block': {
          await client.send('Fetch.failRequest', {
            requestId,
            errorReason: rule.failReason ?? 'BlockedByClient',
          });
          rule.stats.blocked++;
          break;
        }
        case 'mock': {
          if (rule.delayMs && rule.delayMs > 0) {
            await sleep(rule.delayMs);
          }
          const headers =
            rule.responseHeaders && Object.keys(rule.responseHeaders).length
              ? rule.responseHeaders
              : {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                };
          await client.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: rule.responseStatus ?? 200,
            responseHeaders: recordToHeaderEntries(headers),
            body:
              rule.responseBodyBase64 ??
              Buffer.from(rule.responseBody ?? '').toString('base64'),
          });
          rule.stats.mocked++;
          break;
        }
        case 'modifyRequest': {
          const headers = {...request.headers, ...(rule.setHeaders ?? {})};
          for (const name of rule.removeHeaders ?? []) {
            delete headers[name];
          }
          await client.send('Fetch.continueRequest', {
            requestId,
            url: rule.setUrl,
            method: rule.setMethod,
            headers: recordToHeaderEntries(headers),
            postData:
              rule.setRequestBody !== undefined
                ? Buffer.from(rule.setRequestBody).toString('base64')
                : undefined,
          });
          rule.stats.modified++;
          break;
        }
        case 'modifyResponse': {
          if (!isResponseStage) {
            // Should not happen (rule registered at Response stage) but be safe.
            await passThrough();
            break;
          }
          // Body is always forwarded to CDP base64-encoded. When the caller
          // does not supply a replacement we reuse the original body verbatim,
          // preserving binary payloads (images, protobuf) instead of mangling
          // them through a UTF-8 round-trip.
          let bodyBase64: string;
          if (rule.responseBodyBase64 !== undefined) {
            bodyBase64 = rule.responseBodyBase64;
          } else if (rule.responseBody !== undefined) {
            bodyBase64 = Buffer.from(rule.responseBody).toString('base64');
          } else {
            try {
              const current = await client.send('Fetch.getResponseBody', {
                requestId,
              });
              bodyBase64 = current.base64Encoded
                ? current.body
                : Buffer.from(current.body).toString('base64');
            } catch {
              bodyBase64 = '';
            }
          }
          const headers = {
            ...headerArrayToRecord(event.responseHeaders),
            ...(rule.responseHeaders ?? {}),
          };
          for (const name of rule.removeHeaders ?? []) {
            delete headers[name];
          }
          if (rule.delayMs && rule.delayMs > 0) {
            await sleep(rule.delayMs);
          }
          await client.send('Fetch.fulfillRequest', {
            requestId,
            responseCode:
              rule.responseStatus ?? event.responseStatusCode ?? 200,
            responseHeaders: recordToHeaderEntries(headers),
            body: bodyBase64,
          });
          rule.stats.modified++;
          break;
        }
        case 'continue':
        default:
          await passThrough();
          break;
      }
    } catch {
      await passThrough();
    }
  };
}
