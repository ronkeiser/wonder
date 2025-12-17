/**
 * Type functions for expressions
 *
 * Functions for type checking and inspection.
 */

import { isPlainObject } from '../runtime/utils';

/**
 * Check if value is an array
 */
export function isArray(val: unknown): boolean {
  return Array.isArray(val);
}

/**
 * Check if value is a plain object (not array, not null)
 */
export function isObject(val: unknown): boolean {
  return isPlainObject(val);
}

/**
 * Check if value is a string
 */
export function isString(val: unknown): boolean {
  return typeof val === 'string';
}

/**
 * Check if value is a number (including NaN)
 */
export function isNumber(val: unknown): boolean {
  return typeof val === 'number';
}

/**
 * Check if value is a boolean
 */
export function isBoolean(val: unknown): boolean {
  return typeof val === 'boolean';
}

/**
 * Check if value is null (not undefined)
 */
export function isNull(val: unknown): boolean {
  return val === null;
}

/**
 * Check if value is not null and not undefined
 */
export function isDefined(val: unknown): boolean {
  return val !== null && val !== undefined;
}

/**
 * Check if value is "empty"
 * Empty values: null, undefined, '', [], {}
 */
export function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) {
    return true;
  }
  if (typeof val === 'string') {
    return val === '';
  }
  if (Array.isArray(val)) {
    return val.length === 0;
  }
  if (isPlainObject(val)) {
    return Object.keys(val).length === 0;
  }
  return false;
}

/**
 * Return the type of a value as a string
 * Returns: 'string', 'number', 'boolean', 'null', 'array', 'object'
 */
export function type(val: unknown): string {
  if (val === null) {
    return 'null';
  }
  if (Array.isArray(val)) {
    return 'array';
  }
  if (typeof val === 'object') {
    return 'object';
  }
  return typeof val; // 'string', 'number', 'boolean', 'undefined'
}
