import { describe, expect, it } from 'vitest';
import { compile, evaluate } from '../src/index';

describe('Integration Tests', () => {
  describe('realistic data transformation scenarios', () => {
    it('filters and transforms user data', () => {
      const context = {
        users: [
          { id: 1, name: 'Alice', role: 'admin', active: true },
          { id: 2, name: 'Bob', role: 'user', active: false },
          { id: 3, name: 'Carol', role: 'admin', active: true },
          { id: 4, name: 'Dave', role: 'user', active: true },
        ],
      };

      // Get names of active admins
      const result = evaluate(
        'map(filter(users, "item.active && item.role === \'admin\'"), "item.name")',
        context
      );
      expect(result).toEqual(['Alice', 'Carol']);
    });

    it('computes statistics from data', () => {
      const context = {
        orders: [
          { product: 'Widget', quantity: 5, price: 10 },
          { product: 'Gadget', quantity: 2, price: 25 },
          { product: 'Widget', quantity: 3, price: 10 },
        ],
      };

      // Calculate total value of all orders
      const result = evaluate(
        'sum(map(orders, "item.quantity * item.price"))',
        context
      );
      expect(result).toBe(5 * 10 + 2 * 25 + 3 * 10); // 130
    });

    it('builds derived objects', () => {
      const context = {
        user: { firstName: 'John', lastName: 'Doe', age: 30 },
        settings: { theme: 'dark', notifications: true },
      };

      const result = evaluate(
        '{ name: user.firstName, isAdult: user.age >= 18, ...settings }',
        context
      );
      expect(result).toEqual({
        name: 'John',
        isAdult: true,
        theme: 'dark',
        notifications: true,
      });
    });

    it('handles conditional data transformation', () => {
      const context = {
        items: [
          { type: 'number', value: 42 },
          { type: 'string', value: 'hello' },
          { type: 'number', value: 13 },
        ],
      };

      // Double numbers, leave strings as is
      const result = evaluate(
        'map(items, "item.type === \'number\' ? item.value * 2 : item.value")',
        context
      );
      expect(result).toEqual([84, 'hello', 26]);
    });

    it('merges multiple data sources', () => {
      const context = {
        base: { a: 1, b: 2 },
        override1: { b: 10, c: 3 },
        override2: { c: 30, d: 4 },
      };

      const result = evaluate('{ ...base, ...override1, ...override2 }', context);
      expect(result).toEqual({ a: 1, b: 10, c: 30, d: 4 });
    });

    it('extracts nested data safely', () => {
      const context = {
        response: {
          data: {
            user: {
              profile: {
                email: 'test@example.com',
              },
            },
          },
        },
      };

      const result = evaluate('response.data.user.profile.email', context);
      expect(result).toBe('test@example.com');

      // Safe access when data is missing
      const missingContext = { response: { data: null } };
      const missingResult = evaluate('response.data.user.profile.email', missingContext);
      expect(missingResult).toBe(undefined);
    });

    it('validates data with every/some', () => {
      const context = {
        products: [
          { name: 'A', price: 10, inStock: true },
          { name: 'B', price: 20, inStock: true },
          { name: 'C', price: 30, inStock: true },
        ],
      };

      expect(evaluate('every(products, "item.inStock")', context)).toBe(true);
      expect(evaluate('some(products, "item.price > 25")', context)).toBe(true);
      expect(evaluate('every(products, "item.price < 25")', context)).toBe(false);
    });

    it('combines filtering with index access', () => {
      const context = {
        items: ['apple', 'banana', 'cherry', 'date', 'elderberry'],
      };

      // Get every other item starting from first
      const result = evaluate('filter(items, "index % 2 === 0")', context);
      expect(result).toEqual(['apple', 'cherry', 'elderberry']);
    });
  });

  describe('compiled expression reuse', () => {
    it('handles changing array contents', () => {
      const expr = compile('sum(map(items, "item * 2"))');

      expect(expr.evaluate({ items: [1, 2, 3] })).toBe(12);
      expect(expr.evaluate({ items: [10, 20] })).toBe(60);
      expect(expr.evaluate({ items: [] })).toBe(0);
    });

    it('handles changing object structure', () => {
      const expr = compile('user.name || "Anonymous"');

      expect(expr.evaluate({ user: { name: 'Alice' } })).toBe('Alice');
      expect(expr.evaluate({ user: {} })).toBe('Anonymous');
      expect(expr.evaluate({})).toBe('Anonymous');
    });
  });

  describe('complex nested expressions', () => {
    it('handles deeply nested ternary', () => {
      const context = { score: 85 };

      const result = evaluate(
        'score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : "F"',
        context
      );
      expect(result).toBe('B');
    });

    it('handles nested function calls', () => {
      const context = {
        data: [
          [1, 2, 3],
          [4, 5],
          [6, 7, 8, 9],
        ],
      };

      // Sum of lengths of all inner arrays
      const result = evaluate('sum(map(data, "length(item)"))', context);
      expect(result).toBe(9);
    });

    it('handles complex boolean logic', () => {
      const context = {
        user: { role: 'admin', verified: true, banned: false },
        features: { premium: true },
      };

      const result = evaluate(
        '(user.role === "admin" || features.premium) && user.verified && !user.banned',
        context
      );
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty arrays in all iterator functions', () => {
      const context = { items: [] };

      expect(evaluate('map(items, "item")', context)).toEqual([]);
      expect(evaluate('filter(items, "item")', context)).toEqual([]);
      expect(evaluate('find(items, "item")', context)).toBe(undefined);
      expect(evaluate('every(items, "item")', context)).toBe(true); // vacuously true
      expect(evaluate('some(items, "item")', context)).toBe(false);
    });

    it('handles null values in data', () => {
      const context = {
        items: [{ value: 1 }, null, { value: 3 }],
      };

      // Filter out nulls first, then map
      const result = evaluate('map(filter(items, "item !== null"), "item.value")', context);
      expect(result).toEqual([1, 3]);
    });

    it('handles zero and empty string', () => {
      const context = { num: 0, str: '' };

      expect(evaluate('num || 10', context)).toBe(10); // 0 is falsy
      expect(evaluate('str || "default"', context)).toBe('default'); // '' is falsy
      expect(evaluate('num === 0', context)).toBe(true);
      expect(evaluate('str === ""', context)).toBe(true);
    });
  });

  describe('string operations in real scenarios', () => {
    it('formats user display names', () => {
      const context = {
        user: { firstName: 'john', lastName: 'DOE' },
      };

      const firstName = evaluate("upper(substring(user.firstName, 0, 1))", context);
      const restFirst = evaluate("lower(substring(user.firstName, 1))", context);
      const lastName = evaluate("upper(user.lastName)", context);

      expect(firstName).toBe('J');
      expect(restFirst).toBe('ohn');
      expect(lastName).toBe('DOE');
    });

    it('parses and transforms CSV-like data', () => {
      const context = {
        csv: 'apple,banana,cherry',
      };

      const result = evaluate("map(split(csv, ','), \"upper(item)\")", context);
      expect(result).toEqual(['APPLE', 'BANANA', 'CHERRY']);
    });
  });
});
