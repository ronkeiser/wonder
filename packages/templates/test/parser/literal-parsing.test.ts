import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type {
  BooleanLiteral,
  NullLiteral,
  NumberLiteral,
  StringLiteral,
  UndefinedLiteral,
} from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

/**
 * Literal Parsing Tests (Feature 2.8)
 *
 * Note: In V1, literals are only supported as parameters to block helpers.
 * Mustache statements ({{x}}) do not support parameters - they only output variables.
 * Therefore, all tests use block helper syntax to test literal parsing functionality.
 *
 * These tests verify that the literal parsing methods (parseStringLiteral,
 * parseNumberLiteral, parseBooleanLiteral, parseNullLiteral, parseUndefinedLiteral)
 * work correctly when called via parseExpression() in block helper parameters.
 */
describe('Literal Parsing', () => {
  describe('String Literals (C2-F8-T1)', () => {
    it('parses double-quoted string', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if "hello"}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as StringLiteral;
        expect(literal.type).toBe('StringLiteral');
        expect(literal.value).toBe('hello');
        expect(literal.original).toBe('"hello"');
        expect(literal.loc).toBeDefined();
      }
    });

    it('parses single-quoted string', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput("{{#if 'world'}}yes{{/if}}");

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as StringLiteral;
        expect(literal.type).toBe('StringLiteral');
        expect(literal.value).toBe('world');
        expect(literal.original).toBe('"world"');
      }
    });

    it('parses empty string', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if ""}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as StringLiteral;
        expect(literal.value).toBe('');
        expect(literal.original).toBe('""');
      }
    });

    it('parses string with spaces', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if "hello world"}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as StringLiteral;
        expect(literal.value).toBe('hello world');
      }
    });

    it('parses string with escaped quotes', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if "say \\"hi\\""}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as StringLiteral;
        expect(literal.value).toBe('say "hi"');
      }
    });

    it('parses string with escape sequences', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if "line1\\nline2"}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as StringLiteral;
        // V1 preserves escape sequences literally - they're processed during rendering
        expect(literal.value).toBe('line1\\nline2');
      }
    });

    it('parses multiple string parameters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#helper "first" "second" "third"}}yes{{/helper}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        expect(block.params).toHaveLength(3);
        expect((block.params[0] as StringLiteral).value).toBe('first');
        expect((block.params[1] as StringLiteral).value).toBe('second');
        expect((block.params[2] as StringLiteral).value).toBe('third');
      }
    });

    it('tracks location correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if "test"}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as StringLiteral;
        expect(literal.loc).toBeDefined();
        expect(literal.loc?.start.line).toBeGreaterThan(0);
        expect(literal.loc?.start.column).toBeGreaterThan(0);
      }
    });
  });

  describe('Number Literals (C2-F8-T2)', () => {
    it('parses positive integer', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if 123}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NumberLiteral;
        expect(literal.type).toBe('NumberLiteral');
        expect(literal.value).toBe(123);
        expect(literal.original).toBe('123');
        expect(literal.loc).toBeDefined();
      }
    });

    it('parses negative integer', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if -42}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NumberLiteral;
        expect(literal.value).toBe(-42);
        expect(literal.original).toBe('-42');
      }
    });

    it('parses decimal number', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if 3.14}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NumberLiteral;
        expect(literal.value).toBe(3.14);
        expect(literal.original).toBe('3.14');
      }
    });

    it('parses zero', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if 0}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NumberLiteral;
        expect(literal.value).toBe(0);
      }
    });

    it('parses negative decimal', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if -1.5}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NumberLiteral;
        expect(literal.value).toBe(-1.5);
      }
    });

    it('parses large number', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if 999999}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NumberLiteral;
        expect(literal.value).toBe(999999);
      }
    });

    it('parses decimal with leading zero', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if 0.5}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NumberLiteral;
        expect(literal.value).toBe(0.5);
      }
    });

    it('parses multiple number parameters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#helper 1 2 3}}yes{{/helper}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        expect(block.params).toHaveLength(3);
        expect((block.params[0] as NumberLiteral).value).toBe(1);
        expect((block.params[1] as NumberLiteral).value).toBe(2);
        expect((block.params[2] as NumberLiteral).value).toBe(3);
      }
    });

    it('tracks location correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if 42}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NumberLiteral;
        expect(literal.loc).toBeDefined();
        expect(literal.loc?.start.line).toBeGreaterThan(0);
      }
    });
  });

  describe('Boolean Literals (C2-F8-T3)', () => {
    it('parses true literal', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if true}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as BooleanLiteral;
        expect(literal.type).toBe('BooleanLiteral');
        expect(literal.value).toBe(true);
        expect(literal.original).toBe('true');
        expect(literal.loc).toBeDefined();
      }
    });

    it('parses false literal', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if false}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as BooleanLiteral;
        expect(literal.value).toBe(false);
        expect(literal.original).toBe('false');
      }
    });

    it('parses multiple boolean parameters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#helper true false true}}yes{{/helper}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        expect(block.params).toHaveLength(3);
        expect((block.params[0] as BooleanLiteral).value).toBe(true);
        expect((block.params[1] as BooleanLiteral).value).toBe(false);
        expect((block.params[2] as BooleanLiteral).value).toBe(true);
      }
    });

    it('tracks location correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if true}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as BooleanLiteral;
        expect(literal.loc).toBeDefined();
        expect(literal.loc?.start).toBeDefined();
        expect(literal.loc?.end).toBeDefined();
      }
    });

    it('preserves original string for true', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if true}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as BooleanLiteral;
        expect(literal.original).toBe('true');
      }
    });

    it('preserves original string for false', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if false}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as BooleanLiteral;
        expect(literal.original).toBe('false');
      }
    });
  });

  describe('Null and Undefined Literals (C2-F8-T4)', () => {
    it('parses null literal', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if null}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NullLiteral;
        expect(literal.type).toBe('NullLiteral');
        expect(literal.value).toBe(null);
        expect(literal.original).toBe('null');
        expect(literal.loc).toBeDefined();
      }
    });

    it('parses undefined literal', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if undefined}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as UndefinedLiteral;
        expect(literal.type).toBe('UndefinedLiteral');
        expect(literal.value).toBe(undefined);
        expect(literal.original).toBe('undefined');
        expect(literal.loc).toBeDefined();
      }
    });

    it('tracks location for null', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if null}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NullLiteral;
        expect(literal.loc).toBeDefined();
        expect(literal.loc?.start.line).toBeGreaterThan(0);
      }
    });

    it('tracks location for undefined', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if undefined}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as UndefinedLiteral;
        expect(literal.loc).toBeDefined();
        expect(literal.loc?.start.line).toBeGreaterThan(0);
      }
    });

    it('preserves original for null', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if null}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as NullLiteral;
        expect(literal.original).toBe('null');
      }
    });

    it('preserves original for undefined', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if undefined}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        const literal = block.params[0] as UndefinedLiteral;
        expect(literal.original).toBe('undefined');
      }
    });
  });

  describe('Mixed Literal Types', () => {
    it('parses mixed literal parameters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#helper "text" 42 true null}}yes{{/helper}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        expect(block.params).toHaveLength(4);
        expect((block.params[0] as StringLiteral).type).toBe('StringLiteral');
        expect((block.params[1] as NumberLiteral).type).toBe('NumberLiteral');
        expect((block.params[2] as BooleanLiteral).type).toBe('BooleanLiteral');
        expect((block.params[3] as NullLiteral).type).toBe('NullLiteral');
      }
    });

    it('parses all literal types in sequence', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#x "string" 123 true false null undefined}}yes{{/x}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        expect(block.params).toHaveLength(6);
        expect((block.params[0] as StringLiteral).value).toBe('string');
        expect((block.params[1] as NumberLiteral).value).toBe(123);
        expect((block.params[2] as BooleanLiteral).value).toBe(true);
        expect((block.params[3] as BooleanLiteral).value).toBe(false);
        expect((block.params[4] as NullLiteral).value).toBe(null);
        expect((block.params[5] as UndefinedLiteral).value).toBe(undefined);
      }
    });

    it('parses literals alongside path expressions', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#helper name "default" 0}}yes{{/helper}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        expect(block.params).toHaveLength(3);
        expect(block.params[0].type).toBe('PathExpression');
        expect(block.params[1].type).toBe('StringLiteral');
        expect(block.params[2].type).toBe('NumberLiteral');
      }
    });

    it('parses complex combinations', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#each items "separator" true 10}}{{/each}}');

      const program = parser.parse();
      const block = program.body[0];

      if (block.type === 'BlockStatement') {
        expect(block.params).toHaveLength(4);
        expect(block.params[0].type).toBe('PathExpression');
        expect((block.params[1] as StringLiteral).value).toBe('separator');
        expect((block.params[2] as BooleanLiteral).value).toBe(true);
        expect((block.params[3] as NumberLiteral).value).toBe(10);
      }
    });
  });
});
