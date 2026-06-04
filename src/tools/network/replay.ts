/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {runReplay, sanitizeHeaders} from '../../network/replay-exec.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const replayRequest = defineTool({
  name: 'replay_request',
  description:
    'Re-sends a captured request (by numeric id from search_network) from the ' +
    'page context using fetch(), so cookies and auth are included. Supports ' +
    'overriding the URL, method, headers and body — useful for probing how a ' +
    'signed/parameterised API responds to tampered input.',
  annotations: {
    title: 'Replay Request',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    requestId: zod
      .number()
      .int()
      .describe('Numeric request id from search_network.'),
    overrideUrl: zod.string().optional().describe('Override the request URL.'),
    overrideMethod: zod
      .string()
      .optional()
      .describe('Override the HTTP method.'),
    setHeaders: zod
      .record(zod.string())
      .optional()
      .describe('Headers to add/override on the replayed request.'),
    overrideBody: zod
      .string()
      .optional()
      .describe('Override the request body.'),
    maxResponseLength: zod
      .number()
      .int()
      .optional()
      .default(5000)
      .describe('Maximum response body characters to return (default 5000).'),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    const record = context.networkManager.store.getById(params.requestId);
    if (!record) {
      response.appendResponseLine(
        `No captured request with id ${params.requestId}.`,
      );
      return;
    }

    const url = params.overrideUrl ?? record.url;
    const method = (params.overrideMethod ?? record.method).toUpperCase();
    const headers = {
      ...sanitizeHeaders(record.requestHeaders),
      ...(params.setHeaders ?? {}),
    };
    const body =
      params.overrideBody ??
      (method === 'GET' || method === 'HEAD'
        ? undefined
        : await context.networkManager.store.getRequestBody(params.requestId));

    try {
      const page = context.getSelectedPage();
      const result = await runReplay(page, {url, method, headers, body});

      if (!result.ok) {
        response.appendResponseLine(`Replay failed: ${result.error}`);
        return;
      }
      response.appendResponseLine(`Replayed ${method} ${url}`);
      response.appendResponseLine(
        `Status: ${result.status} ${result.statusText} (${result.durationMs}ms)`,
      );
      let text = result.body;
      if (
        params.maxResponseLength > 0 &&
        text.length > params.maxResponseLength
      ) {
        text = `${text.slice(0, params.maxResponseLength)}... [truncated]`;
      }
      response.appendResponseLine('Body:');
      response.appendResponseLine(text);
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
