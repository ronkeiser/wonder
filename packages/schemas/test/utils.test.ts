import { describe, expect, it } from 'vitest';
import { appendPath, deepEqual, formatPath, getType, isPlainObject } from '../src/utils.js';

describe('formatPath', () => {
  it('should return empty string for empty segments', () => {
    expect(formatPath([])).toBe('');
  });

  it('should format single string segment', () => {
    expect(formatPath(['foo'])).toBe('/foo');
  });

  it('should format single number segment', () => {
    expect(formatPath([0])).toBe('/0');
    expect(formatPath([42])).toBe('/42');
  });

  it('should format multiple segments', () => {
    expect(formatPath(['user', 'address', 'city'])).toBe('/user/address/city');
  });

  it('should format mixed string and number segments', () => {
    expect(formatPath(['users', 0, 'name'])).toBe('/users/0/name');
    expect(formatPath(['items', 2, 'tags', 0])).toBe('/items/2/tags/0');
  });

  it('should escape tilde characters (~) as ~0', () => {
    expect(formatPath(['foo~bar'])).toBe('/foo~0bar');
    expect(formatPath(['~'])).toBe('/~0');
    expect(formatPath(['~~'])).toBe('/~0~0');
  });

  it('should escape forward slash characters (/) as ~1', () => {
    expect(formatPath(['foo/bar'])).toBe('/foo~1bar');
    expect(formatPath(['/'])).toBe('/~1');
    expect(formatPath(['a/b/c'])).toBe('/a~1b~1c');
  });

  it('should escape both tilde and slash in same segment', () => {
    expect(formatPath(['~/', '/~'])).toBe('/~0~1/~1~0');
    expect(formatPath(['a~/b'])).toBe('/a~0~1b');
  });

  it('should handle empty string segments', () => {
    expect(formatPath([''])).toBe('/');
    expect(formatPath(['', 'foo', ''])).toBe('//foo/');
  });

  it('should handle segments with spaces', () => {
    expect(formatPath(['foo bar'])).toBe('/foo bar');
    expect(formatPath(['hello world', 'test'])).toBe('/hello world/test');
  });
});

describe('appendPath', () => {
  it('should append string segment to empty path', () => {
    expect(appendPath('', 'foo')).toBe('/foo');
  });

  it('should append number segment to empty path', () => {
    expect(appendPath('', 0)).toBe('/0');
    expect(appendPath('', 42)).toBe('/42');
  });

  it('should append segment to existing path', () => {
    expect(appendPath('/user', 'name')).toBe('/user/name');
    expect(appendPath('/items/0', 'value')).toBe('/items/0/value');
  });

  it('should append array index to path', () => {
    expect(appendPath('/items', 0)).toBe('/items/0');
    expect(appendPath('/users/0/tags', 2)).toBe('/users/0/tags/2');
  });

  it('should escape tilde in appended segment', () => {
    expect(appendPath('/foo', 'bar~baz')).toBe('/foo/bar~0baz');
  });

  it('should escape slash in appended segment', () => {
    expect(appendPath('/foo', 'bar/baz')).toBe('/foo/bar~1baz');
  });

  it('should escape both tilde and slash in appended segment', () => {
    expect(appendPath('/path', '~/config')).toBe('/path/~0~1config');
  });

  it('should handle empty string segment', () => {
    expect(appendPath('/foo', '')).toBe('/foo/');
  });
});

