/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Schema-less protobuf wire-format decoder.
 *
 * Extracted from `src/tools/protobuf.ts` so both the `decode_protobuf` tool and
 * the network `decode_response` tool share one implementation instead of
 * duplicating the wire parser.
 */

// Wire types
export const WIRE_VARINT = 0;
export const WIRE_64BIT = 1;
export const WIRE_LENGTH_DELIMITED = 2;
export const WIRE_32BIT = 5;

const wireTypeNames: Record<number, string> = {
  [WIRE_VARINT]: 'varint',
  [WIRE_64BIT]: '64-bit',
  [WIRE_LENGTH_DELIMITED]: 'length-delimited',
  [WIRE_32BIT]: '32-bit',
};

export interface DecodedField {
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

export function decodeProtobufFields(
  buf: Uint8Array,
  maxDepth = 3,
): DecodedField[] {
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
          field.value =
            Number(value) <= Number.MAX_SAFE_INTEGER
              ? Number(value)
              : value.toString();
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
          field.value =
            Number(asInt64) <= Number.MAX_SAFE_INTEGER &&
            Number(asInt64) >= Number.MIN_SAFE_INTEGER
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
          } catch {
            /* not valid UTF-8 */
          }

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
            } catch {
              /* not a valid sub-message */
            }
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

export function formatFields(fields: DecodedField[], indent = 0): string {
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

/** Render the "Field Summary" block (field numbers, wire types, repetition). */
export function summarizeFields(fields: DecodedField[]): string {
  const lines: string[] = [];
  const fieldMap = new Map<number, {count: number; types: Set<string>}>();
  for (const f of fields) {
    const existing = fieldMap.get(f.fieldNumber) || {
      count: 0,
      types: new Set<string>(),
    };
    existing.count++;
    existing.types.add(f.wireTypeName);
    fieldMap.set(f.fieldNumber, existing);
  }
  for (const [num, info] of fieldMap) {
    lines.push(
      `- Field ${num}: ${[...info.types].join('/')}${
        info.count > 1 ? ` (repeated, ${info.count}x)` : ''
      }`,
    );
  }
  return lines.join('\n');
}

/** Parse a hex/base64 string (auto-detected when format omitted) into bytes. */
export function parseProtobufInput(
  data: string,
  format: 'hex' | 'base64' | 'auto' = 'auto',
): Uint8Array {
  const fmt =
    format === 'auto'
      ? /^[0-9a-fA-F\s]+$/.test(data.replace(/\s/g, ''))
        ? 'hex'
        : 'base64'
      : format;
  if (fmt === 'hex') {
    const hex = data.replace(/\s/g, '');
    const matched = hex.match(/.{1,2}/g);
    if (!matched) {
      return new Uint8Array(0);
    }
    return new Uint8Array(matched.map(b => parseInt(b, 16)));
  }
  return Uint8Array.from(Buffer.from(data, 'base64'));
}

/**
 * Split a gRPC-web / gRPC-Connect body into length-prefixed frames. Each frame
 * is `[1-byte flags][4-byte big-endian length][payload]`. A frame whose top
 * flag bit (`0x80`) is set is a trailer frame carrying ASCII `key: value`
 * metadata rather than a protobuf message.
 */
export interface GrpcFrame {
  trailer: boolean;
  flags: number;
  payload: Uint8Array;
}

export function parseGrpcWebFrames(buf: Uint8Array): GrpcFrame[] {
  const frames: GrpcFrame[] = [];
  let offset = 0;
  while (offset + 5 <= buf.length) {
    const flags = buf[offset];
    const view = new DataView(buf.buffer, buf.byteOffset + offset + 1, 4);
    const len = view.getUint32(0, false);
    const start = offset + 5;
    if (start + len > buf.length) {
      break;
    }
    frames.push({
      trailer: (flags & 0x80) !== 0,
      flags,
      payload: buf.slice(start, start + len),
    });
    offset = start + len;
  }
  return frames;
}
