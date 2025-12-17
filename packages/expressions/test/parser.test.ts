import { describe, expect, it } from 'vitest';
import type {
  ArrayExpression,
  BinaryExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  Identifier,
  Literal,
  LogicalExpression,
  MemberExpression,
  ObjectExpression,
  Property,
  SpreadElement,
  UnaryExpression,
} from '../src/parser';
import { Parser, ParserError } from '../src/parser';

describe('Parser', () => {
  const parser = new Parser();

  function parse(input: string): Expression {
    return parser.parse(input);
  }

  describe('literals', () => {
    it('parses string literals', () => {
      const ast = parse("'hello'") as Literal;
      expect(ast.type).toBe('Literal');
      expect(ast.value).toBe('hello');
    });

    it('parses number literals', () => {
      const ast = parse('42') as Literal;
      expect(ast.type).toBe('Literal');
      expect(ast.value).toBe(42);
    });

    it('parses decimal numbers', () => {
      const ast = parse('3.14') as Literal;
      expect(ast.type).toBe('Literal');
      expect(ast.value).toBe(3.14);
    });

    it('parses boolean true', () => {
      const ast = parse('true') as Literal;
      expect(ast.type).toBe('Literal');
      expect(ast.value).toBe(true);
    });

    it('parses boolean false', () => {
      const ast = parse('false') as Literal;
      expect(ast.type).toBe('Literal');
      expect(ast.value).toBe(false);
    });

    it('parses null', () => {
      const ast = parse('null') as Literal;
      expect(ast.type).toBe('Literal');
      expect(ast.value).toBe(null);
    });
  });

  describe('identifiers', () => {
    it('parses simple identifiers', () => {
      const ast = parse('foo') as Identifier;
      expect(ast.type).toBe('Identifier');
      expect(ast.name).toBe('foo');
    });

    it('parses identifiers with underscores', () => {
      const ast = parse('foo_bar') as Identifier;
      expect(ast.name).toBe('foo_bar');
    });

    it('parses identifiers with numbers', () => {
      const ast = parse('item1') as Identifier;
      expect(ast.name).toBe('item1');
    });
  });

  describe('binary expressions', () => {
    describe('arithmetic', () => {
      it('parses addition', () => {
        const ast = parse('a + b') as BinaryExpression;
        expect(ast.type).toBe('BinaryExpression');
        expect(ast.operator).toBe('+');
        expect((ast.left as Identifier).name).toBe('a');
        expect((ast.right as Identifier).name).toBe('b');
      });

      it('parses subtraction', () => {
        const ast = parse('a - b') as BinaryExpression;
        expect(ast.operator).toBe('-');
      });

      it('parses multiplication', () => {
        const ast = parse('a * b') as BinaryExpression;
        expect(ast.operator).toBe('*');
      });

      it('parses division', () => {
        const ast = parse('a / b') as BinaryExpression;
        expect(ast.operator).toBe('/');
      });

      it('parses modulo', () => {
        const ast = parse('a % b') as BinaryExpression;
        expect(ast.operator).toBe('%');
      });
    });

    describe('comparison', () => {
      it('parses ===', () => {
        const ast = parse('a === b') as BinaryExpression;
        expect(ast.operator).toBe('===');
      });

      it('parses !==', () => {
        const ast = parse('a !== b') as BinaryExpression;
        expect(ast.operator).toBe('!==');
      });

      it('parses >', () => {
        const ast = parse('a > b') as BinaryExpression;
        expect(ast.operator).toBe('>');
      });

      it('parses >=', () => {
        const ast = parse('a >= b') as BinaryExpression;
        expect(ast.operator).toBe('>=');
      });

      it('parses <', () => {
        const ast = parse('a < b') as BinaryExpression;
        expect(ast.operator).toBe('<');
      });

      it('parses <=', () => {
        const ast = parse('a <= b') as BinaryExpression;
        expect(ast.operator).toBe('<=');
      });
    });
  });

  describe('logical expressions', () => {
    it('parses &&', () => {
      const ast = parse('a && b') as LogicalExpression;
      expect(ast.type).toBe('LogicalExpression');
      expect(ast.operator).toBe('&&');
    });

    it('parses ||', () => {
      const ast = parse('a || b') as LogicalExpression;
      expect(ast.operator).toBe('||');
    });
  });

  describe('unary expressions', () => {
    it('parses !', () => {
      const ast = parse('!a') as UnaryExpression;
      expect(ast.type).toBe('UnaryExpression');
      expect(ast.operator).toBe('!');
      expect((ast.argument as Identifier).name).toBe('a');
    });

    it('parses unary -', () => {
      const ast = parse('-a') as UnaryExpression;
      expect(ast.operator).toBe('-');
      expect((ast.argument as Identifier).name).toBe('a');
    });

    it('parses double negation', () => {
      const ast = parse('!!a') as UnaryExpression;
      expect(ast.operator).toBe('!');
      expect((ast.argument as UnaryExpression).operator).toBe('!');
    });

    it('parses negative number', () => {
      const ast = parse('-42') as UnaryExpression;
      expect(ast.operator).toBe('-');
      expect((ast.argument as Literal).value).toBe(42);
    });
  });

  describe('ternary expressions', () => {
    it('parses simple ternary', () => {
      const ast = parse('a ? b : c') as ConditionalExpression;
      expect(ast.type).toBe('ConditionalExpression');
      expect((ast.test as Identifier).name).toBe('a');
      expect((ast.consequent as Identifier).name).toBe('b');
      expect((ast.alternate as Identifier).name).toBe('c');
    });

    it('parses nested ternary (right-associative)', () => {
      const ast = parse('a ? b : c ? d : e') as ConditionalExpression;
      expect((ast.test as Identifier).name).toBe('a');
      expect((ast.consequent as Identifier).name).toBe('b');
      // alternate is another ternary
      const inner = ast.alternate as ConditionalExpression;
      expect(inner.type).toBe('ConditionalExpression');
      expect((inner.test as Identifier).name).toBe('c');
    });
  });

  describe('member expressions', () => {
    it('parses dot notation', () => {
      const ast = parse('a.b') as MemberExpression;
      expect(ast.type).toBe('MemberExpression');
      expect(ast.computed).toBe(false);
      expect((ast.object as Identifier).name).toBe('a');
      expect((ast.property as Identifier).name).toBe('b');
    });

    it('parses bracket notation', () => {
      const ast = parse('a[0]') as MemberExpression;
      expect(ast.type).toBe('MemberExpression');
      expect(ast.computed).toBe(true);
      expect((ast.object as Identifier).name).toBe('a');
      expect((ast.property as Literal).value).toBe(0);
    });

    it('parses chained dot notation', () => {
      const ast = parse('a.b.c') as MemberExpression;
      expect((ast.property as Identifier).name).toBe('c');
      const inner = ast.object as MemberExpression;
      expect((inner.property as Identifier).name).toBe('b');
      expect((inner.object as Identifier).name).toBe('a');
    });

    it('parses mixed notation', () => {
      const ast = parse('a.b[0]') as MemberExpression;
      expect(ast.computed).toBe(true);
      expect((ast.property as Literal).value).toBe(0);
      const inner = ast.object as MemberExpression;
      expect(inner.computed).toBe(false);
    });

    it('parses bracket with expression', () => {
      const ast = parse("a['key']") as MemberExpression;
      expect(ast.computed).toBe(true);
      expect((ast.property as Literal).value).toBe('key');
    });
  });

  describe('call expressions', () => {
    it('parses function call with no arguments', () => {
      const ast = parse('foo()') as CallExpression;
      expect(ast.type).toBe('CallExpression');
      expect(ast.callee.name).toBe('foo');
      expect(ast.arguments).toHaveLength(0);
    });

    it('parses function call with one argument', () => {
      const ast = parse('foo(a)') as CallExpression;
      expect(ast.arguments).toHaveLength(1);
      expect((ast.arguments[0] as Identifier).name).toBe('a');
    });

    it('parses function call with multiple arguments', () => {
      const ast = parse('foo(a, b, c)') as CallExpression;
      expect(ast.arguments).toHaveLength(3);
    });

    it('parses nested function calls', () => {
      const ast = parse('foo(bar(x))') as CallExpression;
      expect(ast.callee.name).toBe('foo');
      const inner = ast.arguments[0] as CallExpression;
      expect(inner.callee.name).toBe('bar');
    });

    it('rejects method calls', () => {
      expect(() => parse('obj.method()')).toThrow(ParserError);
      expect(() => parse('obj.method()')).toThrow(/Method calls are not allowed/);
    });
  });

  describe('array expressions', () => {
    it('parses empty array', () => {
      const ast = parse('[]') as ArrayExpression;
      expect(ast.type).toBe('ArrayExpression');
      expect(ast.elements).toHaveLength(0);
    });

    it('parses array with elements', () => {
      const ast = parse('[1, 2, 3]') as ArrayExpression;
      expect(ast.elements).toHaveLength(3);
      expect((ast.elements[0] as Literal).value).toBe(1);
    });

    it('parses array with spread', () => {
      const ast = parse('[...arr]') as ArrayExpression;
      expect(ast.elements).toHaveLength(1);
      const spread = ast.elements[0] as SpreadElement;
      expect(spread.type).toBe('SpreadElement');
      expect((spread.argument as Identifier).name).toBe('arr');
    });

    it('parses array with mixed elements and spread', () => {
      const ast = parse('[a, ...b, c]') as ArrayExpression;
      expect(ast.elements).toHaveLength(3);
      expect((ast.elements[0] as Identifier).name).toBe('a');
      expect((ast.elements[1] as SpreadElement).type).toBe('SpreadElement');
      expect((ast.elements[2] as Identifier).name).toBe('c');
    });
  });

  describe('object expressions', () => {
    it('parses empty object', () => {
      const ast = parse('{}') as ObjectExpression;
      expect(ast.type).toBe('ObjectExpression');
      expect(ast.properties).toHaveLength(0);
    });

    it('parses object with properties', () => {
      const ast = parse('{ a: 1, b: 2 }') as ObjectExpression;
      expect(ast.properties).toHaveLength(2);
      const prop1 = ast.properties[0] as Property;
      expect((prop1.key as Identifier).name).toBe('a');
      expect((prop1.value as Literal).value).toBe(1);
    });

    it('parses object with shorthand', () => {
      const ast = parse('{ a, b }') as ObjectExpression;
      expect(ast.properties).toHaveLength(2);
      const prop1 = ast.properties[0] as Property;
      expect(prop1.shorthand).toBe(true);
      expect((prop1.key as Identifier).name).toBe('a');
    });

    it('parses object with string keys', () => {
      const ast = parse("{ 'key': value }") as ObjectExpression;
      const prop = ast.properties[0] as Property;
      expect((prop.key as Literal).value).toBe('key');
    });

    it('parses object with spread', () => {
      const ast = parse('{ ...obj }') as ObjectExpression;
      expect(ast.properties).toHaveLength(1);
      const spread = ast.properties[0] as SpreadElement;
      expect(spread.type).toBe('SpreadElement');
    });

    it('parses object with mixed properties and spread', () => {
      const ast = parse('{ a: 1, ...obj, b: 2 }') as ObjectExpression;
      expect(ast.properties).toHaveLength(3);
      expect((ast.properties[0] as Property).type).toBe('Property');
      expect((ast.properties[1] as SpreadElement).type).toBe('SpreadElement');
      expect((ast.properties[2] as Property).type).toBe('Property');
    });
  });

  describe('grouping', () => {
    it('parses parenthesized expressions', () => {
      const ast = parse('(a)') as Identifier;
      expect(ast.type).toBe('Identifier');
      expect(ast.name).toBe('a');
    });

    it('parses nested parentheses', () => {
      const ast = parse('((a))') as Identifier;
      expect(ast.name).toBe('a');
    });

    it('uses grouping for precedence', () => {
      const ast = parse('(a + b) * c') as BinaryExpression;
      expect(ast.operator).toBe('*');
      expect((ast.left as BinaryExpression).operator).toBe('+');
    });
  });

  describe('operator precedence', () => {
    it('* binds tighter than +', () => {
      const ast = parse('a + b * c') as BinaryExpression;
      expect(ast.operator).toBe('+');
      expect((ast.right as BinaryExpression).operator).toBe('*');
    });

    it('+ binds tighter than >', () => {
      const ast = parse('a > b + c') as BinaryExpression;
      expect(ast.operator).toBe('>');
      expect((ast.right as BinaryExpression).operator).toBe('+');
    });

    it('> binds tighter than ===', () => {
      const ast = parse('a === b > c') as BinaryExpression;
      expect(ast.operator).toBe('===');
      expect((ast.right as BinaryExpression).operator).toBe('>');
    });

    it('=== binds tighter than &&', () => {
      const ast = parse('a && b === c') as LogicalExpression;
      expect(ast.operator).toBe('&&');
      expect((ast.right as BinaryExpression).operator).toBe('===');
    });

    it('&& binds tighter than ||', () => {
      const ast = parse('a || b && c') as LogicalExpression;
      expect(ast.operator).toBe('||');
      expect((ast.right as LogicalExpression).operator).toBe('&&');
    });

    it('|| binds tighter than ?:', () => {
      const ast = parse('a ? b || c : d') as ConditionalExpression;
      expect((ast.consequent as LogicalExpression).operator).toBe('||');
    });

    it('unary binds tighter than binary', () => {
      const ast = parse('-a + b') as BinaryExpression;
      expect(ast.operator).toBe('+');
      expect((ast.left as UnaryExpression).operator).toBe('-');
    });

    it('member access binds tighter than unary', () => {
      const ast = parse('-a.b') as UnaryExpression;
      expect(ast.operator).toBe('-');
      expect((ast.argument as MemberExpression).type).toBe('MemberExpression');
    });
  });

  describe('associativity', () => {
    it('binary operators are left-associative', () => {
      const ast = parse('a - b - c') as BinaryExpression;
      expect(ast.operator).toBe('-');
      expect((ast.right as Identifier).name).toBe('c');
      expect((ast.left as BinaryExpression).operator).toBe('-');
    });

    it('ternary is right-associative', () => {
      const ast = parse('a ? b : c ? d : e') as ConditionalExpression;
      expect((ast.alternate as ConditionalExpression).type).toBe('ConditionalExpression');
    });
  });

  describe('complex expressions', () => {
    it('parses realistic expression', () => {
      const ast = parse('count > 0 ? items : []');
      expect(ast.type).toBe('ConditionalExpression');
    });

    it('parses array spread concatenation', () => {
      const ast = parse('[...a, ...b]') as ArrayExpression;
      expect(ast.elements).toHaveLength(2);
      expect((ast.elements[0] as SpreadElement).type).toBe('SpreadElement');
      expect((ast.elements[1] as SpreadElement).type).toBe('SpreadElement');
    });

    it('parses object spread merge', () => {
      const ast = parse('{ ...defaults, ...overrides }') as ObjectExpression;
      expect(ast.properties).toHaveLength(2);
    });

    it('parses function with expression arguments', () => {
      const ast = parse('sum(a + b, c * d)') as CallExpression;
      expect(ast.arguments).toHaveLength(2);
      expect((ast.arguments[0] as BinaryExpression).operator).toBe('+');
      expect((ast.arguments[1] as BinaryExpression).operator).toBe('*');
    });
  });

  describe('error handling', () => {
    it('throws on unexpected token', () => {
      expect(() => parse('+')).toThrow(ParserError);
    });

    it('throws on unclosed parenthesis', () => {
      expect(() => parse('(a')).toThrow(ParserError);
      expect(() => parse('(a')).toThrow(/Expected "\)"/);
    });

    it('throws on unclosed bracket', () => {
      expect(() => parse('[a')).toThrow(ParserError);
      expect(() => parse('[a')).toThrow(/Expected "]"/);
    });

    it('throws on unclosed brace', () => {
      expect(() => parse('{ a: 1')).toThrow(ParserError);
      expect(() => parse('{ a: 1')).toThrow(/Expected "}"/);
    });

    it('throws on incomplete ternary', () => {
      expect(() => parse('a ? b')).toThrow(ParserError);
      expect(() => parse('a ? b')).toThrow(/Expected ':'/);
    });

    it('throws on trailing tokens', () => {
      expect(() => parse('a b')).toThrow(ParserError);
      expect(() => parse('a b')).toThrow(/Unexpected token/);
    });

    it('includes position in error', () => {
      try {
        parse('a b');
      } catch (e) {
        expect(e).toBeInstanceOf(ParserError);
        expect((e as ParserError).position).toBeDefined();
        expect((e as ParserError).position?.column).toBe(2);
      }
    });
  });

  describe('location tracking', () => {
    it('tracks location for literals', () => {
      const ast = parse('42');
      expect(ast.loc).toBeDefined();
      expect(ast.loc?.start.column).toBe(0);
    });

    it('tracks location for binary expressions', () => {
      const ast = parse('a + b') as BinaryExpression;
      expect(ast.loc).toBeDefined();
      expect(ast.loc?.start.column).toBe(0);
      expect(ast.loc?.end.column).toBe(5);
    });
  });
});
