/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Protobuf Tools
 *
 * Provides tools for:
 * - Decoding raw protobuf binary data (without .proto schema)
 * - Encoding protobuf from JSON using schema-less wire format
 * - Analyzing protobuf structure from binary data
 * - Making gRPC-Connect requests with protobuf encoding
 */

import {
  decodeProtobufFields,
  formatFields,
  summarizeFields,
  WIRE_VARINT,
  WIRE_64BIT,
  WIRE_LENGTH_DELIMITED,
  WIRE_32BIT,
} from '../protobuf/wire.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ==================== Protobuf Decode Tool ====================

export const decodeProtobuf = defineTool({
  name: 'decode_protobuf',
  description:
    'Decode protobuf binary without a .proto schema. Provide inline data (hex/base64) OR a url to fetch and decode (e.g. gRPC-Connect responses). Analyzes wire format to extract field numbers, types, and values, including nested messages.',
  annotations: {
    title: 'Decode Protobuf',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    data: zod
      .string()
      .optional()
      .describe(
        'Protobuf data as hex string (e.g. "0a0548656c6c6f") or base64 string. Provide either data or url.',
      ),
    url: zod
      .string()
      .optional()
      .describe(
        'URL to fetch and decode the response as protobuf (gRPC-Connect/application/proto). Provide either data or url.',
      ),
    format: zod
      .enum(['hex', 'base64', 'auto'])
      .optional()
      .default('auto')
      .describe('Input format for data (default: auto-detect).'),
    maxDepth: zod
      .number()
      .int()
      .optional()
      .default(3)
      .describe('Maximum depth for nested message decoding (default: 3).'),
    method: zod
      .enum(['GET', 'POST'])
      .optional()
      .default('POST')
      .describe('HTTP method when fetching url (default: POST).'),
    headers: zod
      .record(zod.string())
      .optional()
      .describe('Custom headers when fetching url.'),
    body: zod
      .string()
      .optional()
      .describe(
        'Request body when fetching url (hex-encoded protobuf or JSON).',
      ),
    bodyFormat: zod
      .enum(['hex', 'json', 'raw'])
      .optional()
      .default('json')
      .describe('Format of the request body when fetching url.'),
    skipBytes: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe(
        'Number of bytes to skip at the start of the fetched response (e.g. 5 for gRPC-Connect frame header).',
      ),
  },
  handler: async (request, response, context) => {
    const {format, maxDepth, method, headers, body, bodyFormat, skipBytes} =
      request.params;
    let {data} = request.params;
    const {url} = request.params;
    let bytes: Uint8Array;

    if (!data && !url) {
      response.appendResponseLine('Error: provide either `data` or `url`.');
      return;
    }
    if (data && url) {
      response.appendResponseLine(
        'Error: provide only one of `data` or `url`, not both.',
      );
      return;
    }

    if (url) {
      const page = context.getSelectedPage();
      const fetched = await page.evaluate(
        async (params: {
          url: string;
          method: string;
          headers?: Record<string, string>;
          body?: string;
          bodyFormat: string;
          skipBytes: number;
        }) => {
          try {
            const fetchHeaders: Record<string, string> = params.headers || {};

            let fetchBody: BodyInit | undefined;
            if (params.body) {
              if (params.bodyFormat === 'hex') {
                const hex = params.body.replace(/\s/g, '');
                const b = new Uint8Array(
                  hex.match(/.{1,2}/g)!.map(x => parseInt(x, 16)),
                );
                fetchBody = b;
                if (!fetchHeaders['content-type']) {
                  fetchHeaders['content-type'] = 'application/proto';
                }
              } else if (params.bodyFormat === 'json') {
                fetchBody = params.body;
                if (!fetchHeaders['content-type']) {
                  fetchHeaders['content-type'] = 'application/json';
                }
              } else {
                fetchBody = params.body;
              }
            }

            const resp = await fetch(params.url, {
              method: params.method,
              headers: fetchHeaders,
              body: fetchBody,
            });

            const buf = await resp.arrayBuffer();
            const all = new Uint8Array(buf);
            const sliced =
              params.skipBytes > 0 ? all.slice(params.skipBytes) : all;
            const hex = Array.from(sliced)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');

            return JSON.stringify({
              status: resp.status,
              contentType: resp.headers.get('content-type'),
              totalBytes: all.length,
              dataBytes: sliced.length,
              hex,
            });
          } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            return JSON.stringify({error: error.message});
          }
        },
        {
          url,
          method: method || 'POST',
          headers,
          body,
          bodyFormat: bodyFormat || 'json',
          skipBytes: skipBytes || 0,
        },
      );

      const parsed = JSON.parse(fetched as string);
      if (parsed.error) {
        response.appendResponseLine(`❌ Request failed: ${parsed.error}`);
        return;
      }

      response.appendResponseLine('## Network Protobuf Response\n');
      response.appendResponseLine(`Status: ${parsed.status}`);
      response.appendResponseLine(`Content-Type: ${parsed.contentType}`);
      response.appendResponseLine(
        `Total bytes: ${parsed.totalBytes}, Data bytes: ${parsed.dataBytes}`,
      );
      response.appendResponseLine('');

      // Continue through the shared decode path using the fetched hex.
      data = parsed.hex as string;
    }

    if (data === undefined) {
      response.appendResponseLine('Error: no protobuf data to decode.');
      return;
    }

    try {
      const fmt =
        format === 'auto'
          ? /^[0-9a-fA-F\s]+$/.test(data.replace(/\s/g, ''))
            ? 'hex'
            : 'base64'
          : format;

      if (fmt === 'hex') {
        const hex = data.replace(/\s/g, '');
        bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
      } else {
        bytes = Uint8Array.from(Buffer.from(data, 'base64'));
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      response.appendResponseLine(`Error parsing input: ${error.message}`);
      return;
    }

    response.appendResponseLine(`## Protobuf Decode (${bytes.length} bytes)\n`);

    try {
      const fields = decodeProtobufFields(bytes, maxDepth || 3);

      if (fields.length === 0) {
        response.appendResponseLine('No valid protobuf fields found in data.');
        return;
      }

      response.appendResponseLine(
        `Found ${fields.length} top-level field(s):\n`,
      );
      response.appendResponseLine('```');
      response.appendResponseLine(formatFields(fields));
      response.appendResponseLine('```');

      // Summary
      response.appendResponseLine('\n### Field Summary');
      response.appendResponseLine(summarizeFields(fields));
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      response.appendResponseLine(`Error decoding protobuf: ${error.message}`);
    }
  },
});

