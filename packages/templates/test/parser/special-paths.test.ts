import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type { PathExpression } from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser - Special PathExpression', () => {
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
    parser.advance(); // Skip OPEN token to position at first token
    return parser.parsePathExpression();
  }

  describe('parsePathExpression() - "this" paths', () => {
    it('should parse standalone "this" with empty parts', () => {
      const path = parsePathFromString('this');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual([]);
      expect(path.original).toBe('this');
      expect(path.loc).not.toBeNull();
    });

    it('should parse "this.foo" with parts ["foo"]', () => {
      const path = parsePathFromString('this.foo');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['foo']);
      expect(path.original).toBe('this.foo');
      expect(path.loc).not.toBeNull();
    });

    it('should parse "this.foo.bar" with parts ["foo", "bar"]', () => {
      const path = parsePathFromString('this.foo.bar');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('this.foo.bar');
    });

    it('should parse "this.foo.bar.baz" with three-level nesting', () => {
      const path = parsePathFromString('this.foo.bar.baz');

      expect(path.type).toBe('PathExpression');
      expect(path.parts).toEqual(['foo', 'bar', 'baz']);
      expect(path.original).toBe('this.foo.bar.baz');
      expect(path.depth).toBe(0);
      expect(path.data).toBe(false);
    });

    it('should parse "this/foo" with slash notation', () => {
      const path = parsePathFromString('this/foo');

      expect(path.type).toBe('PathExpression');
      expect(path.parts).toEqual(['foo']);
      expect(path.original).toBe('this.foo'); // Normalized to dot notation
      expect(path.depth).toBe(0);
      expect(path.data).toBe(false);
    });

    it('should parse "this/foo/bar" with slash notation', () => {
      const path = parsePathFromString('this/foo/bar');

      expect(path.type).toBe('PathExpression');
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('this.foo.bar'); // Normalized to dot notation
    });

    it('should parse "this.foo/bar" with mixed notation', () => {
      const path = parsePathFromString('this.foo/bar');

      expect(path.type).toBe('PathExpression');
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('this.foo.bar'); // Normalized
    });

    it('should set correct location information', () => {
      const path = parsePathFromString('this.foo');

      expect(path.loc).not.toBeNull();
      expect(path.loc?.start).toBeDefined();
      expect(path.loc?.end).toBeDefined();
      expect(path.loc?.start.line).toBe(1);
    });
  });

  describe('parsePathExpression() - "." paths', () => {
    it('should parse standalone "." with empty parts', () => {
      const path = parsePathFromString('.');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual([]);
      expect(path.original).toBe('.');
      expect(path.loc).not.toBeNull();
    });

    it('should parse "./foo" with parts ["foo"]', () => {
      const path = parsePathFromString('./foo');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['foo']);
      expect(path.original).toBe('./foo');
      expect(path.loc).not.toBeNull();
    });

    it('should parse "./foo.bar" with parts ["foo", "bar"]', () => {
      const path = parsePathFromString('./foo.bar');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(false);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('./foo.bar');
    });

    it('should parse "./foo/bar" with parts ["foo", "bar"]', () => {
      const path = parsePathFromString('./foo/bar');

      expect(path.type).toBe('PathExpression');
      expect(path.parts).toEqual(['foo', 'bar']);
      expect(path.original).toBe('./foo.bar'); // Second separator normalized to dot
      expect(path.depth).toBe(0);
      expect(path.data).toBe(false);
    });

    it('should parse "./a.b.c" with three-level path', () => {
      const path = parsePathFromString('./a.b.c');

      expect(path.type).toBe('PathExpression');
      expect(path.parts).toEqual(['a', 'b', 'c']);
      expect(path.original).toBe('./a.b.c');
      expect(path.depth).toBe(0);
      expect(path.data).toBe(false);
    });

    it('should set correct location information', () => {
      const path = parsePathFromString('./foo');

      expect(path.loc).not.toBeNull();
      expect(path.loc?.start).toBeDefined();
      expect(path.loc?.end).toBeDefined();
      expect(path.loc?.start.line).toBe(1);
    });
  });

  describe('parsePathExpression() - Special path characteristics', () => {
    it('should create empty parts array for standalone "this"', () => {
      const path = parsePathFromString('this');
      expect(path.parts).toEqual([]);
      expect(path.parts.length).toBe(0);
    });

    it('should create empty parts array for standalone "."', () => {
      const path = parsePathFromString('.');
      expect(path.parts).toEqual([]);
      expect(path.parts.length).toBe(0);
    });

    it('should have depth 0 for all "this" paths', () => {
      expect(parsePathFromString('this').depth).toBe(0);
      expect(parsePathFromString('this.foo').depth).toBe(0);
      expect(parsePathFromString('this.foo.bar').depth).toBe(0);
    });

    it('should have depth 0 for all "." paths', () => {
      expect(parsePathFromString('.').depth).toBe(0);
      expect(parsePathFromString('./foo').depth).toBe(0);
      expect(parsePathFromString('./foo.bar').depth).toBe(0);
    });

    it('should have data false for all special paths', () => {
      expect(parsePathFromString('this').data).toBe(false);
      expect(parsePathFromString('this.foo').data).toBe(false);
      expect(parsePathFromString('.').data).toBe(false);
      expect(parsePathFromString('./foo').data).toBe(false);
    });

    it('should preserve original string for "this" paths', () => {
      expect(parsePathFromString('this').original).toBe('this');
      expect(parsePathFromString('this.foo').original).toBe('this.foo');
    });

    it('should preserve original string for "." paths', () => {
      expect(parsePathFromString('.').original).toBe('.');
      expect(parsePathFromString('./foo').original).toBe('./foo');
    });
  });

  describe('parsePathExpression() - Special path error cases', () => {
    it('should throw error for trailing separator after "this"', () => {
      const template = '{{this.}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier or number after path separator',
      );
    });

    it('should throw error for trailing separator after "."', () => {
      const template = '{{./}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier or number after path separator',
      );
    });

    it('should throw error for multiple consecutive separators in "this" path', () => {
      const template = '{{this..foo}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier or number after path separator',
      );
    });

    it('should throw error for multiple consecutive separators in "." path', () => {
      const template = '{{./foo..bar}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier or number after path separator',
      );
    });
  });

  describe('parsePathExpression() - Parser state after special paths', () => {
    it('should leave parser positioned after standalone "this"', () => {
      const template = '{{this}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      parser.parsePathExpression();

      const currentToken = parser.getCurrentToken();
      expect(currentToken).not.toBeNull();
      expect(currentToken?.type).toBe('CLOSE');
    });

    it('should leave parser positioned after "this.foo"', () => {
      const template = '{{this.foo}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      parser.parsePathExpression();

      const currentToken = parser.getCurrentToken();
      expect(currentToken).not.toBeNull();
      expect(currentToken?.type).toBe('CLOSE');
    });

    it('should leave parser positioned after standalone "."', () => {
      const template = '{{.}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      parser.parsePathExpression();

      const currentToken = parser.getCurrentToken();
      expect(currentToken).not.toBeNull();
      expect(currentToken?.type).toBe('CLOSE');
    });

    it('should leave parser positioned after "./foo"', () => {
      const template = '{{./foo}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      parser.parsePathExpression();

      const currentToken = parser.getCurrentToken();
      expect(currentToken).not.toBeNull();
      expect(currentToken?.type).toBe('CLOSE');
    });
  });

  describe('parsePathExpression() - Scoped vs unscoped distinction', () => {
    it('should be able to distinguish "this" paths by original string', () => {
      const thisPath = parsePathFromString('this');
      const regularPath = parsePathFromString('foo');

      // Scoped check: original starts with "this"
      expect(thisPath.original).toMatch(/^this\b/);
      expect(regularPath.original).not.toMatch(/^this\b/);
    });

    it('should be able to distinguish "." paths by original string', () => {
      const dotPath = parsePathFromString('./foo');
      const regularPath = parsePathFromString('foo');

      // Scoped check: original starts with "."
      expect(dotPath.original).toMatch(/^\./);
      expect(regularPath.original).not.toMatch(/^\./);
    });

    it('should distinguish "this.foo" from regular "foo"', () => {
      const scopedPath = parsePathFromString('this.foo');
      const unscopedPath = parsePathFromString('foo');

      // Both have parts: ['foo'], but differ in original
      expect(scopedPath.parts).toEqual(['foo']);
      expect(unscopedPath.parts).toEqual(['foo']);
      expect(scopedPath.original).toBe('this.foo');
      expect(unscopedPath.original).toBe('foo');
    });
  });
});
