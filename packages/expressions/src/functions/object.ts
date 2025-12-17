/**
 * Object functions for expressions
 *
 * All functions are pure and return new objects (never mutate input).
 */

import { isPlainObject } from '../runtime/utils';

/**
 * Return array of own enumerable property keys
 * @throws If value is not a plain object
 */
export function keys(obj: unknown): string[] {
  if (!isPlainObject(obj)) {
    throw new TypeError('keys() requires an object');
  }
  return Object.keys(obj);
}

/**
 * Return array of own enumerable property values
 * @throws If value is not a plain object
 */
export function values(obj: unknown): unknown[] {
  if (!isPlainObject(obj)) {
    throw new TypeError('values() requires an object');
  }
  return Object.values(obj);
}

/**
 * Return array of [key, value] pairs for own enumerable properties
 * @throws If value is not a plain object
 */
export function entries(obj: unknown): [string, unknown][] {
  if (!isPlainObject(obj)) {
    throw new TypeError('entries() requires an object');
  }
  return Object.entries(obj);
}

/**
 * Shallow merge multiple objects, later values override earlier
 * Non-objects are skipped
 */
export function merge(...args: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const arg of args) {
    if (isPlainObject(arg)) {
      Object.assign(result, arg);
    }
  }
  return result;
}

/**
 * Return new object with only specified keys
 * Missing keys are ignored
 * @throws If first argument is not a plain object
 * @throws If second argument is not an array
 */
export function pick(obj: unknown, keysArr: unknown): Record<string, unknown> {
  if (!isPlainObject(obj)) {
    throw new TypeError('pick() requires an object as first argument');
  }
  if (!Array.isArray(keysArr)) {
    throw new TypeError('pick() requires an array of keys as second argument');
  }

  const result: Record<string, unknown> = {};
  for (const key of keysArr) {
    if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Return new object without specified keys
 * @throws If first argument is not a plain object
 * @throws If second argument is not an array
 */
export function omit(obj: unknown, keysArr: unknown): Record<string, unknown> {
  if (!isPlainObject(obj)) {
    throw new TypeError('omit() requires an object as first argument');
  }
  if (!Array.isArray(keysArr)) {
    throw new TypeError('omit() requires an array of keys as second argument');
  }

  const keysToOmit = new Set(keysArr.filter((k) => typeof k === 'string'));
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!keysToOmit.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Deep access via dot-notation string path
 * Returns default value (or undefined) if path doesn't exist
 */
export function get(obj: unknown, path: unknown, defaultValue?: unknown): unknown {
  if (typeof path !== 'string') {
    throw new TypeError('get() requires a string path as second argument');
  }

  if (obj == null) {
    return defaultValue;
  }

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null) {
      return defaultValue;
    }
    if (isPlainObject(current)) {
      current = (current as Record<string, unknown>)[part];
    } else if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (!isNaN(index)) {
        current = current[index];
      } else {
        return defaultValue;
      }
    } else {
      return defaultValue;
    }
  }

  return current === undefined ? defaultValue : current;
}

/**
 * Check if object has own property
 * @throws If first argument is not a plain object
 */
export function has(obj: unknown, key: unknown): boolean {
  if (!isPlainObject(obj)) {
    throw new TypeError('has() requires an object as first argument');
  }
  if (typeof key !== 'string') {
    throw new TypeError('has() requires a string key as second argument');
  }
  return Object.prototype.hasOwnProperty.call(obj, key);
}
