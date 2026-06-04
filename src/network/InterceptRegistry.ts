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
export class InterceptRegistry {
  #client: CDPSession | null = null;
  #rules = new Map<string, NetworkRule>();
  #fetchEnabled = false;

  bind(client: CDPSession): void {
    this.#client = client;
    client.on('Fetch.requestPaused', this.#onRequestPaused);
    // Re-apply existing rules onto the new session (e.g. after a page switch).
    if (this.#rules.size > 0) {
      void this.#applyPatterns();
    }
  }

  unbind(): void {
    const client = this.#client;
    if (!client) {
      return;
    }
    client.off('Fetch.requestPaused', this.#onRequestPaused);
    if (this.#fetchEnabled) {
      void client.send('Fetch.disable').catch(() => undefined);
      this.#fetchEnabled = false;
    }
    this.#client = null;
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

  async #applyPatterns(): Promise<void> {
    const client = this.#client;
    if (!client) {
      return;
    }
    if (this.#rules.size === 0) {
      if (this.#fetchEnabled) {
        await client.send('Fetch.disable').catch(() => undefined);
        this.#fetchEnabled = false;
      }
      return;
    }
    // De-duplicate (urlPattern, stage) pairs across all rules.
    const seen = new Set<string>();
    const patterns: Protocol.Fetch.RequestPattern[] = [];
    for (const rule of this.#rules.values()) {
      const urlPattern = toCdpUrlPattern(rule.urlPattern, rule.isRegex);
      const key = `${urlPattern}\u0000${rule.stage}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      patterns.push({urlPattern, requestStage: rule.stage});
    }
    await client.send('Fetch.enable', {patterns});
    this.#fetchEnabled = true;
  }

  #matchRule(
    stage: RuleStage,
    url: string,
    method: string,
    resourceType: string,
  ): NetworkRule | undefined {
    for (const rule of this.#rules.values()) {
      if (rule.stage !== stage) {
        continue;
      }
      if (!matchUrl(url, rule.urlPattern, rule.isRegex)) {
        continue;
      }
      if (
        rule.methods &&
        rule.methods.length > 0 &&
        !rule.methods.includes(method.toUpperCase())
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
      return rule;
    }
    return undefined;
  }

  #onRequestPaused = async (
    event: Protocol.Fetch.RequestPausedEvent,
  ): Promise<void> => {
    const client = this.#client;
    if (!client) {
      return;
    }
    const {requestId, request, resourceType} = event;
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

    const rule = this.#matchRule(
      stage,
      request.url,
      request.method,
      resourceType,
    );
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
            body: Buffer.from(rule.responseBody ?? '').toString('base64'),
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
          let body = rule.responseBody;
          if (body === undefined) {
            try {
              const current = await client.send('Fetch.getResponseBody', {
                requestId,
              });
              body = current.base64Encoded
                ? Buffer.from(current.body, 'base64').toString('utf8')
                : current.body;
            } catch {
              body = '';
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
            body: Buffer.from(body).toString('base64'),
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
