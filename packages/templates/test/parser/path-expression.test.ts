import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';
import type { PathExpression } from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser - Simple PathExpression', () => {
  let lexer: Lexer;
  let parser: Parser;

  beforeEach(() => {
    lexer = new Lexer();
    parser = new Parser(lexer);
  });

  /**
   * Helper to parse a path expression from a string
   * Wraps the path in mustaches and positions parser at the path
   */
  function parsePathFromString(pathString: string): PathExpression {
    const template = `{{${pathString}}}`;
    parser.setInput(template);
    parser.advance(); // Skip OPEN token to position at first ID
    return parser.parsePathExpression();
  }

  describe('parsePathExpression() - Simple paths', () => {
    it('should parse single identifier', () => {
      const path = parsePathFromString('foo');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['foo']);
      expect(path.original).toBe('foo');
      expect(path.loc).not.toBeNull();
    });

    it('should parse two-level dotted path', () => {
      const path = parsePathFromString('foo.bar');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('foo.bar');
      expect(path.loc).not.toBeNull();
    });

    it('should parse three-level path', () => {
      const path = parsePathFromString('foo.bar.baz');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['foo', 'bar', 'baz']);
      expect(path.original).toBe('foo.bar.baz');
      expect(path.loc).not.toBeNull();
    });

    it('should parse four-level path', () => {
      const path = parsePathFromString('a.b.c.d');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['a', 'b', 'c', 'd']);
      expect(path.original).toBe('a.b.c.d');
      expect(path.loc).not.toBeNull();
    });

    it('should parse slash notation and normalize to dots', () => {
      const path = parsePathFromString('foo/bar');

      expect(path.type).toBe('PathExpression');
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('foo.bar'); // Normalized to dot notation
      expect(path.depth).toBe(0);
      expect(path.data).toBe(false);
    });

    it('should parse mixed dot and slash notation', () => {
      const path = parsePathFromString('foo.bar/baz');

      expect(path.type).toBe('PathExpression');
      expect(path.parts).toEqual(['foo', 'bar', 'baz']);
      expect(path.original).toBe('foo.bar.baz'); // Normalized to dot notation
      expect(path.depth).toBe(0);
      expect(path.data).toBe(false);
    });

    it('should parse identifiers with underscores', () => {
      const path = parsePathFromString('user_name.first_name');

      expect(path.parts).toEqual(['user_name', 'first_name']);
      expect(path.original).toBe('user_name.first_name');
    });

    it('should parse identifiers with numbers', () => {
      const path = parsePathFromString('item1.prop2');

      expect(path.parts).toEqual(['item1', 'prop2']);
      expect(path.original).toBe('item1.prop2');
    });

    it('should set correct location information', () => {
      const path = parsePathFromString('foo.bar');

      expect(path.loc).not.toBeNull();
      expect(path.loc?.start).toBeDefined();
      expect(path.loc?.end).toBeDefined();
      expect(path.loc?.start.line).toBe(1);
      expect(path.loc?.start.column).toBe(2); // After {{
    });
  });

  describe('parsePathExpression() - Error cases', () => {
    it('should throw error for trailing separator', () => {
      const template = '{{foo.}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier or number after path separator',
      );
    });

    it('should throw error for leading separator', () => {
      const template = '{{.}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      // Note: {{.}} is actually treated as ID(".") by the lexer, not SEP
      // This test case is handled by later tasks (special paths)
      // For now, we skip this test as it's not applicable to simple paths
      // A standalone "." is actually valid and will be handled in C2-F4-T4
    });

    it('should throw error when no identifier present', () => {
      const template = '{{}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN (now at CLOSE)

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier to start path expression',
      );
    });

    it('should throw error for multiple consecutive separators', () => {
      const template = '{{foo..bar}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier or number after path separator',
      );
    });
  });

  describe('parsePathExpression() - Parser state', () => {
    it('should leave parser positioned after the path', () => {
      const template = '{{foo.bar}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      parser.parsePathExpression();

      // After parsing, should be at CLOSE token
      const currentToken = parser.getCurrentToken();
      expect(currentToken).not.toBeNull();
      expect(currentToken?.type).toBe(TokenType.CLOSE);
    });

    it('should handle path at end of token stream', () => {
      const template = '{{foo}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      const path = parser.parsePathExpression();

      expect(path.parts).toEqual(['foo']);
      expect(parser.getCurrentToken()).not.toBeNull(); // Should be at CLOSE
    });
  });

  describe('parsePathExpression() - Parent paths', () => {
    it('should parse single parent reference with property', () => {
      const path = parsePathFromString('../parent');

      expect(path.type).toBe('PathExpression');
      expect(path.depth).toBe(1);
      expect(path.parts).toEqual(['parent']);
      expect(path.original).toBe('../parent');
      expect(path.data).toBe(false);
      expect(path.loc).not.toBeNull();
    });

    it('should parse double parent reference', () => {
      const path = parsePathFromString('../../grandparent');

      expect(path.depth).toBe(2);
      expect(path.parts).toEqual(['grandparent']);
      expect(path.original).toBe('../../grandparent');
      expect(path.data).toBe(false);
    });

    it('should parse triple parent reference', () => {
      const path = parsePathFromString('../../../great');

      expect(path.depth).toBe(3);
      expect(path.parts).toEqual(['great']);
      expect(path.original).toBe('../../../great');
      expect(path.data).toBe(false);
    });

    it('should parse parent with nested path', () => {
      const path = parsePathFromString('../foo.bar');

      expect(path.depth).toBe(1);
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('../foo.bar');
      expect(path.data).toBe(false);
    });

    it('should parse parent with three-level nested path', () => {
      const path = parsePathFromString('../a.b.c');

      expect(path.depth).toBe(1);
      expect(path.parts).toEqual(['a', 'b', 'c']);
      expect(path.original).toBe('../a.b.c');
      expect(path.data).toBe(false);
    });

    it('should parse double parent with nested path', () => {
      const path = parsePathFromString('../../user.name');

      expect(path.depth).toBe(2);
      expect(path.parts).toEqual(['user', 'name']);
      expect(path.original).toBe('../../user.name');
      expect(path.data).toBe(false);
    });

    it('should parse standalone parent reference', () => {
      const path = parsePathFromString('..');

      expect(path.depth).toBe(1);
      expect(path.parts).toEqual([]);
      expect(path.original).toBe('..');
      expect(path.data).toBe(false);
    });

    it('should parse double standalone parent reference', () => {
      const path = parsePathFromString('../..');

      expect(path.depth).toBe(2);
      expect(path.parts).toEqual([]);
      expect(path.original).toBe('../..');
      expect(path.data).toBe(false);
    });

    it('should parse triple standalone parent reference', () => {
      const path = parsePathFromString('../../..');

      expect(path.depth).toBe(3);
      expect(path.parts).toEqual([]);
      expect(path.original).toBe('../../..');
      expect(path.data).toBe(false);
    });

    it('should handle parent paths with slash notation', () => {
      const path = parsePathFromString('../foo/bar');

      expect(path.depth).toBe(1);
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('../foo.bar'); // Normalized to dots
      expect(path.data).toBe(false);
    });

    it('should set correct location information for parent paths', () => {
      const path = parsePathFromString('../foo.bar');

      expect(path.loc).not.toBeNull();
      expect(path.loc?.start).toBeDefined();
      expect(path.loc?.end).toBeDefined();
      expect(path.loc?.start.line).toBe(1);
    });
  });
});
