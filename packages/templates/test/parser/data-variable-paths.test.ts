import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type { PathExpression } from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser - Data Variable PathExpression', () => {
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
    parser.advance(); // Skip OPEN token to position at first token (DATA or ID)
    return parser.parsePathExpression();
  }

  describe('parsePathExpression() - Data variables', () => {
    it('should parse simple data variable @index', () => {
      const path = parsePathFromString('@index');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['index']);
      expect(path.original).toBe('@index');
      expect(path.loc).not.toBeNull();
    });

    it('should parse data variable @key', () => {
      const path = parsePathFromString('@key');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['key']);
      expect(path.original).toBe('@key');
    });

    it('should parse data variable @first', () => {
      const path = parsePathFromString('@first');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['first']);
      expect(path.original).toBe('@first');
    });

    it('should parse data variable @last', () => {
      const path = parsePathFromString('@last');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['last']);
      expect(path.original).toBe('@last');
    });

    it('should parse data variable @root', () => {
      const path = parsePathFromString('@root');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['root']);
      expect(path.original).toBe('@root');
    });

    it('should parse data variable with nested path @root.user', () => {
      const path = parsePathFromString('@root.user');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['root', 'user']);
      expect(path.original).toBe('@root.user');
      expect(path.loc).not.toBeNull();
    });

    it('should parse data variable with three-level nested path', () => {
      const path = parsePathFromString('@root.user.name');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['root', 'user', 'name']);
      expect(path.original).toBe('@root.user.name');
    });

    it('should parse data variable with slash notation', () => {
      const path = parsePathFromString('@root/user/name');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['root', 'user', 'name']);
      expect(path.original).toBe('@root.user.name'); // Normalized to dot notation
    });

    it('should parse data variable with mixed dot and slash notation', () => {
      const path = parsePathFromString('@root.user/profile');

      expect(path.type).toBe('PathExpression');
      expect(path.data).toBe(true);
      expect(path.depth).toBe(0);
      expect(path.parts).toEqual(['root', 'user', 'profile']);
      expect(path.original).toBe('@root.user.profile');
    });

    it('should always set depth to 0 for data variables', () => {
      const path1 = parsePathFromString('@index');
      const path2 = parsePathFromString('@root.deeply.nested.path');

      expect(path1.depth).toBe(0);
      expect(path2.depth).toBe(0);
    });

    it('should set correct location information', () => {
      const path = parsePathFromString('@index');

      expect(path.loc).not.toBeNull();
      expect(path.loc?.start).toBeDefined();
      expect(path.loc?.end).toBeDefined();
      expect(path.loc?.start.line).toBe(1);
      expect(path.loc?.start.column).toBe(2); // After {{
    });

    it('should set correct location for nested data paths', () => {
      const path = parsePathFromString('@root.user.name');

      expect(path.loc).not.toBeNull();
      expect(path.loc?.start).toBeDefined();
      expect(path.loc?.end).toBeDefined();
    });
  });

  describe('parsePathExpression() - Data variable error cases', () => {
    it('should throw error for @ without identifier', () => {
      const template = '{{@}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier after @ in data variable',
      );
    });

    it('should throw error for @ followed by separator', () => {
      const template = '{{@.foo}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier after @ in data variable',
      );
    });

    it('should throw error for trailing separator in data path', () => {
      const template = '{{@root.}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier, number, or bracket literal after path separator',
      );
    });

    it('should throw error for multiple consecutive separators in data path', () => {
      const template = '{{@root..user}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      expect(() => parser.parsePathExpression()).toThrow(
        'Expected identifier, number, or bracket literal after path separator',
      );
    });
  });

  describe('parsePathExpression() - Parser state after data variables', () => {
    it('should leave parser positioned after the data path', () => {
      const template = '{{@index}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      parser.parsePathExpression();

      // After parsing, should be at CLOSE token
      const currentToken = parser.getCurrentToken();
      expect(currentToken).not.toBeNull();
      expect(currentToken?.type).toBe('CLOSE');
    });

    it('should handle nested data path correctly', () => {
      const template = '{{@root.user.name}}';
      parser.setInput(template);
      parser.advance(); // Skip OPEN

      const path = parser.parsePathExpression();

      expect(path.parts).toEqual(['root', 'user', 'name']);
      expect(parser.getCurrentToken()?.type).toBe('CLOSE');
    });
  });
});
