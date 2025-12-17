import { describe, expect, it } from 'vitest';
import { abs, avg, ceil, floor, max, min, round, sum } from '../../src/functions/math';

describe('Math Functions', () => {
  describe('sum', () => {
    it('returns sum of numbers', () => {
      expect(sum([1, 2, 3, 4])).toBe(10);
    });

    it('returns 0 for empty array', () => {
      expect(sum([])).toBe(0);
    });

    it('handles single element', () => {
      expect(sum([42])).toBe(42);
    });

    it('handles negative numbers', () => {
      expect(sum([1, -2, 3, -4])).toBe(-2);
    });

    it('handles decimals', () => {
      expect(sum([0.1, 0.2, 0.3])).toBeCloseTo(0.6);
    });

    it('ignores non-numbers in array', () => {
      expect(sum([1, 'two', 3, null, 5])).toBe(9);
    });

    it('throws for non-array', () => {
      expect(() => sum(42)).toThrow('sum() requires an array');
      expect(() => sum('string')).toThrow('sum() requires an array');
      expect(() => sum(null)).toThrow('sum() requires an array');
    });
  });

  describe('avg', () => {
    it('returns average of numbers', () => {
      expect(avg([1, 2, 3, 4, 5])).toBe(3);
    });

    it('returns NaN for empty array', () => {
      expect(avg([])).toBeNaN();
    });

    it('handles single element', () => {
      expect(avg([42])).toBe(42);
    });

    it('handles decimals', () => {
      expect(avg([1, 2])).toBe(1.5);
    });

    it('handles negative numbers', () => {
      expect(avg([-10, 10])).toBe(0);
    });

    it('ignores non-numbers in array', () => {
      expect(avg([1, 'two', 3, null, 5])).toBe(3); // (1+3+5)/3 = 3
    });

    it('returns NaN for array with no numbers', () => {
      expect(avg(['a', 'b', null])).toBeNaN();
    });

    it('throws for non-array', () => {
      expect(() => avg(42)).toThrow('avg() requires an array');
      expect(() => avg(null)).toThrow('avg() requires an array');
    });
  });

  describe('min', () => {
    it('returns minimum value', () => {
      expect(min([3, 1, 4, 1, 5])).toBe(1);
    });

    it('returns undefined for empty array', () => {
      expect(min([])).toBe(undefined);
    });

    it('handles single element', () => {
      expect(min([42])).toBe(42);
    });

    it('handles negative numbers', () => {
      expect(min([5, -3, 0, -10, 2])).toBe(-10);
    });

    it('handles decimals', () => {
      expect(min([0.5, 0.1, 0.9])).toBe(0.1);
    });

    it('ignores non-numbers in array', () => {
      expect(min([5, 'a', 2, null, 8])).toBe(2);
    });

    it('returns undefined for array with no numbers', () => {
      expect(min(['a', 'b', null])).toBe(undefined);
    });

    it('throws for non-array', () => {
      expect(() => min(42)).toThrow('min() requires an array');
      expect(() => min(null)).toThrow('min() requires an array');
    });
  });

  describe('max', () => {
    it('returns maximum value', () => {
      expect(max([3, 1, 4, 1, 5])).toBe(5);
    });

    it('returns undefined for empty array', () => {
      expect(max([])).toBe(undefined);
    });

    it('handles single element', () => {
      expect(max([42])).toBe(42);
    });

    it('handles negative numbers', () => {
      expect(max([-5, -3, -10, -2])).toBe(-2);
    });

    it('handles decimals', () => {
      expect(max([0.5, 0.1, 0.9])).toBe(0.9);
    });

    it('ignores non-numbers in array', () => {
      expect(max([5, 'a', 2, null, 8])).toBe(8);
    });

    it('returns undefined for array with no numbers', () => {
      expect(max(['a', 'b', null])).toBe(undefined);
    });

    it('throws for non-array', () => {
      expect(() => max(42)).toThrow('max() requires an array');
      expect(() => max(null)).toThrow('max() requires an array');
    });
  });

  describe('round', () => {
    it('rounds to nearest integer by default', () => {
      expect(round(3.7)).toBe(4);
      expect(round(3.2)).toBe(3);
      expect(round(3.5)).toBe(4);
    });

    it('rounds to specified decimal places', () => {
      expect(round(3.14159, 2)).toBe(3.14);
      expect(round(3.14159, 4)).toBe(3.1416);
      expect(round(3.14159, 0)).toBe(3);
    });

    it('handles negative numbers', () => {
      expect(round(-3.7)).toBe(-4);
      expect(round(-3.2)).toBe(-3);
    });

    it('handles negative decimal places', () => {
      expect(round(1234, -2)).toBe(1200);
      expect(round(1250, -2)).toBe(1300);
    });

    it('handles zero', () => {
      expect(round(0)).toBe(0);
      expect(round(0, 2)).toBe(0);
    });

    it('throws for non-number first argument', () => {
      expect(() => round('3.14')).toThrow('round() requires a number as first argument');
      expect(() => round(null)).toThrow('round() requires a number as first argument');
    });

    it('throws for non-number second argument', () => {
      expect(() => round(3.14, '2')).toThrow(
        'round() requires a number as second argument if provided'
      );
    });
  });

  describe('floor', () => {
    it('floors positive numbers', () => {
      expect(floor(3.7)).toBe(3);
      expect(floor(3.2)).toBe(3);
      expect(floor(3.0)).toBe(3);
    });

    it('floors negative numbers', () => {
      expect(floor(-3.2)).toBe(-4);
      expect(floor(-3.7)).toBe(-4);
    });

    it('handles integers', () => {
      expect(floor(42)).toBe(42);
      expect(floor(-42)).toBe(-42);
    });

    it('handles zero', () => {
      expect(floor(0)).toBe(0);
    });

    it('throws for non-number', () => {
      expect(() => floor('3.14')).toThrow('floor() requires a number');
      expect(() => floor(null)).toThrow('floor() requires a number');
    });
  });

  describe('ceil', () => {
    it('ceils positive numbers', () => {
      expect(ceil(3.2)).toBe(4);
      expect(ceil(3.7)).toBe(4);
      expect(ceil(3.0)).toBe(3);
    });

    it('ceils negative numbers', () => {
      expect(ceil(-3.7)).toBe(-3);
      expect(ceil(-3.2)).toBe(-3);
    });

    it('handles integers', () => {
      expect(ceil(42)).toBe(42);
      expect(ceil(-42)).toBe(-42);
    });

    it('handles zero', () => {
      expect(ceil(0)).toBe(0);
    });

    it('throws for non-number', () => {
      expect(() => ceil('3.14')).toThrow('ceil() requires a number');
      expect(() => ceil(null)).toThrow('ceil() requires a number');
    });
  });

  describe('abs', () => {
    it('returns absolute value of positive number', () => {
      expect(abs(42)).toBe(42);
    });

    it('returns absolute value of negative number', () => {
      expect(abs(-42)).toBe(42);
    });

    it('handles zero', () => {
      expect(abs(0)).toBe(0);
    });

    it('handles decimals', () => {
      expect(abs(-3.14)).toBe(3.14);
      expect(abs(3.14)).toBe(3.14);
    });

    it('throws for non-number', () => {
      expect(() => abs('-42')).toThrow('abs() requires a number');
      expect(() => abs(null)).toThrow('abs() requires a number');
    });
  });
});
