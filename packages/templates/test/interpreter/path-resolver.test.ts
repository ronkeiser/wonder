/**
 * Tests for path resolution functions
 */

import { describe, expect, it } from 'vitest';
import { resolvePath } from '../../src/interpreter/path-resolver.js';

describe('resolvePath', () => {
  describe('basic property access', () => {
    it('should resolve single property', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['foo'])).toBe('bar');
    });

    it('should resolve nested property', () => {
      const context = { a: { b: { c: 1 } } };
      expect(resolvePath(context, ['a', 'b', 'c'])).toBe(1);
    });

    it('should return undefined for missing property', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['baz'])).toBe(undefined);
    });

    it('should return undefined for missing intermediate', () => {
      const context = { foo: null };
      expect(resolvePath(context, ['foo', 'bar'])).toBe(undefined);
    });
  });

  describe('empty parts ({{this}})', () => {
    it('should return context as-is for empty parts', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, [])).toBe(context);
    });

    it('should return primitive context for empty parts', () => {
      expect(resolvePath('hello', [])).toBe('hello');
      expect(resolvePath(42, [])).toBe(42);
      expect(resolvePath(true, [])).toBe(true);
    });

    it('should return null context for empty parts', () => {
      expect(resolvePath(null, [])).toBe(null);
    });

    it('should return undefined context for empty parts', () => {
      expect(resolvePath(undefined, [])).toBe(undefined);
    });
  });

  describe('array index access', () => {
    it('should access array elements by string index', () => {
      const context = { items: ['a', 'b', 'c'] };
      expect(resolvePath(context, ['items', '0'])).toBe('a');
      expect(resolvePath(context, ['items', '1'])).toBe('b');
      expect(resolvePath(context, ['items', '2'])).toBe('c');
    });

    it('should return undefined for out of bounds index', () => {
      const context = { items: ['a', 'b'] };
      expect(resolvePath(context, ['items', '99'])).toBe(undefined);
    });

    it('should return undefined for negative index', () => {
      const context = { items: ['a', 'b'] };
      expect(resolvePath(context, ['items', '-1'])).toBe(undefined);
    });

    it('should access properties of array elements', () => {
      const context = { items: [{ name: 'Alice' }, { name: 'Bob' }] };
      expect(resolvePath(context, ['items', '0', 'name'])).toBe('Alice');
      expect(resolvePath(context, ['items', '1', 'name'])).toBe('Bob');
    });

    it('should handle sparse arrays', () => {
      const context = { items: [1, , 3] }; // eslint-disable-line no-sparse-arrays
      expect(resolvePath(context, ['items', '1'])).toBe(undefined);
    });

    it('should handle nested arrays', () => {
      const context = {
        matrix: [
          [1, 2],
          [3, 4],
        ],
      };
      expect(resolvePath(context, ['matrix', '0', '1'])).toBe(2);
      expect(resolvePath(context, ['matrix', '1', '0'])).toBe(3);
    });
  });

  describe('deep nesting', () => {
    it('should handle deep property chains', () => {
      const context = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep',
                },
              },
            },
          },
        },
      };
      expect(
        resolvePath(context, ['level1', 'level2', 'level3', 'level4', 'level5', 'value']),
      ).toBe('deep');
    });

    it('should return undefined if deep chain breaks', () => {
      const context = {
        level1: {
          level2: null,
        },
      };
      expect(resolvePath(context, ['level1', 'level2', 'level3', 'value'])).toBe(undefined);
    });
  });

  describe('null and undefined contexts', () => {
    it('should return undefined for null context', () => {
      expect(resolvePath(null, ['foo'])).toBe(undefined);
    });

    it('should return undefined for undefined context', () => {
      expect(resolvePath(undefined, ['foo'])).toBe(undefined);
    });

    it('should handle null intermediate values', () => {
      const context = { a: { b: null } };
      expect(resolvePath(context, ['a', 'b', 'c'])).toBe(undefined);
    });

    it('should handle undefined intermediate values', () => {
      const context = { a: { b: undefined } };
      expect(resolvePath(context, ['a', 'b', 'c'])).toBe(undefined);
    });
  });

  describe('edge cases with various value types', () => {
    it('should return property value when it is null', () => {
      const context = { foo: null };
      expect(resolvePath(context, ['foo'])).toBe(null);
    });

    it('should return property value when it is undefined', () => {
      const context = { foo: undefined };
      expect(resolvePath(context, ['foo'])).toBe(undefined);
    });

    it('should return property value when it is false', () => {
      const context = { foo: false };
      expect(resolvePath(context, ['foo'])).toBe(false);
    });

    it('should return property value when it is 0', () => {
      const context = { foo: 0 };
      expect(resolvePath(context, ['foo'])).toBe(0);
    });

    it('should return property value when it is empty string', () => {
      const context = { foo: '' };
      expect(resolvePath(context, ['foo'])).toBe('');
    });

    it('should return property value when it is empty array', () => {
      const context = { foo: [] };
      const result = resolvePath(context, ['foo']);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should return property value when it is empty object', () => {
      const context = { foo: {} };
      expect(resolvePath(context, ['foo'])).toEqual({});
    });
  });

  describe('security: prototype pollution prevention', () => {
    it('should return undefined for __proto__', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['__proto__'])).toBe(undefined);
    });

    it('should return undefined for constructor', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['constructor'])).toBe(undefined);
    });

    it('should return undefined for prototype', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['prototype'])).toBe(undefined);
    });

    it('should not access inherited properties', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['toString'])).toBe(undefined);
      expect(resolvePath(context, ['hasOwnProperty'])).toBe(undefined);
      expect(resolvePath(context, ['valueOf'])).toBe(undefined);
    });
  });

  describe('special object types', () => {
    it('should work with objects with null prototype', () => {
      const context = Object.create(null);
      context.foo = 'bar';
      expect(resolvePath(context, ['foo'])).toBe('bar');
    });

    it('should work with objects with null prototype and nested access', () => {
      const obj = Object.create(null);
      obj.nested = { value: 42 };
      expect(resolvePath(obj, ['nested', 'value'])).toBe(42);
    });

    it('should return undefined for primitive string context', () => {
      expect(resolvePath('hello', ['length'])).toBe(undefined);
      expect(resolvePath('hello', ['charAt'])).toBe(undefined);
    });

    it('should return undefined for primitive number context', () => {
      expect(resolvePath(42, ['toString'])).toBe(undefined);
      expect(resolvePath(42, ['toFixed'])).toBe(undefined);
    });

    it('should return undefined for primitive boolean context', () => {
      expect(resolvePath(true, ['toString'])).toBe(undefined);
      expect(resolvePath(false, ['valueOf'])).toBe(undefined);
    });

    it('should work with functions that have own properties', () => {
      const fn: any = () => {};
      fn.customProp = 'value';
      expect(resolvePath(fn, ['customProp'])).toBe('value');
    });

    it('should return undefined for function without requested property', () => {
      const fn = () => {};
      expect(resolvePath(fn, ['missingProp'])).toBe(undefined);
    });
  });

  describe('property names with special characters', () => {
    it('should handle property names with spaces', () => {
      const context = { 'my key': 'value' };
      expect(resolvePath(context, ['my key'])).toBe('value');
    });

    it('should handle property names with dots', () => {
      const context = { 'key.with.dots': 'value' };
      expect(resolvePath(context, ['key.with.dots'])).toBe('value');
    });

    it('should handle numeric string keys', () => {
      const context = { '123': 'value' };
      expect(resolvePath(context, ['123'])).toBe('value');
    });

    it('should handle empty string as property name', () => {
      const context = { '': 'empty key' };
      expect(resolvePath(context, [''])).toBe('empty key');
    });

    it('should handle unicode property names', () => {
      const context = { 你好: 'hello', '🎉': 'party' };
      expect(resolvePath(context, ['你好'])).toBe('hello');
      expect(resolvePath(context, ['🎉'])).toBe('party');
    });
  });
});
