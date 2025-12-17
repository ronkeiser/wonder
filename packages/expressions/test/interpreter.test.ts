import { describe, expect, it } from 'vitest';
import { Interpreter } from '../src/interpreter';
import { Parser } from '../src/parser';

describe('Interpreter', () => {
  const parser = new Parser();

  function evaluate(input: string, context: Record<string, unknown> = {}, functions = {}): unknown {
    const ast = parser.parse(input);
    const interpreter = new Interpreter(functions);
    return interpreter.evaluate(ast, context);
  }

  describe('literals', () => {
    it('evaluates string literals', () => {
      expect(evaluate("'hello'")).toBe('hello');
    });

    it('evaluates number literals', () => {
      expect(evaluate('42')).toBe(42);
      expect(evaluate('3.14')).toBe(3.14);
    });

    it('evaluates boolean literals', () => {
      expect(evaluate('true')).toBe(true);
      expect(evaluate('false')).toBe(false);
    });

    it('evaluates null', () => {
      expect(evaluate('null')).toBe(null);
    });
  });

  describe('identifiers', () => {
    it('resolves identifiers from context', () => {
      expect(evaluate('foo', { foo: 'bar' })).toBe('bar');
    });

    it('returns undefined for missing identifiers', () => {
      expect(evaluate('missing', {})).toBe(undefined);
    });

    it('resolves nested values', () => {
      expect(evaluate('user', { user: { name: 'Alice' } })).toEqual({ name: 'Alice' });
    });
  });

  describe('member expressions', () => {
    it('evaluates dot notation', () => {
      expect(evaluate('user.name', { user: { name: 'Alice' } })).toBe('Alice');
    });

    it('evaluates bracket notation with number', () => {
      expect(evaluate('items[0]', { items: ['a', 'b', 'c'] })).toBe('a');
    });

    it('evaluates bracket notation with string', () => {
      expect(evaluate("obj['key']", { obj: { key: 'value' } })).toBe('value');
    });

    it('evaluates chained access', () => {
      expect(evaluate('a.b.c', { a: { b: { c: 42 } } })).toBe(42);
    });

    it('returns undefined for missing properties', () => {
      expect(evaluate('obj.missing', { obj: {} })).toBe(undefined);
    });

    it('returns undefined for access on null', () => {
      expect(evaluate('obj.prop', { obj: null })).toBe(undefined);
    });

    it('returns undefined for access on undefined', () => {
      expect(evaluate('missing.prop', {})).toBe(undefined);
    });

    it('evaluates array length', () => {
      expect(evaluate('items.length', { items: [1, 2, 3] })).toBe(3);
    });

    it('evaluates string length', () => {
      expect(evaluate('str.length', { str: 'hello' })).toBe(5);
    });

    it('evaluates computed access with variable key', () => {
      expect(evaluate('obj[key]', { obj: { a: 1, b: 2 }, key: 'b' })).toBe(2);
    });

    it('returns undefined for computed access with non-string/non-number key', () => {
      expect(evaluate('obj[key]', { obj: { a: 1 }, key: null })).toBe(undefined);
      expect(evaluate('obj[key]', { obj: { a: 1 }, key: true })).toBe(undefined);
    });

    it('evaluates computed access with negative array index', () => {
      // JavaScript arrays don't natively support negative indexing, returns undefined
      expect(evaluate('arr[-1]', { arr: [1, 2, 3] })).toBe(undefined);
    });
  });

  describe('binary expressions', () => {
    describe('arithmetic', () => {
      it('evaluates addition', () => {
        expect(evaluate('a + b', { a: 1, b: 2 })).toBe(3);
      });

      it('evaluates subtraction', () => {
        expect(evaluate('a - b', { a: 5, b: 3 })).toBe(2);
      });

      it('evaluates multiplication', () => {
        expect(evaluate('a * b', { a: 3, b: 4 })).toBe(12);
      });

      it('evaluates division', () => {
        expect(evaluate('a / b', { a: 10, b: 2 })).toBe(5);
      });

      it('evaluates modulo', () => {
        expect(evaluate('a % b', { a: 7, b: 3 })).toBe(1);
      });

      it('handles division by zero', () => {
        expect(evaluate('a / b', { a: 1, b: 0 })).toBe(Infinity);
      });
    });

    describe('string concatenation', () => {
      it('concatenates strings', () => {
        expect(evaluate("a + ' ' + b", { a: 'hello', b: 'world' })).toBe('hello world');
      });

      it('concatenates string and number', () => {
        expect(evaluate("'count: ' + n", { n: 42 })).toBe('count: 42');
      });
    });

    describe('comparison', () => {
      it('evaluates ===', () => {
        expect(evaluate('a === b', { a: 1, b: 1 })).toBe(true);
        expect(evaluate('a === b', { a: 1, b: 2 })).toBe(false);
        expect(evaluate('a === b', { a: '1', b: 1 })).toBe(false);
      });

      it('evaluates !==', () => {
        expect(evaluate('a !== b', { a: 1, b: 2 })).toBe(true);
        expect(evaluate('a !== b', { a: 1, b: 1 })).toBe(false);
      });

      it('evaluates >', () => {
        expect(evaluate('a > b', { a: 2, b: 1 })).toBe(true);
        expect(evaluate('a > b', { a: 1, b: 1 })).toBe(false);
      });

      it('evaluates >=', () => {
        expect(evaluate('a >= b', { a: 1, b: 1 })).toBe(true);
        expect(evaluate('a >= b', { a: 0, b: 1 })).toBe(false);
      });

      it('evaluates <', () => {
        expect(evaluate('a < b', { a: 1, b: 2 })).toBe(true);
        expect(evaluate('a < b', { a: 2, b: 1 })).toBe(false);
      });

      it('evaluates <=', () => {
        expect(evaluate('a <= b', { a: 1, b: 1 })).toBe(true);
        expect(evaluate('a <= b', { a: 2, b: 1 })).toBe(false);
      });
    });
  });

  describe('logical expressions', () => {
    it('evaluates &&', () => {
      expect(evaluate('a && b', { a: true, b: true })).toBe(true);
      expect(evaluate('a && b', { a: true, b: false })).toBe(false);
      expect(evaluate('a && b', { a: false, b: true })).toBe(false);
    });

    it('evaluates ||', () => {
      expect(evaluate('a || b', { a: true, b: false })).toBe(true);
      expect(evaluate('a || b', { a: false, b: true })).toBe(true);
      expect(evaluate('a || b', { a: false, b: false })).toBe(false);
    });

    it('short-circuits && on falsy left', () => {
      // If short-circuit works, b() should not be called
      let called = false;
      const functions = {
        b: () => {
          called = true;
          return true;
        },
      };
      evaluate('a && b()', { a: false }, functions);
      expect(called).toBe(false);
    });

    it('short-circuits || on truthy left', () => {
      let called = false;
      const functions = {
        b: () => {
          called = true;
          return false;
        },
      };
      evaluate('a || b()', { a: true }, functions);
      expect(called).toBe(false);
    });

    it('returns actual values, not just booleans', () => {
      expect(evaluate('a || b', { a: 0, b: 'default' })).toBe('default');
      expect(evaluate('a && b', { a: 'truthy', b: 'result' })).toBe('result');
    });
  });

  describe('unary expressions', () => {
    it('evaluates !', () => {
      expect(evaluate('!a', { a: true })).toBe(false);
      expect(evaluate('!a', { a: false })).toBe(true);
      expect(evaluate('!a', { a: 0 })).toBe(true);
      expect(evaluate('!a', { a: 'truthy' })).toBe(false);
    });

    it('evaluates double negation', () => {
      expect(evaluate('!!a', { a: 'truthy' })).toBe(true);
      expect(evaluate('!!a', { a: 0 })).toBe(false);
    });

    it('evaluates unary -', () => {
      expect(evaluate('-a', { a: 5 })).toBe(-5);
      expect(evaluate('-a', { a: -3 })).toBe(3);
    });

    it('evaluates negative literals', () => {
      expect(evaluate('-42')).toBe(-42);
    });
  });

  describe('conditional expressions', () => {
    it('evaluates ternary with truthy condition', () => {
      expect(evaluate('a ? b : c', { a: true, b: 'yes', c: 'no' })).toBe('yes');
    });

    it('evaluates ternary with falsy condition', () => {
      expect(evaluate('a ? b : c', { a: false, b: 'yes', c: 'no' })).toBe('no');
    });

    it('only evaluates taken branch', () => {
      let consequentCalled = false;
      let alternateCalled = false;
      const functions = {
        consequent: () => {
          consequentCalled = true;
          return 'yes';
        },
        alternate: () => {
          alternateCalled = true;
          return 'no';
        },
      };

      evaluate('a ? consequent() : alternate()', { a: true }, functions);
      expect(consequentCalled).toBe(true);
      expect(alternateCalled).toBe(false);
    });
  });

  describe('array expressions', () => {
    it('evaluates empty array', () => {
      expect(evaluate('[]')).toEqual([]);
    });

    it('evaluates array with elements', () => {
      expect(evaluate('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    it('evaluates array with expressions', () => {
      expect(evaluate('[a, b]', { a: 1, b: 2 })).toEqual([1, 2]);
    });

    it('evaluates array with spread', () => {
      expect(evaluate('[...arr]', { arr: [1, 2, 3] })).toEqual([1, 2, 3]);
    });

    it('evaluates array concatenation with spread', () => {
      expect(evaluate('[...a, ...b]', { a: [1, 2], b: [3, 4] })).toEqual([1, 2, 3, 4]);
    });

    it('evaluates mixed elements and spread', () => {
      expect(evaluate('[0, ...arr, 4]', { arr: [1, 2, 3] })).toEqual([0, 1, 2, 3, 4]);
    });

    it('throws on spread of non-array', () => {
      expect(() => evaluate('[...obj]', { obj: {} })).toThrow(/must be an array/);
    });
  });

  describe('object expressions', () => {
    it('evaluates empty object', () => {
      expect(evaluate('{}')).toEqual({});
    });

    it('evaluates object with properties', () => {
      expect(evaluate('{ a: 1, b: 2 }')).toEqual({ a: 1, b: 2 });
    });

    it('evaluates object with expression values', () => {
      expect(evaluate('{ x: a + b }', { a: 1, b: 2 })).toEqual({ x: 3 });
    });

    it('evaluates object with shorthand', () => {
      expect(evaluate('{ a, b }', { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it('evaluates object with spread', () => {
      expect(evaluate('{ ...obj }', { obj: { a: 1, b: 2 } })).toEqual({ a: 1, b: 2 });
    });

    it('evaluates object merge with spread', () => {
      expect(evaluate('{ ...a, ...b }', { a: { x: 1 }, b: { y: 2 } })).toEqual({ x: 1, y: 2 });
    });

    it('later properties override earlier', () => {
      expect(evaluate('{ ...a, x: 99 }', { a: { x: 1, y: 2 } })).toEqual({ x: 99, y: 2 });
    });

    it('throws on spread of non-object', () => {
      expect(() => evaluate('{ ...arr }', { arr: [1, 2] })).toThrow(/must be an object/);
    });
  });

  describe('call expressions', () => {
    it('calls registered functions', () => {
      const functions = {
        double: (x: unknown) => (x as number) * 2,
      };
      expect(evaluate('double(5)', {}, functions)).toBe(10);
    });

    it('passes multiple arguments', () => {
      const functions = {
        add: (a: unknown, b: unknown) => (a as number) + (b as number),
      };
      expect(evaluate('add(1, 2)', {}, functions)).toBe(3);
    });

    it('passes context values as arguments', () => {
      const functions = {
        greet: (name: unknown) => `Hello, ${name}!`,
      };
      expect(evaluate('greet(name)', { name: 'Alice' }, functions)).toBe('Hello, Alice!');
    });

    it('throws on unknown function', () => {
      expect(() => evaluate('unknown()')).toThrow(/Unknown function: unknown/);
    });
  });

  describe('security', () => {
    it('blocks __proto__ access', () => {
      const obj = { safe: 'value' };
      expect(evaluate('obj.__proto__', { obj })).toBe(undefined);
    });

    it('blocks constructor access', () => {
      const obj = { safe: 'value' };
      expect(evaluate('obj.constructor', { obj })).toBe(undefined);
    });

    it('blocks __defineGetter__', () => {
      const obj = { safe: 'value' };
      expect(evaluate('obj.__defineGetter__', { obj })).toBe(undefined);
    });

    it('blocks prototype access via bracket notation', () => {
      expect(evaluate("obj['__proto__']", { obj: {} })).toBe(undefined);
      expect(evaluate("obj['constructor']", { obj: {} })).toBe(undefined);
    });

    it('does not access inherited properties', () => {
      const proto = { inherited: 'should not see' };
      const obj = Object.create(proto);
      obj.own = 'visible';
      expect(evaluate('obj.own', { obj })).toBe('visible');
      expect(evaluate('obj.inherited', { obj })).toBe(undefined);
    });
  });

  describe('immutability', () => {
    it('array spread creates new array', () => {
      const original = [1, 2, 3];
      const result = evaluate('[...arr]', { arr: original });
      expect(result).toEqual([1, 2, 3]);
      expect(result).not.toBe(original);
    });

    it('object spread creates new object', () => {
      const original = { a: 1, b: 2 };
      const result = evaluate('{ ...obj }', { obj: original });
      expect(result).toEqual({ a: 1, b: 2 });
      expect(result).not.toBe(original);
    });
  });

  describe('complex expressions', () => {
    it('evaluates realistic ternary', () => {
      expect(evaluate('count > 0 ? items : []', { count: 3, items: [1, 2, 3] })).toEqual([1, 2, 3]);
      expect(evaluate('count > 0 ? items : []', { count: 0, items: [1, 2, 3] })).toEqual([]);
    });

    it('evaluates nested function calls', () => {
      const functions = {
        double: (x: unknown) => (x as number) * 2,
        add: (a: unknown, b: unknown) => (a as number) + (b as number),
      };
      expect(evaluate('double(add(1, 2))', {}, functions)).toBe(6);
    });

    it('evaluates array accumulation pattern', () => {
      const context = {
        inherited: ['alpha', 'beta'],
        word: 'gamma',
      };
      expect(evaluate('[...inherited, word]', context)).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('evaluates object merge pattern', () => {
      const context = {
        defaults: { theme: 'light', size: 'medium' },
        overrides: { theme: 'dark' },
      };
      expect(evaluate('{ ...defaults, ...overrides }', context)).toEqual({
        theme: 'dark',
        size: 'medium',
      });
    });
  });
});
