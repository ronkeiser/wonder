import { describe, expect, it } from 'vitest';
import {
  isArray,
  isBoolean,
  isDefined,
  isEmpty,
  isNull,
  isNumber,
  isObject,
  isString,
  type,
} from '../../src/functions/type';

describe('Type Functions', () => {
  describe('isArray', () => {
    it('returns true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b'])).toBe(true);
    });

    it('returns false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('string')).toBe(false);
      expect(isArray(123)).toBe(false);
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
    });
  });

  describe('isObject', () => {
    it('returns true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
      expect(isObject(Object.create(null))).toBe(true);
    });

    it('returns false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2])).toBe(false);
    });

    it('returns false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });
  });

  describe('isString', () => {
    it('returns true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
      expect(isString('123')).toBe(true);
    });

    it('returns false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('returns true for numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(42)).toBe(true);
      expect(isNumber(-3.14)).toBe(true);
      expect(isNumber(Infinity)).toBe(true);
    });

    it('returns true for NaN', () => {
      expect(isNumber(NaN)).toBe(true);
    });

    it('returns false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber([])).toBe(false);
      expect(isNumber({})).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('returns true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('returns false for non-booleans', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('')).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
    });
  });

  describe('isNull', () => {
    it('returns true for null', () => {
      expect(isNull(null)).toBe(true);
    });

    it('returns false for undefined', () => {
      expect(isNull(undefined)).toBe(false);
    });

    it('returns false for other values', () => {
      expect(isNull(0)).toBe(false);
      expect(isNull('')).toBe(false);
      expect(isNull(false)).toBe(false);
      expect(isNull({})).toBe(false);
      expect(isNull([])).toBe(false);
    });
  });

  describe('isDefined', () => {
    it('returns true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined({})).toBe(true);
      expect(isDefined([])).toBe(true);
    });

    it('returns false for null', () => {
      expect(isDefined(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('isEmpty', () => {
    it('returns true for null', () => {
      expect(isEmpty(null)).toBe(true);
    });

    it('returns true for undefined', () => {
      expect(isEmpty(undefined)).toBe(true);
    });

    it('returns true for empty string', () => {
      expect(isEmpty('')).toBe(true);
    });

    it('returns false for non-empty string', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty(' ')).toBe(false); // whitespace is not empty
    });

    it('returns true for empty array', () => {
      expect(isEmpty([])).toBe(true);
    });

    it('returns false for non-empty array', () => {
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty([null])).toBe(false);
    });

    it('returns true for empty object', () => {
      expect(isEmpty({})).toBe(true);
    });

    it('returns false for non-empty object', () => {
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty({ a: null })).toBe(false);
    });

    it('returns false for numbers', () => {
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty(42)).toBe(false);
    });

    it('returns false for booleans', () => {
      expect(isEmpty(false)).toBe(false);
      expect(isEmpty(true)).toBe(false);
    });
  });

  describe('type', () => {
    it('returns "string" for strings', () => {
      expect(type('')).toBe('string');
      expect(type('hello')).toBe('string');
    });

    it('returns "number" for numbers', () => {
      expect(type(0)).toBe('number');
      expect(type(42)).toBe('number');
      expect(type(NaN)).toBe('number');
    });

    it('returns "boolean" for booleans', () => {
      expect(type(true)).toBe('boolean');
      expect(type(false)).toBe('boolean');
    });

    it('returns "null" for null', () => {
      expect(type(null)).toBe('null');
    });

    it('returns "undefined" for undefined', () => {
      expect(type(undefined)).toBe('undefined');
    });

    it('returns "array" for arrays', () => {
      expect(type([])).toBe('array');
      expect(type([1, 2, 3])).toBe('array');
    });

    it('returns "object" for objects', () => {
      expect(type({})).toBe('object');
      expect(type({ a: 1 })).toBe('object');
    });

    it('returns "object" for special objects', () => {
      expect(type(new Date())).toBe('object');
      expect(type(/regex/)).toBe('object');
    });
  });
});
