import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { Parser } from '../../src/parser/parser';
import { ParserError } from '../../src/parser/parser-error';

describe('Parser - Unclosed Block Detection', () => {
  const createParser = (template: string): Parser => {
    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    return parser;
  };

  describe('Single Unclosed Blocks', () => {
    it('should detect unclosed if block', () => {
      const template = '{{#if condition}}Hello';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
      expect(() => createParser(template).parseProgram()).toThrow(/if/);
    });

    it('should detect unclosed each block', () => {
      const template = '{{#each items}}Item';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
      expect(() => createParser(template).parseProgram()).toThrow(/each/);
    });

    it('should detect unclosed unless block', () => {
      const template = '{{#unless condition}}Content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
      expect(() => createParser(template).parseProgram()).toThrow(/unless/);
    });

    it('should detect unclosed with block', () => {
      const template = '{{#with user}}Name: {{name}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
      expect(() => createParser(template).parseProgram()).toThrow(/with/);
    });

    it('should detect unclosed custom helper block', () => {
      const template = '{{#myHelper arg}}Content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
      expect(() => createParser(template).parseProgram()).toThrow(/myHelper/);
    });
  });

  describe('Opening Location in Error Message', () => {
    it('should include line number where block was opened', () => {
      const template = '{{#if condition}}Hello';

      expect(() => createParser(template).parseProgram()).toThrow(/line 1/i);
    });

    it('should report correct line for multi-line template', () => {
      const template = 'Line 1\nLine 2\n{{#if test}}\nContent';

      expect(() => createParser(template).parseProgram()).toThrow(/line 3/i);
    });

    it('should report opening line for nested unclosed block', () => {
      const template = '{{#if outer}}\n  {{#if inner}}\n    Content';

      // Should report the innermost unclosed block
      expect(() => createParser(template).parseProgram()).toThrow(/line 2/i);
      expect(() => createParser(template).parseProgram()).toThrow(/inner/);
    });
  });

  describe('Unclosed Block with Content', () => {
    it('should detect unclosed block with mustaches inside', () => {
      const template = '{{#if condition}}{{name}} {{age}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
    });

    it('should detect unclosed block with content before it', () => {
      const template = 'Hello {{name}}\n{{#if test}}Content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
    });

    it('should detect unclosed block with multi-line content', () => {
      const template = '{{#if condition}}\n  Line 1\n  Line 2\n  Line 3';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
    });
  });

  describe('Nested Unclosed Blocks', () => {
    it('should detect innermost unclosed block when outer is also unclosed', () => {
      const template = '{{#if outer}}{{#if inner}}Content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      // Should report the innermost block that's unclosed
      expect(() => createParser(template).parseProgram()).toThrow(/inner/);
    });

    it('should detect outer block when inner is properly closed', () => {
      const template = '{{#if outer}}{{#if inner}}Content{{/if}}More content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/outer/);
    });

    it('should handle three levels with innermost unclosed', () => {
      const template = '{{#if a}}{{#if b}}{{#if c}}Content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/c/);
    });

    it('should handle three levels with middle unclosed', () => {
      const template = '{{#if a}}{{#if b}}{{#if c}}Content{{/if}}More';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/b/);
    });

    it('should handle three levels with outermost unclosed', () => {
      const template = '{{#if a}}{{#if b}}Content{{/if}}{{#if c}}More{{/if}}Final';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/a/);
    });
  });

  describe('Unclosed Blocks with Else Clauses', () => {
    it('should detect unclosed block that has an else clause', () => {
      const template = '{{#if condition}}yes{{else}}no';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
      expect(() => createParser(template).parseProgram()).toThrow(/if/);
    });

    it('should detect unclosed block when EOF in main branch before else', () => {
      const template = '{{#if condition}}content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
    });

    it('should detect unclosed block when EOF in inverse branch', () => {
      const template = '{{#if condition}}yes{{else}}no content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
    });

    it('should detect nested unclosed block in else branch', () => {
      const template = '{{#if outer}}yes{{else}}{{#if inner}}no';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/inner/);
    });
  });

  describe('Mixed Block Types Unclosed', () => {
    it('should detect unclosed each inside if', () => {
      const template = '{{#if condition}}{{#each items}}Item';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/each/);
    });

    it('should detect unclosed unless inside each', () => {
      const template = '{{#each items}}{{#unless deleted}}Item';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unless/);
    });

    it('should detect unclosed with inside unless', () => {
      const template = '{{#unless disabled}}{{#with user}}Name';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/with/);
    });
  });

  describe('Edge Cases', () => {
    it('should detect unclosed block with empty content', () => {
      const template = '{{#if condition}}';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
    });

    it('should detect unclosed block with only whitespace', () => {
      const template = '{{#if condition}}   \n\n  ';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
    });

    it('should detect unclosed block after valid complete blocks', () => {
      const template = '{{#if first}}yes{{/if}}{{#if second}}no';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/second/);
    });

    it('should detect unclosed block with comment inside', () => {
      const template = '{{#if condition}}{{! comment }}content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
    });

    it('should detect unclosed block with complex path', () => {
      const template = '{{#if user.profile.active}}Content';

      expect(() => createParser(template).parseProgram()).toThrow(ParserError);
      expect(() => createParser(template).parseProgram()).toThrow(/unclosed block/i);
      expect(() => createParser(template).parseProgram()).toThrow(/if/);
    });
  });

  describe('Error Message Quality', () => {
    it('should have clear error message format', () => {
      const template = '{{#if test}}content';
      const parser = createParser(template);

      try {
        parser.parseProgram();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ParserError);
        const message = (error as ParserError).message.toLowerCase();
        // Error should mention: unclosed, block name, and location
        expect(message).toMatch(/unclosed/);
        expect(message).toMatch(/if/);
        expect(message).toMatch(/line/);
      }
    });

    it('should distinguish between different unclosed blocks', () => {
      const template1 = '{{#if test}}content';
      const template2 = '{{#each items}}content';

      const parser1 = createParser(template1);
      const parser2 = createParser(template2);

      let error1: Error | null = null;
      let error2: Error | null = null;

      try {
        parser1.parseProgram();
      } catch (e) {
        error1 = e as Error;
      }

      try {
        parser2.parseProgram();
      } catch (e) {
        error2 = e as Error;
      }

      expect(error1).toBeTruthy();
      expect(error2).toBeTruthy();
      expect(error1!.message).toContain('if');
      expect(error2!.message).toContain('each');
      expect(error1!.message).not.toContain('each');
      expect(error2!.message).not.toContain('if');
    });
  });

  describe('Valid Templates Should Not Error', () => {
    it('should not error on properly closed block', () => {
      const template = '{{#if condition}}content{{/if}}';

      expect(() => createParser(template).parseProgram()).not.toThrow();
    });

    it('should not error on nested properly closed blocks', () => {
      const template = '{{#if outer}}{{#if inner}}content{{/if}}{{/if}}';

      expect(() => createParser(template).parseProgram()).not.toThrow();
    });

    it('should not error on block with else properly closed', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}}';

      expect(() => createParser(template).parseProgram()).not.toThrow();
    });

    it('should not error on empty template', () => {
      const template = '';

      expect(() => createParser(template).parseProgram()).not.toThrow();
    });

    it('should not error on template with only mustaches', () => {
      const template = '{{name}} {{age}}';

      expect(() => createParser(template).parseProgram()).not.toThrow();
    });
  });
});
