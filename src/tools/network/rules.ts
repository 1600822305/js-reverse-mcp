/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {NetworkRule, RuleStage} from '../../network/types.js';
import {zod} from '../../third_party/index.js';
import type {Protocol} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

// Monotonic counter so auto-generated ids never collide, even within the same
// millisecond (Date.now() alone is not unique under rapid/scripted calls).
let ruleCounter = 0;

export const addNetworkRule = defineTool({
  name: 'add_network_rule',
  description:
    'Adds a network interception rule (replaces the old intercept_requests). ' +
    'Rules are evaluated by a single shared Fetch handler, so multiple rules ' +
    'coexist without clobbering each other. Supports both the Request and ' +
    'Response stages, so you can inspect/rewrite real response bodies — not ' +
    'just mock or modify outgoing requests.',
  annotations: {
    title: 'Add Network Rule',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    urlPattern: zod
      .string()
      .describe(
        'URL matcher. Glob with * by default; substring match when no * is present; JS regex when isRegex=true.',
      ),
    isRegex: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Treat urlPattern as a JavaScript regular expression.'),
    action: zod
      .enum(['continue', 'modifyRequest', 'modifyResponse', 'mock', 'block'])
      .describe(
        'continue (just observe), modifyRequest, modifyResponse, mock (fulfill without hitting server), block.',
      ),
    stage: zod
      .enum(['Request', 'Response'])
      .optional()
      .describe(
        'Interception stage. Defaults to Response for modifyResponse, otherwise Request.',
      ),
    methods: zod
      .array(zod.string())
      .optional()
      .describe('HTTP methods to match (e.g. ["GET","POST"]). Empty = any.'),
    resourceTypes: zod
      .array(zod.string())
      .optional()
      .describe(
        'CDP resource types to match (e.g. ["XHR","Fetch"]). Empty = any.',
      ),
    requestHeaderContains: zod
      .record(zod.string())
      .optional()
      .describe(
        'Extra match: each named request header must contain the substring ' +
          '(case-insensitive), e.g. {"authorization":"Bearer"}.',
      ),
    requestBodyContains: zod
      .string()
      .optional()
      .describe(
        'Extra match: the request body must contain this substring ' +
          '(case-insensitive).',
      ),
    responseHeaderContains: zod
      .record(zod.string())
      .optional()
      .describe(
        'Extra match: each named response header must contain the substring ' +
          '(Response stage only).',
      ),
    setUrl: zod
      .string()
      .optional()
      .describe('Redirect the request to this URL (modifyRequest).'),
    setMethod: zod
      .string()
      .optional()
      .describe('Override the HTTP method (modifyRequest).'),
    setHeaders: zod
      .record(zod.string())
      .optional()
      .describe('Headers to add/override (modifyRequest/modifyResponse).'),
    removeHeaders: zod
      .array(zod.string())
      .optional()
      .describe('Header names to remove (modifyRequest/modifyResponse).'),
    setRequestBody: zod
      .string()
      .optional()
      .describe('Replacement request body (modifyRequest).'),
    responseStatus: zod
      .number()
      .int()
      .optional()
      .describe('Response status code (mock/modifyResponse).'),
    responseHeaders: zod
      .record(zod.string())
      .optional()
      .describe('Response headers (mock/modifyResponse).'),
    responseBody: zod
      .string()
      .optional()
      .describe(
        'Response body as UTF-8 text (mock, or modifyResponse to fully replace the body).',
      ),
    responseBodyBase64: zod
      .string()
      .optional()
      .describe(
        'Response body as base64 (mock/modifyResponse). Use for binary payloads ' +
          '(images, protobuf, fonts). Takes precedence over responseBody.',
      ),
    responseBodyFile: zod
      .string()
      .optional()
      .describe(
        'Path to a local file whose bytes become the response body ' +
          '(mock/modifyResponse). Read as binary; takes precedence over ' +
          'responseBody and responseBodyBase64.',
      ),
    delayMs: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe(
        'Delay before fulfilling, in milliseconds (mock/modifyResponse).',
      ),
    failReason: zod
      .string()
      .optional()
      .describe(
        'CDP error reason for block action (default BlockedByClient), e.g. AccessDenied, ConnectionRefused, TimedOut.',
      ),
    ruleId: zod
      .string()
      .optional()
      .describe('Custom rule id. Auto-generated when omitted.'),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    const manager = context.networkManager;
    if (!manager.isBound()) {
      response.appendResponseLine(
        'Network manager is not bound. Please select a page first.',
      );
      return;
    }

    const stage: RuleStage =
      params.stage ??
      (params.action === 'modifyResponse' ? 'Response' : 'Request');
    const id = params.ruleId || `rule_${Date.now()}_${++ruleCounter}`;

    // Resolve the response body: a file (read as binary) beats an explicit
    // base64 string, which beats the UTF-8 text body.
    let responseBodyBase64 = params.responseBodyBase64;
    if (params.responseBodyFile) {
      try {
        const bytes = await context.loadFile(params.responseBodyFile);
        responseBodyBase64 = Buffer.from(bytes).toString('base64');
      } catch (err) {
        response.appendResponseLine(
          `Could not read responseBodyFile "${params.responseBodyFile}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return;
      }
    }

    const rule: NetworkRule = {
      id,
      urlPattern: params.urlPattern,
      isRegex: params.isRegex ?? false,
      methods: params.methods?.map(m => m.toUpperCase()),
      resourceTypes: params.resourceTypes,
      requestHeaderContains: params.requestHeaderContains,
      requestBodyContains: params.requestBodyContains,
      responseHeaderContains: params.responseHeaderContains,
      stage,
      action: params.action,
      setUrl: params.setUrl,
      setMethod: params.setMethod,
      setHeaders: params.setHeaders,
      removeHeaders: params.removeHeaders,
      setRequestBody: params.setRequestBody,
      responseStatus: params.responseStatus,
      responseHeaders: params.responseHeaders,
      responseBody: params.responseBody,
      responseBodyBase64,
      delayMs: params.delayMs,
      failReason: params.failReason as Protocol.Network.ErrorReason | undefined,
      stats: {matched: 0, modified: 0, blocked: 0, mocked: 0},
    };

    try {
      await manager.intercept.addRule(rule);
      response.appendResponseLine(`Network rule added: ${id}`);
      response.appendResponseLine(`- Pattern: ${rule.urlPattern}`);
      response.appendResponseLine(`- Action: ${rule.action} (stage: ${stage})`);
      if (rule.action === 'continue') {
        response.appendResponseLine(
          'Note: "continue" is observe-only and does not pause requests; ' +
            'use search_network to inspect captured traffic.',
        );
      }
      response.appendResponseLine(
        `Use list_network_rules to view stats, remove_network_rule("${id}") to remove.`,
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

export const listNetworkRules = defineTool({
  name: 'list_network_rules',
  description: 'Lists active network interception rules and their hit stats.',
  annotations: {
    title: 'List Network Rules',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const rules = context.networkManager.intercept.listRules();
    if (rules.length === 0) {
      response.appendResponseLine(
        'No active network rules. Use add_network_rule to add one.',
      );
      return;
    }
    response.appendResponseLine(`Active network rules (${rules.length}):`);
    for (const rule of rules) {
      response.appendResponseLine('');
      response.appendResponseLine(`- ${rule.id}`);
      response.appendResponseLine(
        `  Pattern: ${rule.urlPattern}${rule.isRegex ? ' (regex)' : ''}`,
      );
      response.appendResponseLine(
        `  Action: ${rule.action}, Stage: ${rule.stage}`,
      );
      response.appendResponseLine(
        `  Stats: ${rule.stats.matched} matched, ${rule.stats.modified} modified, ${rule.stats.blocked} blocked, ${rule.stats.mocked} mocked`,
      );
    }
  },
});

export const removeNetworkRule = defineTool({
  name: 'remove_network_rule',
  description:
    'Removes a network interception rule by id. Fetch interception is ' +
    'disabled automatically once the last rule is removed.',
  annotations: {
    title: 'Remove Network Rule',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ruleId: zod
      .string()
      .optional()
      .describe('Rule id to remove. Omit with all=true to remove every rule.'),
    all: zod.boolean().optional().default(false).describe('Remove all rules.'),
  },
  handler: async (request, response, context) => {
    const {ruleId, all} = request.params;
    const registry = context.networkManager.intercept;

    if (all) {
      const ids = registry.listRules().map(r => r.id);
      for (const id of ids) {
        await registry.removeRule(id);
      }
      response.appendResponseLine(`Removed ${ids.length} rule(s).`);
      return;
    }

    if (!ruleId) {
      response.appendResponseLine('Provide ruleId, or set all=true.');
      return;
    }

    const removed = await registry.removeRule(ruleId);
    response.appendResponseLine(
      removed ? `Removed rule: ${ruleId}` : `Rule not found: ${ruleId}`,
    );
  },
});