describe('getType', () => {
  it('should return "null" for null', () => {
    expect(getType(null)).toBe('null');
  });

  it('should return "array" for arrays', () => {
    expect(getType([])).toBe('array');
    expect(getType([1, 2, 3])).toBe('array');
    expect(getType(['a', 'b'])).toBe('array');
    expect(getType([{ foo: 'bar' }])).toBe('array');
  });

  it('should return "string" for strings', () => {
    expect(getType('')).toBe('string');
    expect(getType('hello')).toBe('string');
    expect(getType('123')).toBe('string');
  });

  it('should return "number" for numbers', () => {
    expect(getType(0)).toBe('number');
    expect(getType(42)).toBe('number');
    expect(getType(-1)).toBe('number');
    expect(getType(3.14)).toBe('number');
    expect(getType(NaN)).toBe('number');
    expect(getType(Infinity)).toBe('number');
    expect(getType(-Infinity)).toBe('number');
  });

  it('should return "boolean" for booleans', () => {
    expect(getType(true)).toBe('boolean');
    expect(getType(false)).toBe('boolean');
  });

  it('should return "object" for plain objects', () => {
    expect(getType({})).toBe('object');
    expect(getType({ foo: 'bar' })).toBe('object');
    expect(getType({ nested: { value: 1 } })).toBe('object');
  });

  it('should return "undefined" for undefined', () => {
    expect(getType(undefined)).toBe('undefined');
  });

  it('should return "function" for functions', () => {
    expect(getType(() => {})).toBe('function');
    expect(getType(function () {})).toBe('function');
    expect(getType(Math.max)).toBe('function');
  });

  it('should return "symbol" for symbols', () => {
    expect(getType(Symbol())).toBe('symbol');
    expect(getType(Symbol('test'))).toBe('symbol');
  });

  it('should return "bigint" for bigints', () => {
    expect(getType(BigInt(123))).toBe('bigint');
    expect(getType(0n)).toBe('bigint');
  });
});

describe('isPlainObject', () => {
  it('should return true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ foo: 'bar' })).toBe(true);
    expect(isPlainObject({ nested: { value: 1 } })).toBe(true);
  });

  it('should return true for Object.create(null)', () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('should return false for null', () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it('should return false for arrays', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
    expect(isPlainObject([{ foo: 'bar' }])).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(123)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(false)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(Symbol())).toBe(false);
    expect(isPlainObject(BigInt(1))).toBe(false);
  });

  it('should return false for functions', () => {
    expect(isPlainObject(() => {})).toBe(false);
    expect(isPlainObject(function () {})).toBe(false);
  });

  it('should return true for objects created with new Object()', () => {
    expect(isPlainObject(new Object())).toBe(true);
  });

  // Note: isPlainObject uses a simple check (typeof === 'object' && not null && not array)
  // It returns true for Date, RegExp, Map, Set since they are technically objects.
  // This is intentional for the validation use case where JSON data won't contain these types.
  it('should return true for Date objects (treated as objects)', () => {
    expect(isPlainObject(new Date())).toBe(true);
  });

  it('should return true for RegExp objects (treated as objects)', () => {
    expect(isPlainObject(/test/)).toBe(true);
    expect(isPlainObject(new RegExp('test'))).toBe(true);
  });

  it('should return true for Map and Set (treated as objects)', () => {
    expect(isPlainObject(new Map())).toBe(true);
    expect(isPlainObject(new Set())).toBe(true);
  });
});

