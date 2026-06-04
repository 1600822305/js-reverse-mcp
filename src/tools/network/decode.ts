/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  decodeProtobufFields,
  formatFields,
  summarizeFields,
  parseGrpcWebFrames,
} from '../../protobuf/wire.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

/** Heuristic: does the response look like a gRPC-web / gRPC-Connect body? */
function looksLikeGrpc(mimeType: string | undefined, buf: Uint8Array): boolean {
  const mt = (mimeType ?? '').toLowerCase();
  if (mt.includes('grpc')) {
    return true;
  }
  // A single length-prefixed frame whose declared length spans exactly to the
  // end (or leaves room for a trailer frame) is a strong gRPC-web signal.
  if (buf.length >= 5) {
    const len = new DataView(buf.buffer, buf.byteOffset + 1, 4).getUint32(
      0,
      false,
    );
    if (5 + len <= buf.length) {
      return true;
    }
  }
  return false;
}

export const decodeResponse = defineTool({
  name: 'decode_response',
  description:
    'Decodes a captured response body (by numeric id from search_network) as ' +
    'schema-less protobuf or gRPC-web/gRPC-Connect. Reads the already-captured ' +
    'body from the network store (no re-fetch, so one-time/signed responses ' +
    'still decode) and, for gRPC-web, splits the length-prefixed frames and ' +
    'shows the trailer metadata.',
  annotations: {
    title: 'Decode Response',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
    skipDevToolsDetection: true,
  },
  schema: {
    requestId: zod
      .number()
      .int()
      .describe('Numeric request id from search_network.'),
    as: zod
      .enum(['auto', 'protobuf', 'grpc-web'])
      .optional()
      .default('auto')
      .describe(
        'How to interpret the body. auto detects gRPC-web framing from the ' +
          'content-type/frame header, otherwise decodes as raw protobuf.',
      ),
    maxDepth: zod
      .number()
      .int()
      .optional()
      .default(3)
      .describe('Maximum depth for nested message decoding (default 3).'),
  },
  handler: async (request, response, context) => {
    const params = request.params;
    const store = context.networkManager.store;
    const record = store.getById(params.requestId);
    if (!record) {
      response.appendResponseLine(
        `No captured request with id ${params.requestId}. Use search_network first.`,
      );
      return;
    }

    const body = await store.getResponseBody(params.requestId);
    if (!body) {
      response.appendResponseLine(
        'No response body available for this request (not finished, or body evicted).',
      );
      return;
    }

    // CDP returns text bodies verbatim and binary bodies base64-encoded. A
    // protobuf payload is binary, so decode base64; if a server mislabels it as
    // text, fall back to latin1 to preserve the raw bytes.
    const buf = body.base64
      ? new Uint8Array(Buffer.from(body.body, 'base64'))
      : new Uint8Array(Buffer.from(body.body, 'binary'));

    response.appendResponseLine(
      `## decode_response #${record.id} ${record.url}`,
    );
    response.appendResponseLine(
      `Content-Type: ${record.mimeType ?? '-'} | ${buf.length} bytes`,
    );
    response.appendResponseLine('');

    const useGrpc =
      params.as === 'grpc-web' ||
      (params.as === 'auto' && looksLikeGrpc(record.mimeType, buf));

    const decodeMessage = (bytes: Uint8Array, label: string): void => {
      const fields = decodeProtobufFields(bytes, params.maxDepth);
      if (fields.length === 0) {
        response.appendResponseLine(`${label}: no valid protobuf fields.`);
        return;
      }
      response.appendResponseLine(`${label}: ${fields.length} field(s)`);
      response.appendResponseLine('```');
      response.appendResponseLine(formatFields(fields));
      response.appendResponseLine('```');
      response.appendResponseLine(summarizeFields(fields));
      response.appendResponseLine('');
    };

    if (useGrpc) {
      const frames = parseGrpcWebFrames(buf);
      if (frames.length === 0) {
        response.appendResponseLine(
          'Could not parse any gRPC-web frames; falling back to raw protobuf.',
        );
        decodeMessage(buf, 'message');
        return;
      }
      let msgIndex = 0;
      for (const frame of frames) {
        if (frame.trailer) {
          response.appendResponseLine(
            `### Trailer (flags 0x${frame.flags.toString(16)})`,
          );
          response.appendResponseLine('```');
          response.appendResponseLine(
            Buffer.from(frame.payload).toString('utf8').trimEnd(),
          );
          response.appendResponseLine('```');
          response.appendResponseLine('');
        } else {
          decodeMessage(frame.payload, `### Message ${++msgIndex}`);
        }
      }
      return;
    }

    decodeMessage(buf, '### Message');
  },
});
