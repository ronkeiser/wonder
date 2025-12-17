import { describe, expect, it } from 'vitest';
import {
  compile,
  evaluate,
  ExpressionReferenceError,
  ExpressionSyntaxError,
  ExpressionTypeError,
} from '../src/index';

describe('Public API', () => {
  describe('evaluate', () => {
    describe('basic evaluation', () => {
      it('evaluates literals', () => {
        expect(evaluate('42')).toBe(42);
        expect(evaluate("'hello'")).toBe('hello');
        expect(evaluate('true')).toBe(true);
        expect(evaluate('null')).toBe(null);
      });

      it('evaluates identifiers from context', () => {
        expect(evaluate('name', { name: 'Alice' })).toBe('Alice');
        expect(evaluate('count', { count: 42 })).toBe(42);
      });

      it('evaluates member expressions', () => {
        expect(evaluate('user.name', { user: { name: 'Alice' } })).toBe('Alice');
        expect(evaluate('items[0]', { items: [1, 2, 3] })).toBe(1);
      });

      it('evaluates binary expressions', () => {
        expect(evaluate('a + b', { a: 1, b: 2 })).toBe(3);
        expect(evaluate('a > b', { a: 5, b: 3 })).toBe(true);
      });

      it('evaluates ternary expressions', () => {
        expect(evaluate('a ? b : c', { a: true, b: 'yes', c: 'no' })).toBe('yes');
        expect(evaluate('a ? b : c', { a: false, b: 'yes', c: 'no' })).toBe('no');
      });

      it('evaluates with empty context', () => {
        expect(evaluate('42')).toBe(42);
        expect(evaluate('missing')).toBe(undefined);
      });
    });

    describe('built-in functions', () => {
      it('calls array functions', () => {
        expect(evaluate('length(items)', { items: [1, 2, 3] })).toBe(3);
        expect(evaluate('first(items)', { items: [1, 2, 3] })).toBe(1);
        expect(evaluate('last(items)', { items: [1, 2, 3] })).toBe(3);
      });

      it('calls object functions', () => {
        expect(evaluate('keys(obj)', { obj: { a: 1, b: 2 } })).toEqual(['a', 'b']);
        expect(evaluate("get(obj, 'a.b')", { obj: { a: { b: 42 } } })).toBe(42);
      });

      it('calls math functions', () => {
        expect(evaluate('sum(nums)', { nums: [1, 2, 3] })).toBe(6);
        expect(evaluate('round(3.7)')).toBe(4);
      });

      it('calls string functions', () => {
        expect(evaluate("upper('hello')")).toBe('HELLO');
        expect(evaluate("split('a,b,c', ',')")).toEqual(['a', 'b', 'c']);
      });

      it('calls type functions', () => {
        expect(evaluate('isArray(val)', { val: [1, 2] })).toBe(true);
        expect(evaluate('type(val)', { val: 'hello' })).toBe('string');
      });

      it('calls iterator functions', () => {
        expect(evaluate('map(items, "item * 2")', { items: [1, 2, 3] })).toEqual([2, 4, 6]);
        expect(evaluate('filter(items, "item > 2")', { items: [1, 2, 3, 4] })).toEqual([3, 4]);
        expect(evaluate('find(items, "item > 2")', { items: [1, 2, 3, 4] })).toBe(3);
      });
    });

    describe('custom functions', () => {
      it('uses custom functions', () => {
        const result = evaluate('double(5)', {}, {
          functions: {
            double: (x: unknown) => (x as number) * 2,
          },
        });
        expect(result).toBe(10);
      });

      it('custom functions override builtins', () => {
        const result = evaluate('length(items)', { items: [1, 2, 3] }, {
          functions: {
            length: () => 999,
          },
        });
        expect(result).toBe(999);
      });
    });

    describe('error handling', () => {
      it('throws ExpressionSyntaxError for invalid syntax', () => {
        expect(() => evaluate('a +')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('a +')).toThrow(/Unexpected token/);
      });

      it('throws ExpressionSyntaxError for unterminated string', () => {
        expect(() => evaluate("'hello")).toThrow(ExpressionSyntaxError);
        expect(() => evaluate("'hello")).toThrow(/Unterminated string/);
      });

      it('throws ExpressionReferenceError for unknown function', () => {
        expect(() => evaluate('unknown()')).toThrow(ExpressionReferenceError);
        expect(() => evaluate('unknown()')).toThrow(/Unknown function: unknown/);
      });

      it('throws ExpressionTypeError for type errors', () => {
        expect(() => evaluate('length(42)')).toThrow(ExpressionTypeError);
        expect(() => evaluate('length(42)')).toThrow(/requires an array/);
      });

      it('error includes expression', () => {
        try {
          evaluate('a +');
        } catch (error) {
          expect(error).toBeInstanceOf(ExpressionSyntaxError);
          expect((error as ExpressionSyntaxError).expression).toBe('a +');
        }
      });
    });

    describe('complex expressions', () => {
      it('evaluates nested function calls', () => {
        expect(evaluate('sum(map(items, "item * 2"))', { items: [1, 2, 3] })).toBe(12);
      });

      it('evaluates object construction', () => {
        expect(evaluate('{ name: user.name, count: length(items) }', {
          user: { name: 'Alice' },
          items: [1, 2, 3],
        })).toEqual({ name: 'Alice', count: 3 });
      });

      it('evaluates array with spread', () => {
        expect(evaluate('[...a, ...b]', { a: [1, 2], b: [3, 4] })).toEqual([1, 2, 3, 4]);
      });

      it('evaluates realistic data transformation', () => {
        const context = {
          users: [
            { name: 'Alice', active: true, score: 85 },
            { name: 'Bob', active: false, score: 92 },
            { name: 'Carol', active: true, score: 78 },
          ],
        };

        // Get names of active users with score > 80
        const result = evaluate(
          'map(filter(users, "item.active && item.score > 80"), "item.name")',
          context
        );
        expect(result).toEqual(['Alice']);
      });
    });
  });

  describe('compile', () => {
    describe('basic compilation', () => {
      it('compiles and evaluates expression', () => {
        const expr = compile('a + b');
        expect(expr.evaluate({ a: 1, b: 2 })).toBe(3);
      });

      it('can be evaluated multiple times', () => {
        const expr = compile('user.name');
        expect(expr.evaluate({ user: { name: 'Alice' } })).toBe('Alice');
        expect(expr.evaluate({ user: { name: 'Bob' } })).toBe('Bob');
        expect(expr.evaluate({ user: { name: 'Carol' } })).toBe('Carol');
      });

      it('preserves expression string', () => {
        const expr = compile('a + b');
        expect(expr.expression).toBe('a + b');
      });

      it('isolates context between evaluations', () => {
        const expr = compile('value');
        expect(expr.evaluate({ value: 1 })).toBe(1);
        expect(expr.evaluate({ value: 2 })).toBe(2);
        expect(expr.evaluate({})).toBe(undefined);
      });
    });

    describe('with functions', () => {
      it('uses built-in functions', () => {
        const expr = compile('length(items)');
        expect(expr.evaluate({ items: [1, 2, 3] })).toBe(3);
        expect(expr.evaluate({ items: [] })).toBe(0);
      });

      it('uses iterator functions', () => {
        const expr = compile('map(items, "item * 2")');
        expect(expr.evaluate({ items: [1, 2, 3] })).toEqual([2, 4, 6]);
        expect(expr.evaluate({ items: [10, 20] })).toEqual([20, 40]);
      });

      it('uses custom functions', () => {
        const expr = compile('triple(x)', {
          functions: {
            triple: (x: unknown) => (x as number) * 3,
          },
        });
        expect(expr.evaluate({ x: 5 })).toBe(15);
      });
    });

    describe('error handling', () => {
      it('throws ExpressionSyntaxError at compile time for invalid syntax', () => {
        expect(() => compile('a +')).toThrow(ExpressionSyntaxError);
      });

      it('throws ExpressionReferenceError at evaluate time for unknown function', () => {
        const expr = compile('unknown()');
        expect(() => expr.evaluate({})).toThrow(ExpressionReferenceError);
      });

      it('throws ExpressionTypeError at evaluate time for type errors', () => {
        const expr = compile('length(val)');
        expect(() => expr.evaluate({ val: 'not array' })).toThrow(ExpressionTypeError);
      });
    });

    describe('performance benefit', () => {
      it('parses expression only once', () => {
        const expr = compile('a + b + c');

        // Multiple evaluations use the same AST
        for (let i = 0; i < 100; i++) {
          expr.evaluate({ a: i, b: i * 2, c: i * 3 });
        }

        // If this completes without error, parsing happened once
        expect(expr.expression).toBe('a + b + c');
      });
    });

    describe('iterator functions with compile', () => {
      it('uses iterator functions with different contexts', () => {
        const expr = compile('map(items, "item * 2")');
        expect(expr.evaluate({ items: [1, 2, 3] })).toEqual([2, 4, 6]);
        expect(expr.evaluate({ items: [10, 20] })).toEqual([20, 40]);
        expect(expr.evaluate({ items: [] })).toEqual([]);
      });

      it('filter works with compiled expression', () => {
        const expr = compile('filter(items, "item > 2")');
        expect(expr.evaluate({ items: [1, 2, 3, 4, 5] })).toEqual([3, 4, 5]);
        expect(expr.evaluate({ items: [1, 2] })).toEqual([]);
      });
    });
  });

  describe('error types', () => {
    it('ExpressionSyntaxError has correct properties', () => {
      try {
        evaluate('a +');
      } catch (error) {
        expect(error).toBeInstanceOf(ExpressionSyntaxError);
        const e = error as ExpressionSyntaxError;
        expect(e.name).toBe('ExpressionSyntaxError');
        expect(e.expression).toBe('a +');
        expect(e.message).toContain('Unexpected token');
      }
    });

    it('ExpressionReferenceError has correct properties', () => {
      try {
        evaluate('foo()');
      } catch (error) {
        expect(error).toBeInstanceOf(ExpressionReferenceError);
        const e = error as ExpressionReferenceError;
        expect(e.name).toBe('ExpressionReferenceError');
        expect(e.expression).toBe('foo()');
        expect(e.message).toContain('Unknown function');
      }
    });

    it('ExpressionTypeError has correct properties', () => {
      try {
        evaluate('length(42)');
      } catch (error) {
        expect(error).toBeInstanceOf(ExpressionTypeError);
        const e = error as ExpressionTypeError;
        expect(e.name).toBe('ExpressionTypeError');
        expect(e.expression).toBe('length(42)');
        expect(e.message).toContain('requires');
      }
    });
  });
});
