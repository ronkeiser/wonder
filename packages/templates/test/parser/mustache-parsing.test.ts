import { describe, it, expect, beforeEach } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { Parser } from '../../src/parser/parser';
import type { MustacheStatement } from '../../src/parser/ast-nodes';

describe('Parser - MustacheStatement Parsing', () => {
  let lexer: Lexer;
  let parser: Parser;

  beforeEach(() => {
    lexer = new Lexer();
    parser = new Parser(lexer);
  });

  describe('Escaped Mustaches ({{}})', () => {
    it('should parse simple variable {{foo}}', () => {
      parser.setInput('{{foo}}');

      const node = parser.parseMustacheStatement();

      expect(node.type).toBe('MustacheStatement');
      expect(node.escaped).toBe(true);
      expect(node.path.type).toBe('PathExpression');
      expect(node.path.parts).toEqual(['foo']);
      expect(node.path.depth).toBe(0);
      expect(node.path.data).toBe(false);
      expect(node.params).toEqual([]);
      expect(node.hash.pairs).toEqual([]);
    });

    it('should parse nested path {{foo.bar}}', () => {
      parser.setInput('{{foo.bar}}');

      const node = parser.parseMustacheStatement();

      expect(node.type).toBe('MustacheStatement');
      expect(node.escaped).toBe(true);
      expect(node.path.parts).toEqual(['foo', 'bar']);
      expect(node.path.original).toBe('foo.bar');
      expect(node.path.depth).toBe(0);
    });

    it('should parse deeply nested path {{foo.bar.baz}}', () => {
      parser.setInput('{{foo.bar.baz}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.parts).toEqual(['foo', 'bar', 'baz']);
      expect(node.path.original).toBe('foo.bar.baz');
    });

    it('should parse parent reference {{../parent}}', () => {
      parser.setInput('{{../parent}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.depth).toBe(1);
      expect(node.path.parts).toEqual(['parent']);
      expect(node.path.data).toBe(false);
    });

    it('should parse grandparent reference {{../../grand}}', () => {
      parser.setInput('{{../../grand}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.depth).toBe(2);
      expect(node.path.parts).toEqual(['grand']);
    });

    it('should parse parent with nested path {{../foo.bar}}', () => {
      parser.setInput('{{../foo.bar}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.depth).toBe(1);
      expect(node.path.parts).toEqual(['foo', 'bar']);
    });

    it('should parse data variable {{@index}}', () => {
      parser.setInput('{{@index}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.data).toBe(true);
      expect(node.path.parts).toEqual(['index']);
      expect(node.path.depth).toBe(0);
      expect(node.path.original).toBe('@index');
    });

    it('should parse data variable with path {{@root.user}}', () => {
      parser.setInput('{{@root.user}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.data).toBe(true);
      expect(node.path.parts).toEqual(['root', 'user']);
      expect(node.path.original).toBe('@root.user');
    });

    it('should parse {{this}}', () => {
      parser.setInput('{{this}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.parts).toEqual([]);
      expect(node.path.original).toBe('this');
      expect(node.path.depth).toBe(0);
    });

    it('should parse {{this.property}}', () => {
      parser.setInput('{{this.property}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.parts).toEqual(['property']);
      expect(node.path.original).toBe('this.property');
    });

    it('should parse {{./property}}', () => {
      parser.setInput('{{./property}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.parts).toEqual(['property']);
      expect(node.path.depth).toBe(0);
    });

    it('should parse {{.}}', () => {
      parser.setInput('{{.}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(true);
      expect(node.path.parts).toEqual([]);
      expect(node.path.original).toBe('.');
      expect(node.path.depth).toBe(0);
    });
  });

  describe('Unescaped Mustaches ({{{}}}))', () => {
    it('should parse simple unescaped {{{html}}}', () => {
      parser.setInput('{{{html}}}');

      const node = parser.parseMustacheStatement();

      expect(node.type).toBe('MustacheStatement');
      expect(node.escaped).toBe(false);
      expect(node.path.parts).toEqual(['html']);
      expect(node.params).toEqual([]);
      expect(node.hash.pairs).toEqual([]);
    });

    it('should parse unescaped with path {{{user.name}}}', () => {
      parser.setInput('{{{user.name}}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(false);
      expect(node.path.parts).toEqual(['user', 'name']);
      expect(node.path.original).toBe('user.name');
    });

    it('should parse unescaped parent reference {{{../parent}}}', () => {
      parser.setInput('{{{../parent}}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(false);
      expect(node.path.depth).toBe(1);
      expect(node.path.parts).toEqual(['parent']);
    });

    it('should parse unescaped data variable {{{@index}}}', () => {
      parser.setInput('{{{@index}}}');

      const node = parser.parseMustacheStatement();

      expect(node.escaped).toBe(false);
      expect(node.path.data).toBe(true);
      expect(node.path.parts).toEqual(['index']);
    });
  });

  describe('Source Location Tracking', () => {
    it('should track location for entire mustache', () => {
      parser.setInput('{{foo}}');

      const node = parser.parseMustacheStatement();

      expect(node.loc).not.toBeNull();
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.start.column).toBe(0);
      expect(node.loc?.end.line).toBe(1);
      expect(node.loc?.end.column).toBe(7);
    });

    it('should track location for unescaped mustache', () => {
      parser.setInput('{{{html}}}');

      const node = parser.parseMustacheStatement();

      expect(node.loc).not.toBeNull();
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.end.column).toBe(10);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for missing closing }}', () => {
      parser.setInput('{{foo');

      expect(() => parser.parseMustacheStatement()).toThrow('Expected }} to close mustache');
    });

    it('should throw error for missing closing }}} on unescaped', () => {
      parser.setInput('{{{html');

      expect(() => parser.parseMustacheStatement()).toThrow(
        'Expected }}} to close unescaped mustache',
      );
    });

    it('should throw error for mismatched closing ({{ with }}})', () => {
      parser.setInput('{{foo}}}');

      expect(() => parser.parseMustacheStatement()).toThrow();
    });

    it('should throw error for mismatched closing ({{{ with }})', () => {
      parser.setInput('{{{html}}');

      expect(() => parser.parseMustacheStatement()).toThrow();
    });

    it('should throw error for empty mustache {{}}', () => {
      parser.setInput('{{}}');

      expect(() => parser.parseMustacheStatement()).toThrow('Expected identifier');
    });
  });

  describe('V1 Constraints', () => {
    it('should have empty params array', () => {
      parser.setInput('{{foo}}');

      const node = parser.parseMustacheStatement();

      expect(node.params).toEqual([]);
      expect(Array.isArray(node.params)).toBe(true);
    });

    it('should have empty hash with correct structure', () => {
      parser.setInput('{{foo}}');

      const node = parser.parseMustacheStatement();

      expect(node.hash).toBeDefined();
      expect(node.hash.type).toBe('Hash');
      expect(node.hash.pairs).toEqual([]);
      expect(Array.isArray(node.hash.pairs)).toBe(true);
    });
  });

  describe('Whitespace Handling', () => {
    it('should handle whitespace inside mustache {{  foo  }}', () => {
      parser.setInput('{{  foo  }}');

      const node = parser.parseMustacheStatement();

      expect(node.path.parts).toEqual(['foo']);
      expect(node.path.original).toBe('foo');
    });

    it('should handle whitespace in paths {{ foo.bar.baz }}', () => {
      parser.setInput('{{ foo.bar.baz }}');

      const node = parser.parseMustacheStatement();

      expect(node.path.parts).toEqual(['foo', 'bar', 'baz']);
    });
  });
});
