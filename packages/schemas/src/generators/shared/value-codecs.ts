/**
 * Value encoding/decoding utilities for SQL generators
 *
 * Handles conversion between JavaScript values and SQLite storage formats.
 */

/**
 * Convert a JavaScript boolean to SQLite INTEGER (0/1)
 */
export function booleanToSql(value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Convert a SQLite INTEGER (0/1) back to JavaScript boolean
 */
export function sqlToBoolean(value: unknown): boolean {
  return value === 1;
}

/**
 * Encode a JavaScript value as JSON string for storage
 */
export function encodeJsonValue(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Decode a JSON string value, returning a default if not a string.
 * Used for reading JSON columns that may contain objects or arrays.
 *
 * @param value - The raw value from SQLite (may be string or already parsed)
 * @param defaultValue - Default to return if value is not a string
 */
export function decodeJsonValue<T>(value: unknown, defaultValue: T): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return (value as T) ?? defaultValue;
}

/**
 * Decode a JSON array value
 */
export function decodeJsonArray(value: unknown): unknown[] {
  return decodeJsonValue(value, []);
}

/**
 * Decode a JSON object value
 */
export function decodeJsonObject(value: unknown): Record<string, unknown> {
  return decodeJsonValue(value, {});
}
