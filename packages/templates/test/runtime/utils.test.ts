import { describe, expect, it } from 'vitest';
import { lookupProperty } from '../../src/runtime/utils';

/**
 * Runtime Utilities Tests
 *
 * Tests for core utility functions that provide secure property access,
 * HTML escaping, scope management, and value checking.
 */
describe('Runtime Utilities', () => {
  describe('lookupProperty (Feature 3.1 - Task C3-F1-T1)', () => {
    describe('Basic Property Lookup', () => {
      it('returns value for existing own property', () => {
        const obj = { foo: 'bar', num: 42, bool: true };

        expect(lookupProperty(obj, 'foo')).toBe('bar');
        expect(lookupProperty(obj, 'num')).toBe(42);
        expect(lookupProperty(obj, 'bool')).toBe(true);
      });

      it('returns undefined for non-existent property', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'baz')).toBeUndefined();
        expect(lookupProperty(obj, 'nonExistent')).toBeUndefined();
      });

      it('returns undefined for null parent', () => {
        expect(lookupProperty(null, 'foo')).toBeUndefined();
        expect(lookupProperty(null, 'anyProp')).toBeUndefined();
      });

      it('returns undefined for undefined parent', () => {
        expect(lookupProperty(undefined, 'foo')).toBeUndefined();
        expect(lookupProperty(undefined, 'anyProp')).toBeUndefined();
      });

      it('returns null for own property with null value', () => {
        const obj = { foo: null };

        expect(lookupProperty(obj, 'foo')).toBeNull();
      });

      it('returns undefined for own property with undefined value', () => {
        const obj = { foo: undefined };

        expect(lookupProperty(obj, 'foo')).toBeUndefined();
      });
    });

    describe('Security - Inherited Properties', () => {
      it('returns undefined for inherited property', () => {
        const obj = Object.create({ inherited: 'value' });
        obj.own = 'ownValue';

        expect(lookupProperty(obj, 'own')).toBe('ownValue');
        expect(lookupProperty(obj, 'inherited')).toBeUndefined();
      });

      it('blocks access to __proto__', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, '__proto__')).toBeUndefined();
      });

      it('blocks access to constructor', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'constructor')).toBeUndefined();
      });

      it('blocks access to prototype', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'prototype')).toBeUndefined();
      });

      it('blocks access to toString (inherited from Object.prototype)', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'toString')).toBeUndefined();
      });

      it('blocks access to hasOwnProperty (inherited)', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'hasOwnProperty')).toBeUndefined();
      });

      it('allows access to own property named "__proto__" when set via Object.defineProperty', () => {
        const obj: any = { foo: 'bar' };
        // Using defineProperty is the only way to create an own property named "__proto__"
        Object.defineProperty(obj, '__proto__', {
          value: 'ownProtoValue',
          enumerable: true,
          writable: true,
          configurable: true,
        });

        // This is an own property, not the inherited __proto__
        expect(lookupProperty(obj, '__proto__')).toBe('ownProtoValue');
      });
    });

    describe('Data Types', () => {
      it('works with nested objects', () => {
        const obj = {
          user: { name: 'Alice', age: 30 },
          items: [1, 2, 3],
        };

        expect(lookupProperty(obj, 'user')).toEqual({ name: 'Alice', age: 30 });
        expect(lookupProperty(obj, 'items')).toEqual([1, 2, 3]);
      });

      it('works with arrays', () => {
        const arr = ['a', 'b', 'c'];

        expect(lookupProperty(arr, '0')).toBe('a');
        expect(lookupProperty(arr, '1')).toBe('b');
        expect(lookupProperty(arr, '2')).toBe('c');
        expect(lookupProperty(arr, 'length')).toBe(3);
      });

      it('works with array numeric string indices', () => {
        const arr = [10, 20, 30];

        expect(lookupProperty(arr, '0')).toBe(10);
        expect(lookupProperty(arr, '1')).toBe(20);
        expect(lookupProperty(arr, '2')).toBe(30);
      });

      it('works with objects with numeric keys', () => {
        const obj = { '0': 'zero', '1': 'one', '10': 'ten' };

        expect(lookupProperty(obj, '0')).toBe('zero');
        expect(lookupProperty(obj, '1')).toBe('one');
        expect(lookupProperty(obj, '10')).toBe('ten');
      });

      it('returns undefined for out-of-bounds array index', () => {
        const arr = ['a', 'b', 'c'];

        expect(lookupProperty(arr, '3')).toBeUndefined();
        expect(lookupProperty(arr, '100')).toBeUndefined();
      });
    });

    describe('Edge Cases', () => {
      it('handles empty string property name', () => {
        const obj = { '': 'empty' };

        expect(lookupProperty(obj, '')).toBe('empty');
      });

      it('handles property name with spaces', () => {
        const obj = { 'foo bar': 'value' };

        expect(lookupProperty(obj, 'foo bar')).toBe('value');
      });

      it('handles property name with special characters', () => {
        const obj = { 'foo-bar': 'dash', 'foo.bar': 'dot', 'foo/bar': 'slash' };

        expect(lookupProperty(obj, 'foo-bar')).toBe('dash');
        expect(lookupProperty(obj, 'foo.bar')).toBe('dot');
        expect(lookupProperty(obj, 'foo/bar')).toBe('slash');
      });

      it('returns undefined for primitive parents', () => {
        expect(lookupProperty('string', 'length')).toBeUndefined();
        expect(lookupProperty(42, 'toString')).toBeUndefined();
        expect(lookupProperty(true, 'valueOf')).toBeUndefined();
      });

      it('works with functions', () => {
        const fn = () => {};
        (fn as any).customProp = 'value';

        expect(lookupProperty(fn, 'customProp')).toBe('value');
        expect(lookupProperty(fn, 'call')).toBeUndefined(); // inherited
      });

      it('handles object with null prototype', () => {
        const obj = Object.create(null);
        obj.foo = 'bar';

        expect(lookupProperty(obj, 'foo')).toBe('bar');
        expect(lookupProperty(obj, 'toString')).toBeUndefined();
      });
    });

    describe('Complex Scenarios', () => {
      it('handles deeply nested property values', () => {
        const obj = {
          level1: {
            level2: {
              level3: {
                value: 'deep',
              },
            },
          },
        };

        const level1 = lookupProperty(obj, 'level1');
        expect(level1).toBeDefined();

        const level2 = lookupProperty(level1, 'level2');
        expect(level2).toBeDefined();

        const level3 = lookupProperty(level2, 'level3');
        expect(level3).toBeDefined();

        const value = lookupProperty(level3, 'value');
        expect(value).toBe('deep');
      });

      it('handles property shadowing', () => {
        const parent = { prop: 'parent' };
        const child = Object.create(parent);
        child.prop = 'child';

        expect(lookupProperty(child, 'prop')).toBe('child');
      });

      it('distinguishes between missing and undefined properties', () => {
        const obj = { explicitUndefined: undefined };

        // Both return undefined, but one is an own property
        expect(lookupProperty(obj, 'explicitUndefined')).toBeUndefined();
        expect(lookupProperty(obj, 'missing')).toBeUndefined();

        // Verify using hasOwnProperty
        expect(Object.prototype.hasOwnProperty.call(obj, 'explicitUndefined')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(obj, 'missing')).toBe(false);
      });

      it('handles objects with many properties', () => {
        const obj: any = {};
        for (let i = 0; i < 100; i++) {
          obj[`prop${i}`] = i;
        }

        expect(lookupProperty(obj, 'prop0')).toBe(0);
        expect(lookupProperty(obj, 'prop50')).toBe(50);
        expect(lookupProperty(obj, 'prop99')).toBe(99);
        expect(lookupProperty(obj, 'prop100')).toBeUndefined();
      });
    });
  });
});
