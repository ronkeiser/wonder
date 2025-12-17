import { describe, expect, it } from 'vitest';
import { entries, get, has, keys, merge, omit, pick, values } from '../../src/functions/object';

describe('Object Functions', () => {
  describe('keys', () => {
    it('returns array of keys', () => {
      expect(keys({ a: 1, b: 2, c: 3 })).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for empty object', () => {
      expect(keys({})).toEqual([]);
    });

    it('only returns own enumerable keys', () => {
      const proto = { inherited: 1 };
      const obj = Object.create(proto);
      obj.own = 2;
      expect(keys(obj)).toEqual(['own']);
    });

    it('throws for non-object', () => {
      expect(() => keys([1, 2])).toThrow('keys() requires an object');
      expect(() => keys('string')).toThrow('keys() requires an object');
      expect(() => keys(null)).toThrow('keys() requires an object');
      expect(() => keys(42)).toThrow('keys() requires an object');
    });
  });

  describe('values', () => {
    it('returns array of values', () => {
      expect(values({ a: 1, b: 2, c: 3 })).toEqual([1, 2, 3]);
    });

    it('returns empty array for empty object', () => {
      expect(values({})).toEqual([]);
    });

    it('only returns own enumerable values', () => {
      const proto = { inherited: 1 };
      const obj = Object.create(proto);
      obj.own = 2;
      expect(values(obj)).toEqual([2]);
    });

    it('preserves value types', () => {
      const nested = { x: 1 };
      const result = values({ a: nested, b: [1, 2], c: null });
      expect(result).toEqual([nested, [1, 2], null]);
      expect(result[0]).toBe(nested); // Same reference
    });

    it('throws for non-object', () => {
      expect(() => values([1, 2])).toThrow('values() requires an object');
      expect(() => values(null)).toThrow('values() requires an object');
    });
  });

  describe('entries', () => {
    it('returns array of [key, value] pairs', () => {
      expect(entries({ a: 1, b: 2 })).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('returns empty array for empty object', () => {
      expect(entries({})).toEqual([]);
    });

    it('only returns own enumerable entries', () => {
      const proto = { inherited: 1 };
      const obj = Object.create(proto);
      obj.own = 2;
      expect(entries(obj)).toEqual([['own', 2]]);
    });

    it('throws for non-object', () => {
      expect(() => entries([1, 2])).toThrow('entries() requires an object');
      expect(() => entries(null)).toThrow('entries() requires an object');
    });
  });

  describe('merge', () => {
    it('merges two objects', () => {
      expect(merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it('merges multiple objects', () => {
      expect(merge({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('later values override earlier', () => {
      expect(merge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('returns empty object with no arguments', () => {
      expect(merge()).toEqual({});
    });

    it('skips non-objects', () => {
      expect(merge({ a: 1 }, null, { b: 2 }, 'string', { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('skips arrays', () => {
      expect(merge({ a: 1 }, [1, 2], { b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it('does not mutate original objects', () => {
      const a = { x: 1 };
      const b = { y: 2 };
      const result = merge(a, b);
      expect(a).toEqual({ x: 1 });
      expect(b).toEqual({ y: 2 });
      expect(result).not.toBe(a);
      expect(result).not.toBe(b);
    });

    it('performs shallow merge', () => {
      const nested = { deep: 1 };
      const result = merge({ a: nested }, { b: 2 });
      expect(result.a).toBe(nested); // Same reference
    });
  });

  describe('pick', () => {
    it('picks specified keys', () => {
      expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('ignores missing keys', () => {
      expect(pick({ a: 1, b: 2 }, ['a', 'missing'])).toEqual({ a: 1 });
    });

    it('returns empty object for empty keys array', () => {
      expect(pick({ a: 1, b: 2 }, [])).toEqual({});
    });

    it('returns empty object for empty object', () => {
      expect(pick({}, ['a', 'b'])).toEqual({});
    });

    it('preserves value types', () => {
      const nested = { x: 1 };
      const result = pick({ a: nested, b: 2 }, ['a']);
      expect(result.a).toBe(nested); // Same reference
    });

    it('does not mutate original object', () => {
      const original = { a: 1, b: 2, c: 3 };
      const result = pick(original, ['a']);
      expect(original).toEqual({ a: 1, b: 2, c: 3 });
      expect(result).not.toBe(original);
    });

    it('throws for non-object first argument', () => {
      expect(() => pick([1, 2], ['0'])).toThrow('pick() requires an object as first argument');
      expect(() => pick(null, ['a'])).toThrow('pick() requires an object as first argument');
    });

    it('throws for non-array second argument', () => {
      expect(() => pick({ a: 1 }, 'a')).toThrow('pick() requires an array of keys as second argument');
    });
  });

  describe('omit', () => {
    it('omits specified keys', () => {
      expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
    });

    it('ignores missing keys', () => {
      expect(omit({ a: 1, b: 2 }, ['missing'])).toEqual({ a: 1, b: 2 });
    });

    it('returns copy for empty keys array', () => {
      expect(omit({ a: 1, b: 2 }, [])).toEqual({ a: 1, b: 2 });
    });

    it('returns empty object for empty object', () => {
      expect(omit({}, ['a', 'b'])).toEqual({});
    });

    it('omits multiple keys', () => {
      expect(omit({ a: 1, b: 2, c: 3, d: 4 }, ['a', 'c'])).toEqual({ b: 2, d: 4 });
    });

    it('preserves value types', () => {
      const nested = { x: 1 };
      const result = omit({ a: nested, b: 2 }, ['b']);
      expect(result.a).toBe(nested); // Same reference
    });

    it('does not mutate original object', () => {
      const original = { a: 1, b: 2, c: 3 };
      const result = omit(original, ['a']);
      expect(original).toEqual({ a: 1, b: 2, c: 3 });
      expect(result).not.toBe(original);
    });

    it('throws for non-object first argument', () => {
      expect(() => omit([1, 2], ['0'])).toThrow('omit() requires an object as first argument');
      expect(() => omit(null, ['a'])).toThrow('omit() requires an object as first argument');
    });

    it('throws for non-array second argument', () => {
      expect(() => omit({ a: 1 }, 'a')).toThrow('omit() requires an array of keys as second argument');
    });
  });

  describe('get', () => {
    it('gets nested value via dot path', () => {
      expect(get({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
    });

    it('gets top-level value', () => {
      expect(get({ a: 1 }, 'a')).toBe(1);
    });

    it('returns undefined for missing path', () => {
      expect(get({ a: 1 }, 'b')).toBe(undefined);
    });

    it('returns undefined for partial path', () => {
      expect(get({ a: { b: 1 } }, 'a.c.d')).toBe(undefined);
    });

    it('returns default value for missing path', () => {
      expect(get({ a: 1 }, 'b', 'default')).toBe('default');
    });

    it('returns default value for partial path', () => {
      expect(get({ a: { b: 1 } }, 'a.c.d', 'fallback')).toBe('fallback');
    });

    it('returns actual undefined over default if key exists', () => {
      expect(get({ a: undefined }, 'a', 'default')).toBe('default');
    });

    it('returns null if that is the value', () => {
      expect(get({ a: null }, 'a')).toBe(null);
      expect(get({ a: null }, 'a', 'default')).toBe(null);
    });

    it('handles array index in path', () => {
      expect(get({ items: ['a', 'b', 'c'] }, 'items.1')).toBe('b');
    });

    it('handles nested array access', () => {
      expect(get({ data: [{ name: 'first' }, { name: 'second' }] }, 'data.1.name')).toBe('second');
    });

    it('returns default for invalid array index', () => {
      expect(get({ items: ['a'] }, 'items.invalid', 'default')).toBe('default');
    });

    it('returns default for null/undefined object', () => {
      expect(get(null, 'a.b', 'default')).toBe('default');
      expect(get(undefined, 'a.b', 'default')).toBe('default');
    });

    it('throws for non-string path', () => {
      expect(() => get({ a: 1 }, 123)).toThrow('get() requires a string path as second argument');
      expect(() => get({ a: 1 }, null)).toThrow('get() requires a string path as second argument');
    });
  });

  describe('has', () => {
    it('returns true for existing own property', () => {
      expect(has({ a: 1 }, 'a')).toBe(true);
    });

    it('returns false for missing property', () => {
      expect(has({ a: 1 }, 'b')).toBe(false);
    });

    it('returns true for property with undefined value', () => {
      expect(has({ a: undefined }, 'a')).toBe(true);
    });

    it('returns true for property with null value', () => {
      expect(has({ a: null }, 'a')).toBe(true);
    });

    it('returns false for inherited property', () => {
      const proto = { inherited: 1 };
      const obj = Object.create(proto);
      obj.own = 2;
      expect(has(obj, 'own')).toBe(true);
      expect(has(obj, 'inherited')).toBe(false);
    });

    it('throws for non-object first argument', () => {
      expect(() => has([1, 2], '0')).toThrow('has() requires an object as first argument');
      expect(() => has(null, 'a')).toThrow('has() requires an object as first argument');
      expect(() => has('string', 'length')).toThrow('has() requires an object as first argument');
    });

    it('throws for non-string key', () => {
      expect(() => has({ a: 1 }, 123)).toThrow('has() requires a string key as second argument');
      expect(() => has({ a: 1 }, null)).toThrow('has() requires a string key as second argument');
    });
  });
});
