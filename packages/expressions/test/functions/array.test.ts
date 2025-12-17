import { describe, expect, it } from 'vitest';
import {
  append,
  concat,
  first,
  flatten,
  includes,
  last,
  length,
  reverse,
  slice,
  sort,
  unique,
} from '../../src/functions/array';

describe('Array Functions', () => {
  describe('length', () => {
    it('returns length of array', () => {
      expect(length([1, 2, 3])).toBe(3);
    });

    it('returns 0 for empty array', () => {
      expect(length([])).toBe(0);
    });

    it('returns 1 for single element', () => {
      expect(length(['a'])).toBe(1);
    });

    it('throws for non-array', () => {
      expect(() => length('string')).toThrow('length() requires an array');
      expect(() => length(42)).toThrow('length() requires an array');
      expect(() => length(null)).toThrow('length() requires an array');
      expect(() => length({})).toThrow('length() requires an array');
    });
  });

  describe('append', () => {
    it('appends item to array', () => {
      expect(append([1, 2], 3)).toEqual([1, 2, 3]);
    });

    it('appends to empty array', () => {
      expect(append([], 'a')).toEqual(['a']);
    });

    it('appends null and undefined', () => {
      expect(append([1], null)).toEqual([1, null]);
      expect(append([1], undefined)).toEqual([1, undefined]);
    });

    it('does not mutate original array', () => {
      const original = [1, 2];
      const result = append(original, 3);
      expect(original).toEqual([1, 2]);
      expect(result).toEqual([1, 2, 3]);
      expect(result).not.toBe(original);
    });

    it('throws for non-array first argument', () => {
      expect(() => append('string', 1)).toThrow('append() requires an array as first argument');
    });
  });

  describe('concat', () => {
    it('concatenates multiple arrays', () => {
      expect(concat([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
    });

    it('concatenates three arrays', () => {
      expect(concat([1], [2], [3])).toEqual([1, 2, 3]);
    });

    it('handles empty arrays', () => {
      expect(concat([], [1, 2])).toEqual([1, 2]);
      expect(concat([1, 2], [])).toEqual([1, 2]);
      expect(concat([], [])).toEqual([]);
    });

    it('handles non-arrays as single elements', () => {
      expect(concat([1], 2, [3])).toEqual([1, 2, 3]);
      expect(concat('a', 'b')).toEqual(['a', 'b']);
    });

    it('returns empty array with no arguments', () => {
      expect(concat()).toEqual([]);
    });

    it('does not mutate original arrays', () => {
      const a = [1, 2];
      const b = [3, 4];
      const result = concat(a, b);
      expect(a).toEqual([1, 2]);
      expect(b).toEqual([3, 4]);
      expect(result).not.toBe(a);
      expect(result).not.toBe(b);
    });
  });

  describe('first', () => {
    it('returns first element', () => {
      expect(first([1, 2, 3])).toBe(1);
    });

    it('returns undefined for empty array', () => {
      expect(first([])).toBe(undefined);
    });

    it('returns single element', () => {
      expect(first(['only'])).toBe('only');
    });

    it('returns object reference', () => {
      const obj = { a: 1 };
      expect(first([obj, { b: 2 }])).toBe(obj);
    });

    it('throws for non-array', () => {
      expect(() => first('string')).toThrow('first() requires an array');
      expect(() => first(null)).toThrow('first() requires an array');
    });
  });

  describe('last', () => {
    it('returns last element', () => {
      expect(last([1, 2, 3])).toBe(3);
    });

    it('returns undefined for empty array', () => {
      expect(last([])).toBe(undefined);
    });

    it('returns single element', () => {
      expect(last(['only'])).toBe('only');
    });

    it('returns object reference', () => {
      const obj = { b: 2 };
      expect(last([{ a: 1 }, obj])).toBe(obj);
    });

    it('throws for non-array', () => {
      expect(() => last('string')).toThrow('last() requires an array');
      expect(() => last(null)).toThrow('last() requires an array');
    });
  });

  describe('slice', () => {
    it('slices from start index', () => {
      expect(slice([1, 2, 3, 4], 1)).toEqual([2, 3, 4]);
    });

    it('slices with start and end', () => {
      expect(slice([1, 2, 3, 4], 1, 3)).toEqual([2, 3]);
    });

    it('handles negative start index', () => {
      expect(slice([1, 2, 3, 4], -2)).toEqual([3, 4]);
    });

    it('handles negative end index', () => {
      expect(slice([1, 2, 3, 4], 0, -1)).toEqual([1, 2, 3]);
    });

    it('handles out of bounds indices', () => {
      expect(slice([1, 2, 3], 5)).toEqual([]);
      expect(slice([1, 2, 3], 0, 10)).toEqual([1, 2, 3]);
    });

    it('returns empty array for empty array', () => {
      expect(slice([], 0)).toEqual([]);
    });

    it('does not mutate original array', () => {
      const original = [1, 2, 3];
      const result = slice(original, 1);
      expect(original).toEqual([1, 2, 3]);
      expect(result).not.toBe(original);
    });

    it('throws for non-array first argument', () => {
      expect(() => slice('string', 0)).toThrow('slice() requires an array as first argument');
    });

    it('throws for non-number start', () => {
      expect(() => slice([1, 2], 'a')).toThrow('slice() requires a number as second argument');
    });

    it('throws for non-number end', () => {
      expect(() => slice([1, 2], 0, 'b')).toThrow(
        'slice() requires a number as third argument if provided'
      );
    });
  });

  describe('includes', () => {
    it('returns true if array includes item', () => {
      expect(includes([1, 2, 3], 2)).toBe(true);
    });

    it('returns false if array does not include item', () => {
      expect(includes([1, 2, 3], 4)).toBe(false);
    });

    it('uses strict equality', () => {
      expect(includes([1, 2, 3], '2')).toBe(false);
      expect(includes(['1', '2'], 1)).toBe(false);
    });

    it('works with null and undefined', () => {
      expect(includes([1, null, 3], null)).toBe(true);
      expect(includes([1, undefined, 3], undefined)).toBe(true);
      expect(includes([1, 2, 3], null)).toBe(false);
    });

    it('works with objects (reference equality)', () => {
      const obj = { a: 1 };
      expect(includes([obj, { b: 2 }], obj)).toBe(true);
      expect(includes([{ a: 1 }, { b: 2 }], { a: 1 })).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(includes([], 1)).toBe(false);
    });

    it('throws for non-array first argument', () => {
      expect(() => includes('string', 's')).toThrow('includes() requires an array as first argument');
    });
  });

  describe('unique', () => {
    it('removes duplicate primitives', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });

    it('removes duplicate strings', () => {
      expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('preserves order (first occurrence)', () => {
      expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
    });

    it('returns empty array for empty array', () => {
      expect(unique([])).toEqual([]);
    });

    it('returns single element array unchanged', () => {
      expect(unique(['only'])).toEqual(['only']);
    });

    it('uses reference equality for objects', () => {
      const obj = { a: 1 };
      expect(unique([obj, obj, { a: 1 }])).toEqual([obj, { a: 1 }]);
    });

    it('does not mutate original array', () => {
      const original = [1, 2, 2, 3];
      const result = unique(original);
      expect(original).toEqual([1, 2, 2, 3]);
      expect(result).not.toBe(original);
    });

    it('throws for non-array', () => {
      expect(() => unique('string')).toThrow('unique() requires an array');
    });
  });

  describe('flatten', () => {
    it('flattens one level', () => {
      expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it('only flattens one level deep', () => {
      expect(flatten([[[1, 2]], [[3, 4]]])).toEqual([[1, 2], [3, 4]]);
    });

    it('preserves non-array elements', () => {
      expect(flatten([1, [2, 3], 4])).toEqual([1, 2, 3, 4]);
    });

    it('handles empty nested arrays', () => {
      expect(flatten([[], [1], []])).toEqual([1]);
    });

    it('returns empty array for empty array', () => {
      expect(flatten([])).toEqual([]);
    });

    it('returns copy for flat array', () => {
      const original = [1, 2, 3];
      const result = flatten(original);
      expect(result).toEqual([1, 2, 3]);
      expect(result).not.toBe(original);
    });

    it('does not mutate original array', () => {
      const nested = [1, 2];
      const original = [[0], nested, [3]];
      const result = flatten(original);
      expect(original).toEqual([[0], nested, [3]]);
      expect(nested).toEqual([1, 2]);
    });

    it('throws for non-array', () => {
      expect(() => flatten('string')).toThrow('flatten() requires an array');
    });
  });

  describe('sort', () => {
    it('sorts numbers numerically', () => {
      expect(sort([3, 1, 4, 1, 5, 9, 2, 6])).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
    });

    it('sorts negative numbers correctly', () => {
      expect(sort([5, -3, 0, -1, 2])).toEqual([-3, -1, 0, 2, 5]);
    });

    it('sorts strings alphabetically', () => {
      expect(sort(['banana', 'apple', 'cherry'])).toEqual(['apple', 'banana', 'cherry']);
    });

    it('sorts strings case-sensitively', () => {
      const result = sort(['b', 'A', 'a', 'B']);
      expect(result).toEqual(['a', 'A', 'b', 'B']);
    });

    it('handles mixed types (numbers before strings)', () => {
      expect(sort([3, 'b', 1, 'a', 2])).toEqual([1, 2, 3, 'a', 'b']);
    });

    it('returns empty array for empty array', () => {
      expect(sort([])).toEqual([]);
    });

    it('returns single element array', () => {
      expect(sort([42])).toEqual([42]);
    });

    it('does not mutate original array', () => {
      const original = [3, 1, 2];
      const result = sort(original);
      expect(original).toEqual([3, 1, 2]);
      expect(result).toEqual([1, 2, 3]);
      expect(result).not.toBe(original);
    });

    it('throws for non-array', () => {
      expect(() => sort('string')).toThrow('sort() requires an array');
    });
  });

  describe('reverse', () => {
    it('reverses array', () => {
      expect(reverse([1, 2, 3])).toEqual([3, 2, 1]);
    });

    it('returns empty array for empty array', () => {
      expect(reverse([])).toEqual([]);
    });

    it('returns single element array', () => {
      expect(reverse(['only'])).toEqual(['only']);
    });

    it('reverses strings', () => {
      expect(reverse(['a', 'b', 'c'])).toEqual(['c', 'b', 'a']);
    });

    it('does not mutate original array', () => {
      const original = [1, 2, 3];
      const result = reverse(original);
      expect(original).toEqual([1, 2, 3]);
      expect(result).toEqual([3, 2, 1]);
      expect(result).not.toBe(original);
    });

    it('throws for non-array', () => {
      expect(() => reverse('string')).toThrow('reverse() requires an array');
    });
  });

  describe('edge cases', () => {
    it('handles sparse arrays in length', () => {
      const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
      expect(length(sparse)).toBe(3);
    });

    it('handles nested arrays in flatten', () => {
      expect(flatten([[1, [2]], [3]])).toEqual([1, [2], 3]);
    });

    it('handles same element multiple times in unique', () => {
      const obj = { id: 1 };
      expect(unique([obj, obj, obj])).toEqual([obj]);
    });

    it('sort handles all same values', () => {
      expect(sort([1, 1, 1])).toEqual([1, 1, 1]);
    });

    it('concat handles deeply nested arrays', () => {
      expect(concat([[1]], [[2]])).toEqual([[1], [2]]);
    });
  });
});
