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

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ==================== Protobuf Wire Format Helpers ====================

// Wire types
const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_32BIT = 5;

const wireTypeNames: Record<number, string> = {
  [WIRE_VARINT]: 'varint',
  [WIRE_64BIT]: '64-bit',
  [WIRE_LENGTH_DELIMITED]: 'length-delimited',
  [WIRE_32BIT]: '32-bit',
};

interface DecodedField {
  fieldNumber: number;
  wireType: number;
  wireTypeName: string;
  value: unknown;
  rawBytes?: string;
  // For length-delimited fields, attempt sub-decode
  possibleString?: string;
  possibleSubMessage?: DecodedField[];
}

function decodeVarint(buf: Uint8Array, offset: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos];
    result |= BigInt(byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 63n) throw new Error('Varint too long');
  }
  return [result, pos];
}

function decodeZigZag(n: bigint): bigint {
  return (n >> 1n) ^ -(n & 1n);
}

function decodeProtobufFields(buf: Uint8Array, maxDepth = 3): DecodedField[] {
  const fields: DecodedField[] = [];
  let offset = 0;

  while (offset < buf.length) {
    try {
      const [tag, newOffset] = decodeVarint(buf, offset);
      const fieldNumber = Number(tag >> 3n);
      const wireType = Number(tag & 7n);

      if (fieldNumber === 0 || fieldNumber > 536870911) break; // Invalid field number

      offset = newOffset;

      const field: DecodedField = {
        fieldNumber,
        wireType,
        wireTypeName: wireTypeNames[wireType] || `unknown(${wireType})`,
        value: null,
      };

      switch (wireType) {
        case WIRE_VARINT: {
          const [value, nextOffset] = decodeVarint(buf, offset);
          field.value = Number(value) <= Number.MAX_SAFE_INTEGER ? Number(value) : value.toString();
          // Also show signed interpretation
          const signed = decodeZigZag(value);
          if (signed !== value && signed !== 0n) {
            field.rawBytes = `unsigned=${value}, signed(zigzag)=${signed}`;
          }
          offset = nextOffset;
          break;
        }
        case WIRE_64BIT: {
          if (offset + 8 > buf.length) throw new Error('Buffer overflow');
          const bytes = buf.slice(offset, offset + 8);
          const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
          const asDouble = view.getFloat64(0, true);
          const asInt64 = view.getBigInt64(0, true);
          field.value = Number(asInt64) <= Number.MAX_SAFE_INTEGER && Number(asInt64) >= Number.MIN_SAFE_INTEGER
            ? Number(asInt64)
            : asInt64.toString();
          field.rawBytes = `int64=${asInt64}, double=${asDouble}`;
          offset += 8;
          break;
        }
        case WIRE_LENGTH_DELIMITED: {
          const [length, dataOffset] = decodeVarint(buf, offset);
          const len = Number(length);
          if (dataOffset + len > buf.length) throw new Error('Buffer overflow');
          const data = buf.slice(dataOffset, dataOffset + len);

          // Try to decode as UTF-8 string
          try {
            const str = new TextDecoder('utf-8', {fatal: true}).decode(data);
            // Check if it looks like a valid string (printable chars)
            const isPrintable = /^[\x20-\x7E\u0080-\uFFFF\n\r\t]*$/.test(str);
            if (isPrintable && str.length > 0) {
              field.possibleString = str;
              field.value = str;
            }
          } catch { /* not valid UTF-8 */ }

          // Try to decode as sub-message
          if (maxDepth > 0 && data.length > 0) {
            try {
              const subFields = decodeProtobufFields(data, maxDepth - 1);
              if (subFields.length > 0) {
                field.possibleSubMessage = subFields;
                if (!field.value) {
                  field.value = `{sub-message with ${subFields.length} fields}`;
                }
              }
            } catch { /* not a valid sub-message */ }
          }

          if (!field.value) {
            // Show as hex
            field.value = `[${len} bytes]`;
            field.rawBytes = Array.from(data.slice(0, 50))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' ');
          }

          offset = dataOffset + len;
          break;
        }
        case WIRE_32BIT: {
          if (offset + 4 > buf.length) throw new Error('Buffer overflow');
          const bytes = buf.slice(offset, offset + 4);
          const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
          const asFloat = view.getFloat32(0, true);
          const asInt32 = view.getInt32(0, true);
          field.value = asInt32;
          field.rawBytes = `int32=${asInt32}, float=${asFloat}`;
          offset += 4;
          break;
        }
        default:
          throw new Error(`Unknown wire type: ${wireType}`);
      }

      fields.push(field);
    } catch {
      break;
    }
  }

  return fields;
}

