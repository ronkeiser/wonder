import { describe, expect, test } from 'vitest';
import type { Position, SourceLocation } from '../../src/lexer/token';
import type {
  BlockStatement,
  BooleanLiteral,
  CommentStatement,
  ContentStatement,
  Expression,
  Hash,
  HashPair,
  MustacheStatement,
  Node,
  NullLiteral,
  NumberLiteral,
  PathExpression,
  Program,
  Statement,
  StringLiteral,
  StripFlags,
  UndefinedLiteral,
} from '../../src/parser/ast-nodes';

describe('AST Base Node Types', () => {
  describe('Node interface', () => {
    test('has required type field', () => {
      const node: Node = {
        type: 'TestNode',
        loc: null,
      };

      expect(node.type).toBe('TestNode');
    });

    test('has loc field that can be null', () => {
      const node: Node = {
        type: 'TestNode',
        loc: null,
      };

      expect(node.loc).toBeNull();
    });

    test('has loc field that can be SourceLocation', () => {
      const loc: SourceLocation = {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 5, index: 5 },
      };

      const node: Node = {
        type: 'TestNode',
        loc,
      };

      expect(node.loc).toBe(loc);
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.end.column).toBe(5);
    });

    test('type field is string discriminator', () => {
      const node1: Node = { type: 'TypeA', loc: null };
      const node2: Node = { type: 'TypeB', loc: null };

      expect(node1.type).not.toBe(node2.type);
    });
  });

  describe('SourceLocation compatibility', () => {
    test('SourceLocation from lexer is compatible with parser', () => {
      // This test verifies we can use lexer's SourceLocation in parser nodes
      const lexerLoc: SourceLocation = {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 10, index: 10 },
      };

      const node: Node = {
        type: 'TestNode',
        loc: lexerLoc,
      };

      expect(node.loc).toBe(lexerLoc);
    });

    test('Position from lexer is compatible with parser', () => {
      const position: Position = {
        line: 5,
        column: 10,
        index: 42,
      };

      const loc: SourceLocation = {
        start: position,
        end: { line: 5, column: 15, index: 47 },
      };

      const node: Node = {
        type: 'TestNode',
        loc,
      };

      expect(node.loc?.start).toBe(position);
      expect(node.loc?.start.line).toBe(5);
      expect(node.loc?.start.column).toBe(10);
      expect(node.loc?.start.index).toBe(42);
    });
  });

  describe('Node creation', () => {
    test('can create minimal node', () => {
      const node: Node = {
        type: 'Minimal',
        loc: null,
      };

      expect(node).toMatchObject({
        type: 'Minimal',
        loc: null,
      });
    });

    test('can create node with full location', () => {
      const node: Node = {
        type: 'Located',
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 3, column: 5, index: 42 },
        },
      };

      expect(node.type).toBe('Located');
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.end.line).toBe(3);
      expect(node.loc?.end.index).toBe(42);
    });

    test('can create multiple nodes with different types', () => {
      const nodes: Node[] = [
        { type: 'TestNodeA', loc: null },
        { type: 'TestNodeB', loc: null },
        { type: 'TestNodeC', loc: null },
      ];

      expect(nodes).toHaveLength(3);
      expect(nodes[0].type).toBe('TestNodeA');
      expect(nodes[1].type).toBe('TestNodeB');
      expect(nodes[2].type).toBe('TestNodeC');
    });
  });

  describe('Type safety', () => {
    test('Node interface enforces required fields', () => {
      // This is a compile-time test - if it compiles, the test passes
      // @ts-expect-error - missing required fields
      const invalid1: Node = {};

      // @ts-expect-error - missing loc field
      const invalid2: Node = { type: 'Test' };

      // Valid nodes
      const valid1: Node = { type: 'Test', loc: null };
      const valid2: Node = {
        type: 'Test',
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 1, index: 1 },
        },
      };

      expect(valid1).toBeDefined();
      expect(valid2).toBeDefined();
    });

    test('loc field is nullable', () => {
      const withLoc: Node = {
        type: 'Test',
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 1, index: 1 },
        },
      };

      const withoutLoc: Node = {
        type: 'Test',
        loc: null,
      };

      expect(withLoc.loc).not.toBeNull();
      expect(withoutLoc.loc).toBeNull();
    });
  });

  describe('Program node', () => {
    test('has type "Program"', () => {
      const program: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      expect(program.type).toBe('Program');
    });

    test('has body array', () => {
      const program: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      expect(program.body).toEqual([]);
      expect(Array.isArray(program.body)).toBe(true);
    });

    test('can have empty body', () => {
      const program: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      expect(program.body).toHaveLength(0);
    });

    test('can have statements in body', () => {
      const statements: Statement[] = [
        { type: 'ContentStatement', value: 'text', original: 'text', loc: null },
        {
          type: 'MustacheStatement',
          path: { type: 'PathExpression', loc: null } as any,
          params: [],
          hash: { type: 'Hash', loc: null } as any,
          escaped: true,
          loc: null,
        },
      ];

      const program: Program = {
        type: 'Program',
        body: statements,
        loc: null,
      };

      expect(program.body).toHaveLength(2);
      expect(program.body[0].type).toBe('ContentStatement');
      expect(program.body[1].type).toBe('MustacheStatement');
    });

    test('can have multiple statements in body', () => {
      const program: Program = {
        type: 'Program',
        body: [
          { type: 'ContentStatement', value: 'text', original: 'text', loc: null },
          {
            type: 'MustacheStatement',
            path: { type: 'PathExpression', loc: null } as any,
            params: [],
            hash: { type: 'Hash', loc: null } as any,
            escaped: true,
            loc: null,
          },
          {
            type: 'BlockStatement',
            path: { type: 'PathExpression', loc: null } as any,
            params: [],
            hash: { type: 'Hash', loc: null } as any,
            program: null,
            inverse: null,
            openStrip: { open: false, close: false },
            inverseStrip: { open: false, close: false },
            closeStrip: { open: false, close: false },
            loc: null,
          },
          { type: 'CommentStatement', value: 'comment', loc: null },
        ],
        loc: null,
      };

      expect(program.body).toHaveLength(4);
    });

    test('can have location information', () => {
      const program: Program = {
        type: 'Program',
        body: [],
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 5, column: 10, index: 100 },
        },
      };

      expect(program.loc?.start.line).toBe(1);
      expect(program.loc?.end.line).toBe(5);
      expect(program.loc?.end.index).toBe(100);
    });

    test('extends Node interface', () => {
      const program: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      // Program is assignable to Node
      const node: Node = program;

      expect(node.type).toBe('Program');
    });

    test('matches specification structure', () => {
      const program: Program = {
        type: 'Program',
        body: [
          { type: 'ContentStatement', value: 'text', original: 'text', loc: null },
          {
            type: 'MustacheStatement',
            path: { type: 'PathExpression', loc: null } as any,
            params: [],
            hash: { type: 'Hash', loc: null } as any,
            escaped: true,
            loc: null,
          },
        ],
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 20, index: 20 },
        },
      };

      expect(program).toMatchObject({
        type: 'Program',
        body: expect.any(Array),
        loc: expect.any(Object),
      });

      expect(program.body).toHaveLength(2);
    });
  });

  describe('ContentStatement', () => {
    test('has type "ContentStatement"', () => {
      const stmt: ContentStatement = {
        type: 'ContentStatement',
        value: 'Hello World',
        original: 'Hello World',
        loc: null,
      };

      expect(stmt.type).toBe('ContentStatement');
    });

    test('has value field for raw text', () => {
      const stmt: ContentStatement = {
        type: 'ContentStatement',
        value: 'Hello World',
        original: 'Hello World',
        loc: null,
      };

      expect(stmt.value).toBe('Hello World');
    });

    test('has original field', () => {
      const stmt: ContentStatement = {
        type: 'ContentStatement',
        value: '{{escaped}}',
        original: '\\{{escaped}}',
        loc: null,
      };

      expect(stmt.original).toBe('\\{{escaped}}');
    });

    test('is a Statement', () => {
      const stmt: ContentStatement = {
        type: 'ContentStatement',
        value: 'text',
        original: 'text',
        loc: null,
      };

      const statement: Statement = stmt;
      expect(statement.type).toBe('ContentStatement');
    });
  });

  describe('MustacheStatement', () => {
    test('has type "MustacheStatement"', () => {
      const stmt: MustacheStatement = {
        type: 'MustacheStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        escaped: true,
        loc: null,
      };

      expect(stmt.type).toBe('MustacheStatement');
    });

    test('has path field', () => {
      const path = { type: 'PathExpression', loc: null } as any;
      const stmt: MustacheStatement = {
        type: 'MustacheStatement',
        path,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        escaped: true,
        loc: null,
      };

      expect(stmt.path).toBe(path);
    });

    test('has params array', () => {
      const stmt: MustacheStatement = {
        type: 'MustacheStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        escaped: true,
        loc: null,
      };

      expect(Array.isArray(stmt.params)).toBe(true);
      expect(stmt.params).toHaveLength(0);
    });

    test('has hash field', () => {
      const hash = { type: 'Hash', loc: null } as any;
      const stmt: MustacheStatement = {
        type: 'MustacheStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash,
        escaped: true,
        loc: null,
      };

      expect(stmt.hash).toBe(hash);
    });

    test('has escaped boolean flag', () => {
      const escaped: MustacheStatement = {
        type: 'MustacheStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        escaped: true,
        loc: null,
      };

      const unescaped: MustacheStatement = {
        type: 'MustacheStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        escaped: false,
        loc: null,
      };

      expect(escaped.escaped).toBe(true);
      expect(unescaped.escaped).toBe(false);
    });

    test('is a Statement', () => {
      const stmt: MustacheStatement = {
        type: 'MustacheStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        escaped: true,
        loc: null,
      };

      const statement: Statement = stmt;
      expect(statement.type).toBe('MustacheStatement');
    });
  });

  describe('BlockStatement', () => {
    test('has type "BlockStatement"', () => {
      const stmt: BlockStatement = {
        type: 'BlockStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        program: null,
        inverse: null,
        openStrip: { open: false, close: false },
        inverseStrip: { open: false, close: false },
        closeStrip: { open: false, close: false },
        loc: null,
      };

      expect(stmt.type).toBe('BlockStatement');
    });

    test('has path field', () => {
      const path = { type: 'PathExpression', loc: null } as any;
      const stmt: BlockStatement = {
        type: 'BlockStatement',
        path,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        program: null,
        inverse: null,
        openStrip: { open: false, close: false },
        inverseStrip: { open: false, close: false },
        closeStrip: { open: false, close: false },
        loc: null,
      };

      expect(stmt.path).toBe(path);
    });

    test('has program field for main block', () => {
      const program: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      const stmt: BlockStatement = {
        type: 'BlockStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        program,
        inverse: null,
        openStrip: { open: false, close: false },
        inverseStrip: { open: false, close: false },
        closeStrip: { open: false, close: false },
        loc: null,
      };

      expect(stmt.program).toBe(program);
    });

    test('has inverse field for else block', () => {
      const inverse: Program = {
        type: 'Program',
        body: [],
        loc: null,
      };

      const stmt: BlockStatement = {
        type: 'BlockStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        program: null,
        inverse,
        openStrip: { open: false, close: false },
        inverseStrip: { open: false, close: false },
        closeStrip: { open: false, close: false },
        loc: null,
      };

      expect(stmt.inverse).toBe(inverse);
    });

    test('has strip flags for whitespace control', () => {
      const stmt: BlockStatement = {
        type: 'BlockStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        program: null,
        inverse: null,
        openStrip: { open: true, close: false },
        inverseStrip: { open: false, close: true },
        closeStrip: { open: true, close: true },
        loc: null,
      };

      expect(stmt.openStrip.open).toBe(true);
      expect(stmt.inverseStrip.close).toBe(true);
      expect(stmt.closeStrip.open).toBe(true);
    });

    test('is a Statement', () => {
      const stmt: BlockStatement = {
        type: 'BlockStatement',
        path: { type: 'PathExpression', loc: null } as any,
        params: [],
        hash: { type: 'Hash', loc: null } as any,
        program: null,
        inverse: null,
        openStrip: { open: false, close: false },
        inverseStrip: { open: false, close: false },
        closeStrip: { open: false, close: false },
        loc: null,
      };

      const statement: Statement = stmt;
      expect(statement.type).toBe('BlockStatement');
    });
  });

  describe('CommentStatement', () => {
    test('has type "CommentStatement"', () => {
      const stmt: CommentStatement = {
        type: 'CommentStatement',
        value: 'This is a comment',
        loc: null,
      };

      expect(stmt.type).toBe('CommentStatement');
    });

    test('has value field for comment text', () => {
      const stmt: CommentStatement = {
        type: 'CommentStatement',
        value: 'This is a comment',
        loc: null,
      };

      expect(stmt.value).toBe('This is a comment');
    });

    test('value excludes delimiters', () => {
      const stmt: CommentStatement = {
        type: 'CommentStatement',
        value: 'comment text',
        loc: null,
      };

      expect(stmt.value).not.toContain('{{');
      expect(stmt.value).not.toContain('}}');
    });

    test('is a Statement', () => {
      const stmt: CommentStatement = {
        type: 'CommentStatement',
        value: 'comment',
        loc: null,
      };

      const statement: Statement = stmt;
      expect(statement.type).toBe('CommentStatement');
    });
  });

  describe('Statement union type', () => {
    test('includes all statement types', () => {
      const statements: Statement[] = [
        { type: 'ContentStatement', value: 'text', original: 'text', loc: null },
        {
          type: 'MustacheStatement',
          path: { type: 'PathExpression', loc: null } as any,
          params: [],
          hash: { type: 'Hash', loc: null } as any,
          escaped: true,
          loc: null,
        },
        {
          type: 'BlockStatement',
          path: { type: 'PathExpression', loc: null } as any,
          params: [],
          hash: { type: 'Hash', loc: null } as any,
          program: null,
          inverse: null,
          openStrip: { open: false, close: false },
          inverseStrip: { open: false, close: false },
          closeStrip: { open: false, close: false },
          loc: null,
        },
        { type: 'CommentStatement', value: 'comment', loc: null },
      ];

      expect(statements).toHaveLength(4);
      expect(statements[0].type).toBe('ContentStatement');
      expect(statements[1].type).toBe('MustacheStatement');
      expect(statements[2].type).toBe('BlockStatement');
      expect(statements[3].type).toBe('CommentStatement');
    });

    test('type discriminator works for narrowing', () => {
      const stmt: Statement = {
        type: 'ContentStatement',
        value: 'text',
        original: 'text',
        loc: null,
      };

      if (stmt.type === 'ContentStatement') {
        expect(stmt.value).toBe('text');
      }
    });
  });

  describe('StripFlags', () => {
    test('has open and close boolean fields', () => {
      const flags: StripFlags = {
        open: true,
        close: false,
      };

      expect(flags.open).toBe(true);
      expect(flags.close).toBe(false);
    });

    test('can create flags with both false', () => {
      const flags: StripFlags = {
        open: false,
        close: false,
      };

      expect(flags.open).toBe(false);
      expect(flags.close).toBe(false);
    });

    test('can create flags with both true', () => {
      const flags: StripFlags = {
        open: true,
        close: true,
      };

      expect(flags.open).toBe(true);
      expect(flags.close).toBe(true);
    });
  });

  describe('PathExpression', () => {
    test('has type "PathExpression"', () => {
      const expr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo'],
        original: 'foo',
        loc: null,
      };

      expect(expr.type).toBe('PathExpression');
    });

    test('has data flag for @ variables', () => {
      const dataVar: PathExpression = {
        type: 'PathExpression',
        data: true,
        depth: 0,
        parts: ['index'],
        original: '@index',
        loc: null,
      };

      const regularVar: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo'],
        original: 'foo',
        loc: null,
      };

      expect(dataVar.data).toBe(true);
      expect(regularVar.data).toBe(false);
    });

    test('has depth field for parent references', () => {
      const current: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo'],
        original: 'foo',
        loc: null,
      };

      const parent: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 1,
        parts: ['parent'],
        original: '../parent',
        loc: null,
      };

      const grandparent: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 2,
        parts: ['grand'],
        original: '../../grand',
        loc: null,
      };

      expect(current.depth).toBe(0);
      expect(parent.depth).toBe(1);
      expect(grandparent.depth).toBe(2);
    });

    test('has parts array for path segments', () => {
      const simple: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo'],
        original: 'foo',
        loc: null,
      };

      const nested: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo', 'bar', 'baz'],
        original: 'foo.bar.baz',
        loc: null,
      };

      expect(simple.parts).toEqual(['foo']);
      expect(nested.parts).toEqual(['foo', 'bar', 'baz']);
    });

    test('has original string', () => {
      const expr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo', 'bar'],
        original: 'foo.bar',
        loc: null,
      };

      expect(expr.original).toBe('foo.bar');
    });

    test('can have empty parts for {{this}}', () => {
      const thisExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: [],
        original: 'this',
        loc: null,
      };

      expect(thisExpr.parts).toEqual([]);
    });

    test('is an Expression', () => {
      const expr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo'],
        original: 'foo',
        loc: null,
      };

      const expression: Expression = expr;
      expect(expression.type).toBe('PathExpression');
    });
  });

  describe('StringLiteral', () => {
    test('has type "StringLiteral"', () => {
      const expr: StringLiteral = {
        type: 'StringLiteral',
        value: 'hello',
        original: '"hello"',
        loc: null,
      };

      expect(expr.type).toBe('StringLiteral');
    });

    test('has value field for unescaped string', () => {
      const expr: StringLiteral = {
        type: 'StringLiteral',
        value: 'hello world',
        original: '"hello world"',
        loc: null,
      };

      expect(expr.value).toBe('hello world');
    });

    test('has original field with quotes', () => {
      const doubleQuote: StringLiteral = {
        type: 'StringLiteral',
        value: 'text',
        original: '"text"',
        loc: null,
      };

      const singleQuote: StringLiteral = {
        type: 'StringLiteral',
        value: 'text',
        original: "'text'",
        loc: null,
      };

      expect(doubleQuote.original).toBe('"text"');
      expect(singleQuote.original).toBe("'text'");
    });

    test('is an Expression', () => {
      const expr: StringLiteral = {
        type: 'StringLiteral',
        value: 'test',
        original: '"test"',
        loc: null,
      };

      const expression: Expression = expr;
      expect(expression.type).toBe('StringLiteral');
    });
  });

  describe('NumberLiteral', () => {
    test('has type "NumberLiteral"', () => {
      const expr: NumberLiteral = {
        type: 'NumberLiteral',
        value: 42,
        original: '42',
        loc: null,
      };

      expect(expr.type).toBe('NumberLiteral');
    });

    test('has value field for parsed number', () => {
      const integer: NumberLiteral = {
        type: 'NumberLiteral',
        value: 123,
        original: '123',
        loc: null,
      };

      const decimal: NumberLiteral = {
        type: 'NumberLiteral',
        value: 1.5,
        original: '1.5',
        loc: null,
      };

      const negative: NumberLiteral = {
        type: 'NumberLiteral',
        value: -42,
        original: '-42',
        loc: null,
      };

      expect(integer.value).toBe(123);
      expect(decimal.value).toBe(1.5);
      expect(negative.value).toBe(-42);
    });

    test('has original field preserving string format', () => {
      const expr: NumberLiteral = {
        type: 'NumberLiteral',
        value: 123,
        original: '123',
        loc: null,
      };

      expect(expr.original).toBe('123');
    });

    test('is an Expression', () => {
      const expr: NumberLiteral = {
        type: 'NumberLiteral',
        value: 42,
        original: '42',
        loc: null,
      };

      const expression: Expression = expr;
      expect(expression.type).toBe('NumberLiteral');
    });
  });

  describe('BooleanLiteral', () => {
    test('has type "BooleanLiteral"', () => {
      const expr: BooleanLiteral = {
        type: 'BooleanLiteral',
        value: true,
        original: 'true',
        loc: null,
      };

      expect(expr.type).toBe('BooleanLiteral');
    });

    test('has value field for boolean', () => {
      const trueExpr: BooleanLiteral = {
        type: 'BooleanLiteral',
        value: true,
        original: 'true',
        loc: null,
      };

      const falseExpr: BooleanLiteral = {
        type: 'BooleanLiteral',
        value: false,
        original: 'false',
        loc: null,
      };

      expect(trueExpr.value).toBe(true);
      expect(falseExpr.value).toBe(false);
    });

    test('has original field preserving string', () => {
      const expr: BooleanLiteral = {
        type: 'BooleanLiteral',
        value: true,
        original: 'true',
        loc: null,
      };

      expect(expr.original).toBe('true');
    });

    test('is an Expression', () => {
      const expr: BooleanLiteral = {
        type: 'BooleanLiteral',
        value: true,
        original: 'true',
        loc: null,
      };

      const expression: Expression = expr;
      expect(expression.type).toBe('BooleanLiteral');
    });
  });

  describe('NullLiteral', () => {
    test('has type "NullLiteral"', () => {
      const expr: NullLiteral = {
        type: 'NullLiteral',
        value: null,
        original: 'null',
        loc: null,
      };

      expect(expr.type).toBe('NullLiteral');
    });

    test('has value always null', () => {
      const expr: NullLiteral = {
        type: 'NullLiteral',
        value: null,
        original: 'null',
        loc: null,
      };

      expect(expr.value).toBeNull();
    });

    test('has original field', () => {
      const expr: NullLiteral = {
        type: 'NullLiteral',
        value: null,
        original: 'null',
        loc: null,
      };

      expect(expr.original).toBe('null');
    });

    test('is an Expression', () => {
      const expr: NullLiteral = {
        type: 'NullLiteral',
        value: null,
        original: 'null',
        loc: null,
      };

      const expression: Expression = expr;
      expect(expression.type).toBe('NullLiteral');
    });
  });

  describe('UndefinedLiteral', () => {
    test('has type "UndefinedLiteral"', () => {
      const expr: UndefinedLiteral = {
        type: 'UndefinedLiteral',
        value: undefined,
        original: 'undefined',
        loc: null,
      };

      expect(expr.type).toBe('UndefinedLiteral');
    });

    test('has value always undefined', () => {
      const expr: UndefinedLiteral = {
        type: 'UndefinedLiteral',
        value: undefined,
        original: 'undefined',
        loc: null,
      };

      expect(expr.value).toBeUndefined();
    });

    test('has original field', () => {
      const expr: UndefinedLiteral = {
        type: 'UndefinedLiteral',
        value: undefined,
        original: 'undefined',
        loc: null,
      };

      expect(expr.original).toBe('undefined');
    });

    test('is an Expression', () => {
      const expr: UndefinedLiteral = {
        type: 'UndefinedLiteral',
        value: undefined,
        original: 'undefined',
        loc: null,
      };

      const expression: Expression = expr;
      expect(expression.type).toBe('UndefinedLiteral');
    });
  });

  describe('Expression union type', () => {
    test('includes all expression types', () => {
      const expressions: Expression[] = [
        {
          type: 'PathExpression',
          data: false,
          depth: 0,
          parts: ['foo'],
          original: 'foo',
          loc: null,
        },
        { type: 'StringLiteral', value: 'text', original: '"text"', loc: null },
        { type: 'NumberLiteral', value: 42, original: '42', loc: null },
        { type: 'BooleanLiteral', value: true, original: 'true', loc: null },
        { type: 'NullLiteral', value: null, original: 'null', loc: null },
        { type: 'UndefinedLiteral', value: undefined, original: 'undefined', loc: null },
      ];

      expect(expressions).toHaveLength(6);
      expect(expressions[0].type).toBe('PathExpression');
      expect(expressions[1].type).toBe('StringLiteral');
      expect(expressions[2].type).toBe('NumberLiteral');
      expect(expressions[3].type).toBe('BooleanLiteral');
      expect(expressions[4].type).toBe('NullLiteral');
      expect(expressions[5].type).toBe('UndefinedLiteral');
    });

    test('type discriminator works for narrowing', () => {
      const expr: Expression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo'],
        original: 'foo',
        loc: null,
      };

      if (expr.type === 'PathExpression') {
        expect(expr.parts).toEqual(['foo']);
        expect(expr.depth).toBe(0);
      }
    });
  });

  describe('HashPair', () => {
    test('has type "HashPair"', () => {
      const pair: HashPair = {
        type: 'HashPair',
        key: 'name',
        value: {
          type: 'StringLiteral',
          value: 'value',
          original: '"value"',
          loc: null,
        },
        loc: null,
      };

      expect(pair.type).toBe('HashPair');
    });

    test('has key field for parameter name', () => {
      const pair: HashPair = {
        type: 'HashPair',
        key: 'format',
        value: {
          type: 'StringLiteral',
          value: 'YYYY-MM-DD',
          original: '"YYYY-MM-DD"',
          loc: null,
        },
        loc: null,
      };

      expect(pair.key).toBe('format');
    });

    test('has value field as Expression', () => {
      const stringValue: HashPair = {
        type: 'HashPair',
        key: 'name',
        value: {
          type: 'StringLiteral',
          value: 'test',
          original: '"test"',
          loc: null,
        },
        loc: null,
      };

      const pathValue: HashPair = {
        type: 'HashPair',
        key: 'data',
        value: {
          type: 'PathExpression',
          data: false,
          depth: 0,
          parts: ['user', 'name'],
          original: 'user.name',
          loc: null,
        },
        loc: null,
      };

      const numberValue: HashPair = {
        type: 'HashPair',
        key: 'count',
        value: {
          type: 'NumberLiteral',
          value: 42,
          original: '42',
          loc: null,
        },
        loc: null,
      };

      expect(stringValue.value.type).toBe('StringLiteral');
      expect(pathValue.value.type).toBe('PathExpression');
      expect(numberValue.value.type).toBe('NumberLiteral');
    });

    test('is a Node', () => {
      const pair: HashPair = {
        type: 'HashPair',
        key: 'test',
        value: {
          type: 'BooleanLiteral',
          value: true,
          original: 'true',
          loc: null,
        },
        loc: null,
      };

      const node: Node = pair;
      expect(node.type).toBe('HashPair');
    });
  });

  describe('Hash', () => {
    test('has type "Hash"', () => {
      const hash: Hash = {
        type: 'Hash',
        pairs: [],
        loc: null,
      };

      expect(hash.type).toBe('Hash');
    });

    test('has pairs array', () => {
      const hash: Hash = {
        type: 'Hash',
        pairs: [
          {
            type: 'HashPair',
            key: 'format',
            value: {
              type: 'StringLiteral',
              value: 'YYYY-MM-DD',
              original: '"YYYY-MM-DD"',
              loc: null,
            },
            loc: null,
          },
          {
            type: 'HashPair',
            key: 'locale',
            value: {
              type: 'StringLiteral',
              value: 'en',
              original: '"en"',
              loc: null,
            },
            loc: null,
          },
        ],
        loc: null,
      };

      expect(hash.pairs).toHaveLength(2);
      expect(hash.pairs[0].key).toBe('format');
      expect(hash.pairs[1].key).toBe('locale');
    });

    test('can have empty pairs array', () => {
      const hash: Hash = {
        type: 'Hash',
        pairs: [],
        loc: null,
      };

      expect(hash.pairs).toEqual([]);
    });

    test('supports multiple parameter types', () => {
      const hash: Hash = {
        type: 'Hash',
        pairs: [
          {
            type: 'HashPair',
            key: 'name',
            value: {
              type: 'StringLiteral',
              value: 'test',
              original: '"test"',
              loc: null,
            },
            loc: null,
          },
          {
            type: 'HashPair',
            key: 'count',
            value: {
              type: 'NumberLiteral',
              value: 5,
              original: '5',
              loc: null,
            },
            loc: null,
          },
          {
            type: 'HashPair',
            key: 'active',
            value: {
              type: 'BooleanLiteral',
              value: true,
              original: 'true',
              loc: null,
            },
            loc: null,
          },
          {
            type: 'HashPair',
            key: 'data',
            value: {
              type: 'PathExpression',
              data: false,
              depth: 0,
              parts: ['user'],
              original: 'user',
              loc: null,
            },
            loc: null,
          },
        ],
        loc: null,
      };

      expect(hash.pairs[0].value.type).toBe('StringLiteral');
      expect(hash.pairs[1].value.type).toBe('NumberLiteral');
      expect(hash.pairs[2].value.type).toBe('BooleanLiteral');
      expect(hash.pairs[3].value.type).toBe('PathExpression');
    });

    test('is a Node', () => {
      const hash: Hash = {
        type: 'Hash',
        pairs: [],
        loc: null,
      };

      const node: Node = hash;
      expect(node.type).toBe('Hash');
    });
  });
});