// ==================== Protobuf Encode Tool ====================

export const encodeProtobuf = defineTool({
  name: 'encode_protobuf',
  description:
    'Encode data to protobuf binary format without a .proto schema. Specify field numbers, types, and values to build a protobuf message. Returns hex and base64 encoded output.',
  annotations: {
    title: 'Encode Protobuf',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    fields: zod
      .array(
        zod.object({
          number: zod.number().int().describe('Field number (1-based).'),
          type: zod
            .enum([
              'varint',
              'string',
              'bytes',
              'int32',
              'int64',
              'float',
              'double',
              'bool',
              'message',
            ])
            .describe('Field type.'),
          value: zod
            .unknown()
            .describe(
              'Field value. For varint/int32/int64: number. For string: text. For bytes: hex string. For bool: true/false. For message: nested fields array.',
            ),
        }),
      )
      .describe('Array of fields to encode.'),
  },
  handler: async (request, response) => {
    const {fields} = request.params;
    const parts: Uint8Array[] = [];

    function encodeVarintBytes(value: bigint): Uint8Array {
      const bytes: number[] = [];
      let v = value;
      while (v > 127n) {
        bytes.push(Number(v & 0x7fn) | 0x80);
        v >>= 7n;
      }
      bytes.push(Number(v));
      return new Uint8Array(bytes);
    }

    function encodeField(
      fieldNumber: number,
      type: string,
      value: unknown,
    ): Uint8Array {
      const fieldParts: Uint8Array[] = [];

      switch (type) {
        case 'varint':
        case 'int64':
        case 'bool': {
          const tag = encodeVarintBytes(
            BigInt((fieldNumber << 3) | WIRE_VARINT),
          );
          const val =
            type === 'bool' ? (value ? 1n : 0n) : BigInt(value as number);
          fieldParts.push(tag, encodeVarintBytes(val));
          break;
        }
        case 'string': {
          const tag = encodeVarintBytes(
            BigInt((fieldNumber << 3) | WIRE_LENGTH_DELIMITED),
          );
          const encoded = new TextEncoder().encode(value as string);
          const len = encodeVarintBytes(BigInt(encoded.length));
          fieldParts.push(tag, len, encoded);
          break;
        }
        case 'bytes': {
          const tag = encodeVarintBytes(
            BigInt((fieldNumber << 3) | WIRE_LENGTH_DELIMITED),
          );
          const hex = (value as string).replace(/\s/g, '');
          const data = new Uint8Array(
            hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)),
          );
          const len = encodeVarintBytes(BigInt(data.length));
          fieldParts.push(tag, len, data);
          break;
        }
        case 'message': {
          const tag = encodeVarintBytes(
            BigInt((fieldNumber << 3) | WIRE_LENGTH_DELIMITED),
          );
          const subFields = value as Array<{
            number: number;
            type: string;
            value: unknown;
          }>;
          const subParts: Uint8Array[] = [];
          for (const sf of subFields) {
            subParts.push(encodeField(sf.number, sf.type, sf.value));
          }
          const totalLen = subParts.reduce((s, p) => s + p.length, 0);
          const combined = new Uint8Array(totalLen);
          let offset = 0;
          for (const p of subParts) {
            combined.set(p, offset);
            offset += p.length;
          }
          const len = encodeVarintBytes(BigInt(combined.length));
          fieldParts.push(tag, len, combined);
          break;
        }
        case 'int32': {
          const tag = encodeVarintBytes(
            BigInt((fieldNumber << 3) | WIRE_32BIT),
          );
          const buf = new ArrayBuffer(4);
          new DataView(buf).setInt32(0, value as number, true);
          fieldParts.push(tag, new Uint8Array(buf));
          break;
        }
        case 'float': {
          const tag = encodeVarintBytes(
            BigInt((fieldNumber << 3) | WIRE_32BIT),
          );
          const buf = new ArrayBuffer(4);
          new DataView(buf).setFloat32(0, value as number, true);
          fieldParts.push(tag, new Uint8Array(buf));
          break;
        }
        case 'double': {
          const tag = encodeVarintBytes(
            BigInt((fieldNumber << 3) | WIRE_64BIT),
          );
          const buf = new ArrayBuffer(8);
          new DataView(buf).setFloat64(0, value as number, true);
          fieldParts.push(tag, new Uint8Array(buf));
          break;
        }
      }

      const totalLen = fieldParts.reduce((s, p) => s + p.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const p of fieldParts) {
        result.set(p, offset);
        offset += p.length;
      }
      return result;
    }

    try {
      for (const field of fields) {
        parts.push(encodeField(field.number, field.type, field.value));
      }

      const totalLen = parts.reduce((s, p) => s + p.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const p of parts) {
        result.set(p, offset);
        offset += p.length;
      }

      // Output
      const hex = Array.from(result)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const base64 = Buffer.from(result).toString('base64');

      response.appendResponseLine(
        `## Protobuf Encode (${result.length} bytes)\n`,
      );
      response.appendResponseLine(`Hex: \`${hex}\``);
      response.appendResponseLine(`Base64: \`${base64}\``);
      response.appendResponseLine(`\nFields encoded: ${fields.length}`);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      response.appendResponseLine(`Error encoding protobuf: ${error.message}`);
    }
  },
});