describe('deepEqual', () => {
  describe('primitive values', () => {
    it('should return true for identical primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('hello', 'hello')).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(false, false)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
    });

    it('should return false for different primitives', () => {
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual('hello', 'world')).toBe(false);
      expect(deepEqual(true, false)).toBe(false);
    });

    it('should return false for different types', () => {
      expect(deepEqual(1, '1')).toBe(false);
      expect(deepEqual(true, 1)).toBe(false);
      expect(deepEqual(null, undefined)).toBe(false);
      expect(deepEqual(0, false)).toBe(false);
      expect(deepEqual('', false)).toBe(false);
    });

    it('should handle null comparisons', () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, {})).toBe(false);
      expect(deepEqual({}, null)).toBe(false);
      expect(deepEqual(null, [])).toBe(false);
      expect(deepEqual(null, 0)).toBe(false);
    });

    it('should handle undefined comparisons', () => {
      expect(deepEqual(undefined, undefined)).toBe(true);
      expect(deepEqual(undefined, null)).toBe(false);
    });

    it('should handle NaN correctly', () => {
      // NaN === NaN is false in JavaScript, so deepEqual follows same behavior
      expect(deepEqual(NaN, NaN)).toBe(false);
    });
  });

  describe('arrays', () => {
    it('should return true for identical arrays', () => {
      expect(deepEqual([], [])).toBe(true);
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    });

    it('should return false for arrays with different lengths', () => {
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
      expect(deepEqual([], [1])).toBe(false);
    });

    it('should return false for arrays with different values', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(deepEqual(['a', 'b'], ['a', 'c'])).toBe(false);
    });

    it('should return false for arrays with same values in different order', () => {
      expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
      expect(deepEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    });

    it('should handle nested arrays', () => {
      expect(deepEqual([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
      expect(deepEqual([[1, 2], [3, 4]], [[1, 2], [3, 5]])).toBe(false);
      expect(deepEqual([[[1]]], [[[1]]])).toBe(true);
      expect(deepEqual([[[1]]], [[[2]]])).toBe(false);
    });

    it('should handle arrays with mixed types', () => {
      expect(deepEqual([1, 'a', true], [1, 'a', true])).toBe(true);
      expect(deepEqual([1, 'a', true], [1, 'a', false])).toBe(false);
    });

    it('should return false when comparing array to non-array', () => {
      expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
      expect(deepEqual([], {})).toBe(false);
    });
  });

  describe('objects', () => {
    it('should return true for identical objects', () => {
      expect(deepEqual({}, {})).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });

    it('should return true regardless of key order', () => {
      expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
      expect(deepEqual({ x: 'foo', y: 'bar', z: 'baz' }, { z: 'baz', x: 'foo', y: 'bar' })).toBe(
        true,
      );
    });

    it('should return false for objects with different number of keys', () => {
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });

    it('should return false for objects with different values', () => {
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(deepEqual({ a: 'foo' }, { a: 'bar' })).toBe(false);
    });

    it('should return false for objects with different keys', () => {
      expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('should handle nested objects', () => {
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
      expect(deepEqual({ a: { b: { c: 3 } } }, { a: { b: { c: 3 } } })).toBe(true);
    });

    it('should handle objects with array values', () => {
      expect(deepEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
      expect(deepEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    });

    it('should handle complex nested structures', () => {
      const obj1 = {
        users: [
          { name: 'Alice', tags: ['admin', 'user'] },
          { name: 'Bob', tags: ['user'] },
        ],
        meta: { count: 2 },
      };
      const obj2 = {
        users: [
          { name: 'Alice', tags: ['admin', 'user'] },
          { name: 'Bob', tags: ['user'] },
        ],
        meta: { count: 2 },
      };
      const obj3 = {
        users: [
          { name: 'Alice', tags: ['admin', 'user'] },
          { name: 'Bob', tags: ['guest'] },
        ],
        meta: { count: 2 },
      };

      expect(deepEqual(obj1, obj2)).toBe(true);
      expect(deepEqual(obj1, obj3)).toBe(false);
    });
  });

  describe('reference equality', () => {
    it('should return true for same reference', () => {
      const obj = { a: 1 };
      const arr = [1, 2, 3];
      expect(deepEqual(obj, obj)).toBe(true);
      expect(deepEqual(arr, arr)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle objects with undefined values', () => {
      expect(deepEqual({ a: undefined }, { a: undefined })).toBe(true);
      // Note: { a: undefined } has key 'a', but {} does not
      expect(deepEqual({ a: undefined }, {})).toBe(false);
    });

    it('should handle empty structures', () => {
      expect(deepEqual({}, {})).toBe(true);
      expect(deepEqual([], [])).toBe(true);
      expect(deepEqual({}, [])).toBe(false);
    });

    it('should handle arrays containing objects', () => {
      expect(deepEqual([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 2 }])).toBe(true);
      expect(deepEqual([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 3 }])).toBe(false);
    });

    it('should handle objects containing null values', () => {
      expect(deepEqual({ a: null }, { a: null })).toBe(true);
      expect(deepEqual({ a: null }, { a: undefined })).toBe(false);
    });

    it('should handle arrays containing null', () => {
      expect(deepEqual([null, 1, null], [null, 1, null])).toBe(true);
      expect(deepEqual([null], [undefined])).toBe(false);
    });
  });
});
