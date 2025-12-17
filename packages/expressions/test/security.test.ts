import { describe, expect, it } from 'vitest';
import {
  compile,
  DEFAULT_LIMITS,
  evaluate,
  ExpressionRangeError,
  ExpressionSyntaxError,
} from '../src/index';

describe('Security', () => {
  describe('forbidden syntax', () => {
    describe('function definitions', () => {
      it('rejects function keyword', () => {
        expect(() => evaluate('function foo() {}')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('function foo() {}')).toThrow(/Function definitions are not allowed/);
      });

      it('rejects arrow functions', () => {
        expect(() => evaluate('x => x')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x => x')).toThrow(/Arrow functions are not allowed/);
      });
    });

    describe('assignment', () => {
      it('rejects simple assignment', () => {
        expect(() => evaluate('x = 1')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x = 1')).toThrow(/Assignment is not allowed/);
      });

      it('rejects compound assignment +=', () => {
        expect(() => evaluate('x += 1')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x += 1')).toThrow(/Assignment is not allowed/);
      });

      it('rejects compound assignment -=', () => {
        expect(() => evaluate('x -= 1')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x -= 1')).toThrow(/Assignment is not allowed/);
      });

      it('rejects compound assignment *=', () => {
        expect(() => evaluate('x *= 2')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x *= 2')).toThrow(/Assignment is not allowed/);
      });

      it('rejects compound assignment /=', () => {
        expect(() => evaluate('x /= 2')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x /= 2')).toThrow(/Assignment is not allowed/);
      });

      it('rejects compound assignment %=', () => {
        expect(() => evaluate('x %= 2')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x %= 2')).toThrow(/Assignment is not allowed/);
      });
    });

    describe('increment/decrement', () => {
      it('rejects increment operator', () => {
        expect(() => evaluate('x++')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x++')).toThrow(/Increment operator/);
      });

      it('rejects decrement operator', () => {
        expect(() => evaluate('x--')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('x--')).toThrow(/Decrement operator/);
      });
    });

    describe('loops', () => {
      it('rejects for keyword', () => {
        expect(() => evaluate('for')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('for')).toThrow(/Loops are not allowed/);
      });

      it('rejects while keyword', () => {
        expect(() => evaluate('while')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('while')).toThrow(/Loops are not allowed/);
      });

      it('rejects do keyword', () => {
        expect(() => evaluate('do')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('do')).toThrow(/Loops are not allowed/);
      });
    });

    describe('forbidden keywords', () => {
      it('rejects this keyword', () => {
        expect(() => evaluate('this')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('this')).toThrow(/The 'this' keyword is not allowed/);
      });

      it('rejects new keyword', () => {
        expect(() => evaluate('new')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('new')).toThrow(/The 'new' keyword is not allowed/);
      });

      it('rejects var keyword', () => {
        expect(() => evaluate('var')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('var')).toThrow(/Variable declarations are not allowed/);
      });

      it('rejects let keyword', () => {
        expect(() => evaluate('let')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('let')).toThrow(/Variable declarations are not allowed/);
      });

      it('rejects const keyword', () => {
        expect(() => evaluate('const')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('const')).toThrow(/Variable declarations are not allowed/);
      });

      it('rejects class keyword', () => {
        expect(() => evaluate('class')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('class')).toThrow(/Class definitions are not allowed/);
      });

      it('rejects async keyword', () => {
        expect(() => evaluate('async')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('async')).toThrow(/Async\/await is not allowed/);
      });

      it('rejects await keyword', () => {
        expect(() => evaluate('await')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('await')).toThrow(/Async\/await is not allowed/);
      });

      it('rejects yield keyword', () => {
        expect(() => evaluate('yield')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('yield')).toThrow(/Generators are not allowed/);
      });

      it('rejects import keyword', () => {
        expect(() => evaluate('import')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('import')).toThrow(/Import\/export is not allowed/);
      });

      it('rejects export keyword', () => {
        expect(() => evaluate('export')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('export')).toThrow(/Import\/export is not allowed/);
      });

      it('rejects delete keyword', () => {
        expect(() => evaluate('delete')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('delete')).toThrow(/The 'delete' keyword is not allowed/);
      });

      it('rejects typeof keyword', () => {
        expect(() => evaluate('typeof x')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('typeof x')).toThrow(/The 'typeof' keyword is not allowed/);
      });

      it('rejects instanceof keyword', () => {
        expect(() => evaluate('instanceof')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('instanceof')).toThrow(/The 'instanceof' keyword is not allowed/);
      });

      it('rejects void keyword', () => {
        expect(() => evaluate('void')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('void')).toThrow(/The 'void' keyword is not allowed/);
      });

      it('rejects in keyword', () => {
        expect(() => evaluate('in')).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('in')).toThrow(/The 'in' keyword is not allowed/);
      });
    });

    describe('method calls', () => {
      it('rejects method calls on objects', () => {
        expect(() => evaluate('obj.method()', { obj: {} })).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('obj.method()', { obj: {} })).toThrow(/Method calls are not allowed/);
      });

      it('rejects chained method calls', () => {
        expect(() => evaluate('a.b.method()', { a: { b: {} } })).toThrow(ExpressionSyntaxError);
        expect(() => evaluate('a.b.method()', { a: { b: {} } })).toThrow(/Method calls are not allowed/);
      });

      it('allows built-in function calls', () => {
        expect(evaluate('length(items)', { items: [1, 2, 3] })).toBe(3);
      });
    });

    describe('prototype pollution', () => {
      it('blocks __proto__ access via dot notation', () => {
        expect(evaluate('obj.__proto__', { obj: {} })).toBe(undefined);
      });

      it('blocks __proto__ access via bracket notation', () => {
        expect(evaluate("obj['__proto__']", { obj: {} })).toBe(undefined);
      });

      it('blocks constructor access', () => {
        expect(evaluate('obj.constructor', { obj: {} })).toBe(undefined);
      });

      it('blocks __defineGetter__', () => {
        expect(evaluate('obj.__defineGetter__', { obj: {} })).toBe(undefined);
      });

      it('blocks __defineSetter__', () => {
        expect(evaluate('obj.__defineSetter__', { obj: {} })).toBe(undefined);
      });

      it('blocks __lookupGetter__', () => {
        expect(evaluate('obj.__lookupGetter__', { obj: {} })).toBe(undefined);
      });

      it('blocks __lookupSetter__', () => {
        expect(evaluate('obj.__lookupSetter__', { obj: {} })).toBe(undefined);
      });

      it('does not access inherited properties', () => {
        const proto = { inherited: 'should not see' };
        const obj = Object.create(proto);
        obj.own = 'visible';
        expect(evaluate('obj.own', { obj })).toBe('visible');
        expect(evaluate('obj.inherited', { obj })).toBe(undefined);
      });

      it('blocks hasOwnProperty access', () => {
        expect(evaluate('obj.hasOwnProperty', { obj: {} })).toBe(undefined);
      });

      it('blocks toString method', () => {
        expect(evaluate('obj.toString', { obj: {} })).toBe(undefined);
      });

      it('blocks valueOf method', () => {
        expect(evaluate('obj.valueOf', { obj: {} })).toBe(undefined);
      });

      it('blocks nested prototype pollution attempts', () => {
        const obj = { nested: {} };
        expect(evaluate('obj.nested.__proto__', { obj })).toBe(undefined);
        expect(evaluate('obj.nested.constructor', { obj })).toBe(undefined);
      });

      it('blocks prototype via computed dynamic key', () => {
        const key = '__proto__';
        expect(evaluate('obj[key]', { obj: {}, key })).toBe(undefined);
      });
    });
  });

  describe('runtime limits', () => {
    describe('expression length', () => {
      it('enforces default expression length limit', () => {
        const longExpr = 'a'.repeat(DEFAULT_LIMITS.maxExpressionLength + 1);
        expect(() => evaluate(longExpr)).toThrow(ExpressionRangeError);
        expect(() => evaluate(longExpr)).toThrow(/exceeds maximum length/);
      });

      it('allows expression at limit', () => {
        // Create valid expression that's at the limit
        const padding = 'a + ';
        const repeatCount = Math.floor((DEFAULT_LIMITS.maxExpressionLength - 1) / padding.length);
        const expr = padding.repeat(repeatCount) + 'a';
        // This should not throw (if under limit)
        if (expr.length <= DEFAULT_LIMITS.maxExpressionLength) {
          expect(() => evaluate(expr, { a: 1 })).not.toThrow(ExpressionRangeError);
        }
      });

      it('allows custom expression length limit', () => {
        expect(() => evaluate('aaaa', { aaaa: 1 }, { limits: { maxExpressionLength: 3 } }))
          .toThrow(ExpressionRangeError);
      });

      it('applies to compile as well', () => {
        const longExpr = 'a'.repeat(DEFAULT_LIMITS.maxExpressionLength + 1);
        expect(() => compile(longExpr)).toThrow(ExpressionRangeError);
      });
    });

    describe('string literal length', () => {
      it('enforces string literal length limit', () => {
        // Use a smaller custom limit to avoid hitting expression length limit first
        const longString = `'${'a'.repeat(100)}'`;
        expect(() => evaluate(longString, {}, { limits: { maxStringLength: 50 } }))
          .toThrow(ExpressionRangeError);
        expect(() => evaluate(longString, {}, { limits: { maxStringLength: 50 } }))
          .toThrow(/String literal exceeds maximum length/);
      });

      it('allows string at limit', () => {
        const str = `'${'a'.repeat(100)}'`;
        expect(evaluate(str)).toBe('a'.repeat(100));
      });

      it('allows custom string length limit', () => {
        expect(() => evaluate("'aaaa'", {}, { limits: { maxStringLength: 3 } }))
          .toThrow(ExpressionRangeError);
      });
    });

    describe('array literal size', () => {
      it('enforces array literal size limit', () => {
        // Create array literal with too many elements
        const elements = Array(DEFAULT_LIMITS.maxLiteralSize + 1).fill('1').join(', ');
        const expr = `[${elements}]`;
        expect(() => evaluate(expr)).toThrow(ExpressionRangeError);
        expect(() => evaluate(expr)).toThrow(/Array literal exceeds maximum size/);
      });

      it('allows custom array size limit', () => {
        expect(() => evaluate('[1, 2, 3, 4]', {}, { limits: { maxLiteralSize: 3 } }))
          .toThrow(ExpressionRangeError);
      });
    });

    describe('object literal size', () => {
      it('enforces object literal size limit', () => {
        // Create object literal with too many properties
        const props = Array(DEFAULT_LIMITS.maxLiteralSize + 1)
          .fill(0)
          .map((_, i) => `a${i}: 1`)
          .join(', ');
        const expr = `{ ${props} }`;
        expect(() => evaluate(expr)).toThrow(ExpressionRangeError);
        expect(() => evaluate(expr)).toThrow(/Object literal exceeds maximum size/);
      });

      it('allows custom object size limit', () => {
        expect(() => evaluate('{ a: 1, b: 2, c: 3, d: 4 }', {}, { limits: { maxLiteralSize: 3 } }))
          .toThrow(ExpressionRangeError);
      });
    });

    describe('nested validation', () => {
      it('validates nested arrays', () => {
        expect(() => evaluate('[[[[1]]]]', {}, { limits: { maxLiteralSize: 1 } }))
          .not.toThrow(); // Each array has 1 element
      });

      it('validates nested objects', () => {
        expect(() => evaluate('{ a: { b: 1 } }', {}, { limits: { maxLiteralSize: 1 } }))
          .not.toThrow(); // Each object has 1 property
      });

      it('validates strings in nested structures', () => {
        expect(() => evaluate("{ a: 'aaaa' }", {}, { limits: { maxStringLength: 3 } }))
          .toThrow(ExpressionRangeError);
      });
    });

    describe('limit customization', () => {
      it('allows disabling limits with Infinity', () => {
        const longExpr = 'a'.repeat(50000);
        expect(() => evaluate(longExpr, { [longExpr]: 1 }, { limits: { maxExpressionLength: Infinity } }))
          .not.toThrow(ExpressionRangeError);
      });

      it('merges custom limits with defaults', () => {
        // Only override one limit
        const result = evaluate('[1, 2, 3]', {}, { limits: { maxExpressionLength: 50 } });
        expect(result).toEqual([1, 2, 3]);
      });
    });
  });

  describe('error properties', () => {
    it('ExpressionRangeError includes expression', () => {
      const longExpr = 'a'.repeat(DEFAULT_LIMITS.maxExpressionLength + 1);
      try {
        evaluate(longExpr);
      } catch (error) {
        expect(error).toBeInstanceOf(ExpressionRangeError);
        const e = error as ExpressionRangeError;
        expect(e.expression).toBe(longExpr);
      }
    });

    it('ExpressionSyntaxError includes position for forbidden syntax', () => {
      try {
        evaluate('a = 1');
      } catch (error) {
        expect(error).toBeInstanceOf(ExpressionSyntaxError);
        const e = error as ExpressionSyntaxError;
        expect(e.position).not.toBeNull();
      }
    });
  });
});
