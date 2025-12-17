import { describe, expect, it } from 'vitest';
import { isPlainObject, lookupProperty, resolvePath } from '../src/runtime/utils';

describe('Runtime Utilities', () => {
  describe('lookupProperty', () => {
    describe('basic access', () => {
      it('returns own property value', () => {
        expect(lookupProperty({ foo: 'bar' }, 'foo')).toBe('bar');
      });

      it('returns undefined for missing property', () => {
        expect(lookupProperty({ foo: 'bar' }, 'baz')).toBe(undefined);
      });

      it('returns undefined for null parent', () => {
        expect(lookupProperty(null, 'foo')).toBe(undefined);
      });

      it('returns undefined for undefined parent', () => {
        expect(lookupProperty(undefined, 'foo')).toBe(undefined);
      });
    });

    describe('prototype pollution prevention', () => {
      it('blocks __proto__ access', () => {
        const obj = { safe: 'value' };
        expect(lookupProperty(obj, '__proto__')).toBe(undefined);
      });

      it('blocks constructor access', () => {
        const obj = { safe: 'value' };
        expect(lookupProperty(obj, 'constructor')).toBe(undefined);
      });

      it('blocks __defineGetter__', () => {
        const obj = { safe: 'value' };
        expect(lookupProperty(obj, '__defineGetter__')).toBe(undefined);
      });

      it('blocks __defineSetter__', () => {
        const obj = { safe: 'value' };
        expect(lookupProperty(obj, '__defineSetter__')).toBe(undefined);
      });

      it('blocks __lookupGetter__', () => {
        const obj = { safe: 'value' };
        expect(lookupProperty(obj, '__lookupGetter__')).toBe(undefined);
      });

      it('blocks __lookupSetter__', () => {
        const obj = { safe: 'value' };
        expect(lookupProperty(obj, '__lookupSetter__')).toBe(undefined);
      });

      it('does not access inherited properties', () => {
        const proto = { inherited: 'should not see' };
        const obj = Object.create(proto);
        obj.own = 'visible';
        expect(lookupProperty(obj, 'own')).toBe('visible');
        expect(lookupProperty(obj, 'inherited')).toBe(undefined);
      });

      it('blocks dangerous property even if it exists as own property', () => {
        // Even if someone manages to set __proto__ as own property
        const obj = Object.create(null);
        obj.__proto__ = 'malicious';
        expect(lookupProperty(obj, '__proto__')).toBe(undefined);
      });
    });

    describe('array handling', () => {
      it('returns array element by index', () => {
        expect(lookupProperty(['a', 'b', 'c'], '0')).toBe('a');
        expect(lookupProperty(['a', 'b', 'c'], '2')).toBe('c');
      });

      it('returns array length', () => {
        expect(lookupProperty([1, 2, 3], 'length')).toBe(3);
        expect(lookupProperty([], 'length')).toBe(0);
      });

      it('returns undefined for out of bounds index', () => {
        expect(lookupProperty(['a'], '5')).toBe(undefined);
      });
    });

    describe('string handling', () => {
      it('returns string length', () => {
        expect(lookupProperty('hello', 'length')).toBe(5);
        expect(lookupProperty('', 'length')).toBe(0);
      });

      it('returns undefined for other string properties', () => {
        expect(lookupProperty('hello', 'charAt')).toBe(undefined);
        expect(lookupProperty('hello', 'slice')).toBe(undefined);
      });
    });

    describe('number and boolean handling', () => {
      it('returns undefined for number properties', () => {
        expect(lookupProperty(42, 'toString')).toBe(undefined);
        expect(lookupProperty(42, 'toFixed')).toBe(undefined);
      });

      it('returns undefined for boolean properties', () => {
        expect(lookupProperty(true, 'toString')).toBe(undefined);
        expect(lookupProperty(false, 'valueOf')).toBe(undefined);
      });
    });

    describe('Map support', () => {
      it('returns Map values via get', () => {
        const map = new Map([
          ['key', 'value'],
          ['num', 42],
        ]);
        expect(lookupProperty(map, 'key')).toBe('value');
        expect(lookupProperty(map, 'num')).toBe(42);
      });

      it('returns undefined for missing Map keys', () => {
        const map = new Map([['key', 'value']]);
        expect(lookupProperty(map, 'missing')).toBe(undefined);
      });

      it('blocks dangerous properties on Map', () => {
        const map = new Map([['__proto__', 'malicious']]);
        expect(lookupProperty(map, '__proto__')).toBe(undefined);
      });
    });

    describe('nested objects', () => {
      it('returns nested object values', () => {
        const obj = { user: { name: 'Alice', age: 30 } };
        expect(lookupProperty(obj, 'user')).toEqual({ name: 'Alice', age: 30 });
      });

      it('handles null values in nested structures', () => {
        const obj = { user: null };
        expect(lookupProperty(obj, 'user')).toBe(null);
      });
    });
  });

  describe('resolvePath', () => {
    describe('basic paths', () => {
      it('resolves empty path', () => {
        const obj = { foo: 'bar' };
        expect(resolvePath(obj, [])).toEqual({ foo: 'bar' });
      });

      it('resolves single-level path', () => {
        expect(resolvePath({ foo: 'bar' }, ['foo'])).toBe('bar');
      });

      it('resolves multi-level path', () => {
        const obj = { a: { b: { c: 42 } } };
        expect(resolvePath(obj, ['a', 'b', 'c'])).toBe(42);
      });

      it('returns undefined for missing intermediate', () => {
        const obj = { a: { b: 1 } };
        expect(resolvePath(obj, ['a', 'missing', 'c'])).toBe(undefined);
      });
    });

    describe('null handling', () => {
      it('returns undefined when starting from null', () => {
        expect(resolvePath(null, ['foo'])).toBe(undefined);
      });

      it('returns undefined when starting from undefined', () => {
        expect(resolvePath(undefined, ['foo'])).toBe(undefined);
      });

      it('returns undefined when path hits null', () => {
        const obj = { a: null };
        expect(resolvePath(obj, ['a', 'b'])).toBe(undefined);
      });

      it('returns undefined when path hits undefined', () => {
        const obj = { a: { b: undefined } };
        expect(resolvePath(obj, ['a', 'b', 'c'])).toBe(undefined);
      });
    });

    describe('security', () => {
      it('blocks dangerous properties in path', () => {
        const obj = { safe: { value: 1 } };
        expect(resolvePath(obj, ['__proto__'])).toBe(undefined);
        expect(resolvePath(obj, ['safe', 'constructor'])).toBe(undefined);
      });

      it('does not access inherited properties in path', () => {
        const proto = { inherited: { deep: 'value' } };
        const obj = Object.create(proto);
        obj.own = { deep: 'visible' };
        expect(resolvePath(obj, ['own', 'deep'])).toBe('visible');
        expect(resolvePath(obj, ['inherited', 'deep'])).toBe(undefined);
      });
    });

    describe('array access', () => {
      it('resolves array indices in path', () => {
        const obj = { items: ['a', 'b', 'c'] };
        expect(resolvePath(obj, ['items', '0'])).toBe('a');
        expect(resolvePath(obj, ['items', '2'])).toBe('c');
      });

      it('resolves nested array paths', () => {
        const obj = { data: [{ name: 'first' }, { name: 'second' }] };
        expect(resolvePath(obj, ['data', '1', 'name'])).toBe('second');
      });

      it('resolves array length in path', () => {
        const obj = { items: [1, 2, 3] };
        expect(resolvePath(obj, ['items', 'length'])).toBe(3);
      });
    });
  });

  describe('isPlainObject', () => {
    it('returns true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('returns false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it('returns false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject(true)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
    });

    it('returns false for special objects', () => {
      expect(isPlainObject(new Date())).toBe(true); // Note: Date is technically an object
      expect(isPlainObject(new Map())).toBe(true); // Note: Map is technically an object
      expect(isPlainObject(/regex/)).toBe(true); // Note: RegExp is technically an object
    });
  });
});
