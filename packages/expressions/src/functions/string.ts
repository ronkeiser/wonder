/**
 * String functions for expressions
 *
 * All functions are pure and return new strings (never mutate input).
 */

/**
 * Convert string to uppercase
 * @throws If argument is not a string
 */
export function upper(str: unknown): string {
  if (typeof str !== 'string') {
    throw new TypeError('upper() requires a string');
  }
  return str.toUpperCase();
}

/**
 * Convert string to lowercase
 * @throws If argument is not a string
 */
export function lower(str: unknown): string {
  if (typeof str !== 'string') {
    throw new TypeError('lower() requires a string');
  }
  return str.toLowerCase();
}

/**
 * Trim whitespace from both ends of string
 * @throws If argument is not a string
 */
export function trim(str: unknown): string {
  if (typeof str !== 'string') {
    throw new TypeError('trim() requires a string');
  }
  return str.trim();
}

/**
 * Split string by delimiter into array
 * @throws If first argument is not a string
 * @throws If second argument is not a string
 */
export function split(str: unknown, delimiter: unknown): string[] {
  if (typeof str !== 'string') {
    throw new TypeError('split() requires a string as first argument');
  }
  if (typeof delimiter !== 'string') {
    throw new TypeError('split() requires a string delimiter as second argument');
  }
  return str.split(delimiter);
}

/**
 * Join array elements with delimiter
 * @throws If first argument is not an array
 * @throws If second argument is not a string
 */
export function join(arr: unknown, delimiter: unknown): string {
  if (!Array.isArray(arr)) {
    throw new TypeError('join() requires an array as first argument');
  }
  if (typeof delimiter !== 'string') {
    throw new TypeError('join() requires a string delimiter as second argument');
  }
  return arr.map((item) => String(item)).join(delimiter);
}

/**
 * Check if string starts with prefix
 * @throws If first argument is not a string
 * @throws If second argument is not a string
 */
export function startsWith(str: unknown, prefix: unknown): boolean {
  if (typeof str !== 'string') {
    throw new TypeError('startsWith() requires a string as first argument');
  }
  if (typeof prefix !== 'string') {
    throw new TypeError('startsWith() requires a string prefix as second argument');
  }
  return str.startsWith(prefix);
}

/**
 * Check if string ends with suffix
 * @throws If first argument is not a string
 * @throws If second argument is not a string
 */
export function endsWith(str: unknown, suffix: unknown): boolean {
  if (typeof str !== 'string') {
    throw new TypeError('endsWith() requires a string as first argument');
  }
  if (typeof suffix !== 'string') {
    throw new TypeError('endsWith() requires a string suffix as second argument');
  }
  return str.endsWith(suffix);
}

/**
 * Replace first occurrence of search string with replacement
 * @throws If any argument is not a string
 */
export function replace(str: unknown, search: unknown, replacement: unknown): string {
  if (typeof str !== 'string') {
    throw new TypeError('replace() requires a string as first argument');
  }
  if (typeof search !== 'string') {
    throw new TypeError('replace() requires a string as second argument');
  }
  if (typeof replacement !== 'string') {
    throw new TypeError('replace() requires a string as third argument');
  }
  return str.replace(search, replacement);
}

/**
 * Replace all occurrences of search string with replacement
 * @throws If any argument is not a string
 */
export function replaceAll(str: unknown, search: unknown, replacement: unknown): string {
  if (typeof str !== 'string') {
    throw new TypeError('replaceAll() requires a string as first argument');
  }
  if (typeof search !== 'string') {
    throw new TypeError('replaceAll() requires a string as second argument');
  }
  if (typeof replacement !== 'string') {
    throw new TypeError('replaceAll() requires a string as third argument');
  }
  return str.split(search).join(replacement);
}

/**
 * Extract substring from start to end index
 * Supports negative indices (from end)
 * @throws If first argument is not a string
 * @throws If start is not a number
 */
export function substring(str: unknown, start: unknown, end?: unknown): string {
  if (typeof str !== 'string') {
    throw new TypeError('substring() requires a string as first argument');
  }
  if (typeof start !== 'number') {
    throw new TypeError('substring() requires a number as second argument');
  }
  if (end !== undefined && typeof end !== 'number') {
    throw new TypeError('substring() requires a number as third argument if provided');
  }

  // Handle negative indices like slice
  const len = str.length;
  let startIdx = start < 0 ? Math.max(0, len + start) : start;
  let endIdx = end === undefined ? len : end < 0 ? Math.max(0, len + end) : end;

  return str.slice(startIdx, endIdx);
}