function formatFields(fields: DecodedField[], indent = 0): string {
  const lines: string[] = [];
  const pad = '  '.repeat(indent);

  for (const field of fields) {
    let line = `${pad}field ${field.fieldNumber} (${field.wireTypeName}): ${
      typeof field.value === 'string' && field.value.length > 100
        ? field.value.substring(0, 100) + '...'
        : field.value
    }`;

    if (field.rawBytes) {
      line += `  [${field.rawBytes}]`;
    }

    lines.push(line);

    // Show sub-message fields
    if (field.possibleSubMessage && indent < 4) {
      lines.push(`${pad}  └─ Sub-message:`);
      lines.push(formatFields(field.possibleSubMessage, indent + 2));
    }
  }

  return lines.join('\n');
}

// ==================== Protobuf Decode Tool ====================

export const decodeProtobuf = defineTool({
  name: 'decode_protobuf',
  description:
    'Decode raw protobuf binary data without a .proto schema. Analyzes wire format to extract field numbers, types, and values. Supports nested messages, strings, integers, and floating point. Input can be hex string or base64.',
  annotations: {
    title: 'Decode Protobuf',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    data: zod
      .string()
      .describe(
        'Protobuf data as hex string (e.g. "0a0548656c6c6f") or base64 string.',
      ),
    format: zod
      .enum(['hex', 'base64', 'auto'])
      .optional()
      .default('auto')
      .describe('Input format (default: auto-detect).'),
    maxDepth: zod
      .number()
      .int()
      .optional()
      .default(3)
      .describe('Maximum depth for nested message decoding (default: 3).'),
  },
  handler: async (request, response) => {
    const {data, format, maxDepth} = request.params;
    let bytes: Uint8Array;

    try {
      const fmt = format === 'auto'
        ? (/^[0-9a-fA-F\s]+$/.test(data.replace(/\s/g, '')) ? 'hex' : 'base64')
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

      response.appendResponseLine(`Found ${fields.length} top-level field(s):\n`);
      response.appendResponseLine('```');
      response.appendResponseLine(formatFields(fields));
      response.appendResponseLine('```');

      // Summary
      response.appendResponseLine('\n### Field Summary');
      const fieldMap = new Map<number, {count: number; types: Set<string>}>();
      for (const f of fields) {
        const existing = fieldMap.get(f.fieldNumber) || {count: 0, types: new Set<string>()};
        existing.count++;
        existing.types.add(f.wireTypeName);
        fieldMap.set(f.fieldNumber, existing);
      }
      for (const [num, info] of fieldMap) {
        response.appendResponseLine(
          `- Field ${num}: ${[...info.types].join('/')}${info.count > 1 ? ` (repeated, ${info.count}x)` : ''}`,
        );
      }
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
            .enum(['varint', 'string', 'bytes', 'int32', 'int64', 'float', 'double', 'bool', 'message'])
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

    function encodeField(fieldNumber: number, type: string, value: unknown): Uint8Array {
      const fieldParts: Uint8Array[] = [];

      switch (type) {
        case 'varint':
        case 'int64':
        case 'bool': {
          const tag = encodeVarintBytes(BigInt(fieldNumber << 3 | WIRE_VARINT));
          const val = type === 'bool' ? (value ? 1n : 0n) : BigInt(value as number);
          fieldParts.push(tag, encodeVarintBytes(val));
          break;
        }
        case 'string': {
          const tag = encodeVarintBytes(BigInt(fieldNumber << 3 | WIRE_LENGTH_DELIMITED));
          const encoded = new TextEncoder().encode(value as string);
          const len = encodeVarintBytes(BigInt(encoded.length));
          fieldParts.push(tag, len, encoded);
          break;
        }
        case 'bytes': {
          const tag = encodeVarintBytes(BigInt(fieldNumber << 3 | WIRE_LENGTH_DELIMITED));
          const hex = (value as string).replace(/\s/g, '');
          const data = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
          const len = encodeVarintBytes(BigInt(data.length));
          fieldParts.push(tag, len, data);
          break;
        }
        case 'message': {
          const tag = encodeVarintBytes(BigInt(fieldNumber << 3 | WIRE_LENGTH_DELIMITED));
          const subFields = value as Array<{number: number; type: string; value: unknown}>;
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
          const tag = encodeVarintBytes(BigInt(fieldNumber << 3 | WIRE_32BIT));
          const buf = new ArrayBuffer(4);
          new DataView(buf).setInt32(0, value as number, true);
          fieldParts.push(tag, new Uint8Array(buf));
          break;
        }
        case 'float': {
          const tag = encodeVarintBytes(BigInt(fieldNumber << 3 | WIRE_32BIT));
          const buf = new ArrayBuffer(4);
          new DataView(buf).setFloat32(0, value as number, true);
          fieldParts.push(tag, new Uint8Array(buf));
          break;
        }
        case 'double': {
          const tag = encodeVarintBytes(BigInt(fieldNumber << 3 | WIRE_64BIT));
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

      response.appendResponseLine(`## Protobuf Encode (${result.length} bytes)\n`);
      response.appendResponseLine(`Hex: \`${hex}\``);
      response.appendResponseLine(`Base64: \`${base64}\``);
      response.appendResponseLine(`\nFields encoded: ${fields.length}`);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      response.appendResponseLine(`Error encoding protobuf: ${error.message}`);
    }
  },
});

// ==================== Decode Network Response Protobuf ====================

export const decodeNetworkProtobuf = defineTool({
  name: 'decode_network_protobuf',
  description:
    'Fetch a URL and decode the response as protobuf binary. Useful for inspecting gRPC-Connect API responses that use application/proto or application/connect+proto content type.',
  annotations: {
    title: 'Decode Network Protobuf',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    url: zod.string().describe('URL to fetch.'),
    method: zod
      .enum(['GET', 'POST'])
      .optional()
      .default('POST')
      .describe('HTTP method (default: POST).'),
    headers: zod
      .record(zod.string())
      .optional()
      .describe('Custom headers.'),
    body: zod
      .string()
      .optional()
      .describe('Request body (hex-encoded protobuf or JSON string).'),
    bodyFormat: zod
      .enum(['hex', 'json', 'raw'])
      .optional()
      .default('json')
      .describe('Format of the request body.'),
    skipBytes: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe('Number of bytes to skip at the start of response (e.g. 5 for gRPC-Connect frame header).'),
    maxDepth: zod
      .number()
      .int()
      .optional()
      .default(3)
      .describe('Maximum depth for nested message decoding (default: 3).'),
  },
  handler: async (request, response, context) => {
    const {url, method, headers, body, bodyFormat, skipBytes, maxDepth} = request.params;
    const page = context.getSelectedPage();

    const result = await page.evaluate(
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
              const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
              fetchBody = bytes;
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
          const bytes = new Uint8Array(buf);

          // Skip frame header if needed
          const data = params.skipBytes > 0
            ? bytes.slice(params.skipBytes)
            : bytes;

          // Return as hex for decoding on server side
          const hex = Array.from(data)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

          return JSON.stringify({
            status: resp.status,
            contentType: resp.headers.get('content-type'),
            totalBytes: bytes.length,
            dataBytes: data.length,
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

    const parsed = JSON.parse(result as string);

    if (parsed.error) {
      response.appendResponseLine(`❌ Request failed: ${parsed.error}`);
      return;
    }

    response.appendResponseLine(`## Network Protobuf Response\n`);
    response.appendResponseLine(`Status: ${parsed.status}`);
    response.appendResponseLine(`Content-Type: ${parsed.contentType}`);
    response.appendResponseLine(`Total bytes: ${parsed.totalBytes}, Data bytes: ${parsed.dataBytes}`);
    response.appendResponseLine('');

    // Decode the protobuf
    try {
      const hex = parsed.hex as string;
      const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
      const fields = decodeProtobufFields(bytes, maxDepth || 3);

      if (fields.length === 0) {
        response.appendResponseLine('No valid protobuf fields found.');
        response.appendResponseLine(`Raw hex: ${hex.substring(0, 200)}...`);
        return;
      }

      response.appendResponseLine(`Decoded ${fields.length} top-level field(s):\n`);
      response.appendResponseLine('```');
      response.appendResponseLine(formatFields(fields));
      response.appendResponseLine('```');
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      response.appendResponseLine(`Error decoding response: ${error.message}`);
      response.appendResponseLine(`Raw hex: ${parsed.hex.substring(0, 200)}...`);
    }
  },
});
