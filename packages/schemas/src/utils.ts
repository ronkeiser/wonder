// Utility functions for JSON Pointer paths and validation helpers

/**
 * Format a JSON Pointer path (RFC 6901)
 * @param segments Path segments
 * @returns Formatted JSON Pointer path
 */
export function formatPath(segments: (string | number)[]): string {
  if (segments.length === 0) return '';
  return '/' + segments.map((segment) => encodePointerSegment(String(segment))).join('/');
}

/**
 * Encode a JSON Pointer segment (escape ~ and /)
 * @param segment Segment to encode
 * @returns Encoded segment
 */
function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Append a segment to a JSON Pointer path
 * @param path Current path
 * @param segment Segment to append
 * @returns New path with segment appended
 */
export function appendPath(path: string, segment: string | number): string {
  return path + '/' + encodePointerSegment(String(segment));
}

/**
 * Get the actual JavaScript type of a value
 * @param value Value to check
 * @returns Type string
 */
export function getType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Check if a value is a plain object (not array, null, or other)
 * @param value Value to check
 * @returns True if plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep equality check for primitive values and arrays
 * Used for uniqueItems validation
 * @param a First value
 * @param b Second value
 * @returns True if values are equal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}
