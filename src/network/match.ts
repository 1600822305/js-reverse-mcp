/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * URL and header matching helpers shared by the network store and the
 * interception registry.
 *
 * The previous `intercept_requests` implementation built a regex by replacing
 * every `*` with `.*` without escaping other regex metacharacters or anchoring
 * the result, leading to silent mis-matches (e.g. `.` matching any character in
 * a hostname). These helpers fix that.
 */

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/**
 * Convert a glob pattern (only `*` is special) into an anchored RegExp.
 * All other characters are treated literally.
 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(REGEX_META, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Test whether a URL matches a pattern.
 *
 * - `isRegex` true: `pattern` is treated as a JS regular expression (unanchored).
 * - pattern contains `*`: treated as an anchored glob.
 * - otherwise: treated as a case-sensitive substring ("contains") match, which
 *   is the most intuitive default for interactive use.
 */
export function matchUrl(
  url: string,
  pattern: string,
  isRegex: boolean,
): boolean {
  if (isRegex) {
    try {
      return new RegExp(pattern).test(url);
    } catch {
      return false;
    }
  }
  if (pattern.includes('*')) {
    return globToRegExp(pattern).test(url);
  }
  return url.includes(pattern);
}

/**
 * Build the `urlPattern` understood by CDP's `Fetch.enable`, which supports
 * `*` (any chars) and `?` (one char) wildcards. Substring patterns are wrapped
 * with `*` on both sides; regex patterns cannot be expressed to CDP so we fall
 * back to the broadest pattern and rely on {@link matchUrl} to filter.
 */
export function toCdpUrlPattern(pattern: string, isRegex: boolean): string {
  if (isRegex) {
    return '*';
  }
  if (pattern.includes('*')) {
    return pattern;
  }
  return `*${pattern}*`;
}

/** Normalise a CDP header array/object into a plain lowercase-insensitive map. */
export function headersToRecord(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  return headers ? {...headers} : {};
}

/** Convert a header record into the `{name, value}[]` form CDP expects. */
export function recordToHeaderEntries(
  headers: Record<string, string>,
): Array<{name: string; value: string}> {
  return Object.entries(headers).map(([name, value]) => ({
    name,
    value: String(value),
  }));
}
