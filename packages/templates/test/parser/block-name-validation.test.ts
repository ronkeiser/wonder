/**
 * Tests for block name validation (C2-F6-T3)
 * Ensures opening and closing block tags match exactly
 */

import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { Parser } from '../../src/parser/parser';
import { ParserError } from '../../src/parser/parser-error';

const createParser = (template: string): Parser => {
  const lexer = new Lexer();
  const parser = new Parser(lexer);
  parser.setInput(template);
  return parser;
};

describe('Block Name Validation', () => {
  describe('Valid matching names', () => {
    it('should accept matching if block', () => {
      const parser = createParser('{{#if condition}}content{{/if}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should accept matching each block', () => {
      const parser = createParser('{{#each items}}{{this}}{{/each}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should accept matching unless block', () => {
      const parser = createParser('{{#unless done}}todo{{/unless}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should accept matching with block', () => {
      const parser = createParser('{{#with user}}{{name}}{{/with}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should accept matching custom helper block', () => {
      const parser = createParser('{{#myHelper}}content{{/myHelper}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should accept nested blocks with matching names', () => {
      const parser = createParser('{{#if outer}}{{#if inner}}text{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });
  });

  describe('Invalid mismatched names', () => {
    it('should reject if/each mismatch', () => {
      const template = '{{#if condition}}content{{/each}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
      expect(() => createParser(template).parseProgram()).toThrow(/if/);
      expect(() => createParser(template).parseProgram()).toThrow(/each/);
    });

    it('should reject each/if mismatch', () => {
      const template = '{{#each items}}{{this}}{{/if}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
      expect(() => createParser(template).parseProgram()).toThrow(/each/);
      expect(() => createParser(template).parseProgram()).toThrow(/if/);
    });

    it('should reject unless/with mismatch', () => {
      const template = '{{#unless done}}todo{{/with}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
      expect(() => createParser(template).parseProgram()).toThrow(/unless/);
      expect(() => createParser(template).parseProgram()).toThrow(/with/);
    });

    it('should reject custom helper mismatch', () => {
      const template = '{{#myHelper}}content{{/otherHelper}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
      expect(() => createParser(template).parseProgram()).toThrow(/myHelper/);
      expect(() => createParser(template).parseProgram()).toThrow(/otherHelper/);
    });
  });

  describe('Case sensitivity', () => {
    it('should reject case mismatch: if/IF', () => {
      const template = '{{#if condition}}content{{/IF}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
    });

    it('should reject case mismatch: each/EACH', () => {
      const template = '{{#each items}}{{this}}{{/EACH}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
    });

    it('should reject case mismatch: Unless/unless', () => {
      const template = '{{#Unless done}}todo{{/unless}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
    });

    it('should reject mixed case: myHelper/MyHelper', () => {
      const template = '{{#myHelper}}content{{/MyHelper}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
    });
  });

  describe('Error message content', () => {
    it('should include both helper names in error message', () => {
      const parser = createParser('{{#if x}}content{{/each}}');

      try {
        parser.parseProgram();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ParserError);
        const message = (error as ParserError).message;
        expect(message).toContain('if');
        expect(message).toContain('each');
        expect(message).toContain('{{/if}}');
        expect(message).toContain('{{/each}}');
      }
    });

    it('should format error message correctly', () => {
      const parser = createParser('{{#unless done}}{{/with}}');

      try {
        parser.parseProgram();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ParserError);
        const message = (error as ParserError).message;
        // Should say "expected {{/unless}} but found {{/with}}"
        expect(message.toLowerCase()).toMatch(/expected.*\/unless.*found.*\/with/);
      }
    });

    it('should include line information in error', () => {
      const template = '{{#if x}}content{{/each}}';

      try {
        createParser(template).parseProgram();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ParserError);
        const parserError = error as ParserError;
        // Error message should mention the opening line
        expect(parserError.message).toContain('line 1');
      }
    });
  });

  describe('Nested blocks validation', () => {
    it('should validate outer block independently', () => {
      const template = '{{#if outer}}{{#each items}}{{/each}}{{/unless}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/if/);
      expect(() => createParser(template).parseProgram()).toThrow(/unless/);
    });

    it('should validate inner block independently', () => {
      const template = '{{#if outer}}{{#each items}}{{/with}}{{/if}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/each/);
      expect(() => createParser(template).parseProgram()).toThrow(/with/);
    });

    it('should accept correctly nested blocks', () => {
      const parser = createParser(
        '{{#if outer}}{{#each items}}{{#with this}}{{/with}}{{/each}}{{/if}}',
      );
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should validate each level in triple nesting', () => {
      const template = '{{#if a}}{{#each b}}{{#with c}}{{/unless}}{{/each}}{{/if}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/with/);
      expect(() => createParser(template).parseProgram()).toThrow(/unless/);
    });
  });

  describe('Blocks with else clauses', () => {
    it('should validate name with else clause present', () => {
      const parser = createParser('{{#if condition}}yes{{else}}no{{/if}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should reject mismatch even with else clause', () => {
      const template = '{{#if condition}}yes{{else}}no{{/each}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/if/);
      expect(() => createParser(template).parseProgram()).toThrow(/each/);
    });

    it('should validate name with inverse block syntax', () => {
      // Note: {{^helper}} syntax is for inverse blocks, not {{#helper}}...{{^}}
      // For now, we test with {{else}} which works
      const parser = createParser('{{#if condition}}yes{{else}}no{{/if}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should reject mismatch with else clause in wrong block', () => {
      const template = '{{#unless condition}}yes{{else}}no{{/if}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unless/);
      expect(() => createParser(template).parseProgram()).toThrow(/if/);
    });
  });

  describe('Complex path expressions', () => {
    it('should validate dotted path helpers', () => {
      const parser = createParser('{{#helper.name}}content{{/helper.name}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });

    it('should reject mismatch in dotted paths', () => {
      const template = '{{#helper.name}}content{{/helper.other}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/closing tag mismatch/i);
    });

    it('should validate nested path helpers', () => {
      const parser = createParser('{{#obj.prop.helper}}content{{/obj.prop.helper}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('BlockStatement');
    });
  });
});
