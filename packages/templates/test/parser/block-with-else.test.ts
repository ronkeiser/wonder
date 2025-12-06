import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type {
  BlockStatement,
  ContentStatement,
  MustacheStatement,
} from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser - Block Statements with Else', () => {
  const createParser = (template: string): Parser => {
    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    return parser;
  };

  describe('Basic Else Blocks', () => {
    it('should parse block with simple else', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      const block = ast.body[0] as BlockStatement;

      expect(block.type).toBe('BlockStatement');
      expect(block.path.original).toBe('if');
      expect(block.program).toBeTruthy();
      expect(block.inverse).toBeTruthy();
    });

    it('should parse main program content correctly', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.program!.body).toHaveLength(1);

      const mainContent = block.program!.body[0] as ContentStatement;
      expect(mainContent.type).toBe('ContentStatement');
      expect(mainContent.value).toBe('yes');
    });

    it('should parse inverse program content correctly', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.inverse).toBeTruthy();
      expect(block.inverse!.body).toHaveLength(1);

      const inverseContent = block.inverse!.body[0] as ContentStatement;
      expect(inverseContent.type).toBe('ContentStatement');
      expect(inverseContent.value).toBe('no');
    });

    it('should parse block without else (inverse should be null)', () => {
      const template = '{{#if condition}}yes{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.type).toBe('BlockStatement');
      expect(block.inverse).toBeNull();
    });
  });

  describe('Multiple Statements in Each Block', () => {
    it('should handle multiple statements before else', () => {
      const template = '{{#if condition}}line1\nline2\n{{foo}}{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;

      // Main program should have: content "line1\nline2\n" + mustache {{foo}}
      expect(block.program!.body).toHaveLength(2);
      expect(block.program!.body[0].type).toBe('ContentStatement');
      expect(block.program!.body[1].type).toBe('MustacheStatement');
    });

    it('should handle multiple statements after else', () => {
      const template = '{{#if condition}}yes{{else}}line1\nline2\n{{bar}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;

      // Inverse program should have: content "line1\nline2\n" + mustache {{bar}}
      expect(block.inverse!.body).toHaveLength(2);
      expect(block.inverse!.body[0].type).toBe('ContentStatement');
      expect(block.inverse!.body[1].type).toBe('MustacheStatement');
    });

    it('should handle mustaches in both branches', () => {
      const template = '{{#if condition}}{{foo}}{{else}}{{bar}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;

      expect(block.program!.body).toHaveLength(1);
      const mainMustache = block.program!.body[0] as MustacheStatement;
      expect(mainMustache.type).toBe('MustacheStatement');
      expect(mainMustache.path.original).toBe('foo');

      expect(block.inverse!.body).toHaveLength(1);
      const inverseMustache = block.inverse!.body[0] as MustacheStatement;
      expect(inverseMustache.type).toBe('MustacheStatement');
      expect(inverseMustache.path.original).toBe('bar');
    });
  });

  describe('Complex Content', () => {
    it('should handle whitespace in both branches', () => {
      const template = '{{#if condition}}  yes  {{else}}  no  {{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;

      const mainContent = block.program!.body[0] as ContentStatement;
      expect(mainContent.value).toBe('  yes  ');

      const inverseContent = block.inverse!.body[0] as ContentStatement;
      expect(inverseContent.value).toBe('  no  ');
    });

    it('should handle newlines in both branches', () => {
      const template = '{{#if condition}}\nyes\n{{else}}\nno\n{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;

      const mainContent = block.program!.body[0] as ContentStatement;
      expect(mainContent.value).toBe('\nyes\n');

      const inverseContent = block.inverse!.body[0] as ContentStatement;
      expect(inverseContent.value).toBe('\nno\n');
    });

    it('should handle empty main branch', () => {
      const template = '{{#if condition}}{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.program!.body).toHaveLength(0);
      expect(block.inverse!.body).toHaveLength(1);
    });

    it('should handle empty inverse branch', () => {
      const template = '{{#if condition}}yes{{else}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.program!.body).toHaveLength(1);
      expect(block.inverse!.body).toHaveLength(0);
    });

    it('should handle both branches empty', () => {
      const template = '{{#if condition}}{{else}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.program!.body).toHaveLength(0);
      expect(block.inverse!.body).toHaveLength(0);
    });
  });

  describe('Different Helper Names', () => {
    it('should work with #each helper', () => {
      const template = '{{#each items}}{{this}}{{else}}empty{{/each}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('each');
      expect(block.program!.body).toHaveLength(1);
      expect(block.inverse!.body).toHaveLength(1);
    });

    it('should work with #unless helper', () => {
      const template = '{{#unless condition}}main{{else}}inverse{{/unless}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('unless');
      expect(block.program!.body).toHaveLength(1);
      expect(block.inverse!.body).toHaveLength(1);
    });

    it('should work with custom helper names', () => {
      const template = '{{#myHelper}}main{{else}}inverse{{/myHelper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('myHelper');
      expect(block.program!.body).toHaveLength(1);
      expect(block.inverse!.body).toHaveLength(1);
    });
  });

  describe('Nested Blocks with Else', () => {
    it('should handle nested blocks in main branch', () => {
      const template = '{{#if outer}}{{#if inner}}nested{{/if}}{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.path.original).toBe('if');
      expect(outerBlock.program!.body).toHaveLength(1);

      const innerBlock = outerBlock.program!.body[0] as BlockStatement;
      expect(innerBlock.type).toBe('BlockStatement');
      expect(innerBlock.path.original).toBe('if');
    });

    it('should handle nested blocks in inverse branch', () => {
      const template = '{{#if outer}}yes{{else}}{{#if inner}}nested{{/if}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.inverse).toBeTruthy();
      expect(outerBlock.inverse!.body).toHaveLength(1);

      const innerBlock = outerBlock.inverse!.body[0] as BlockStatement;
      expect(innerBlock.type).toBe('BlockStatement');
      expect(innerBlock.path.original).toBe('if');
    });

    it('should handle nested blocks with else in both branches', () => {
      const template =
        '{{#if outer}}{{#if inner}}a{{else}}b{{/if}}{{else}}{{#if other}}c{{else}}d{{/if}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;

      // Check main branch has nested block with else
      const mainNested = outerBlock.program!.body[0] as BlockStatement;
      expect(mainNested.path.original).toBe('if');
      expect(mainNested.inverse).toBeTruthy();

      // Check inverse branch has nested block with else
      const inverseNested = outerBlock.inverse!.body[0] as BlockStatement;
      expect(inverseNested.path.original).toBe('if');
      expect(inverseNested.inverse).toBeTruthy();
    });
  });

  describe('Location Tracking', () => {
    it('should track location for block with else', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.loc).toBeTruthy();
      expect(block.loc!.start.line).toBe(1);
      expect(block.loc!.start.column).toBe(0);
      expect(block.loc!.end.column).toBe(template.length);
    });

    it('should track location for main program', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.program!.loc).toBeTruthy();
    });

    it('should track location for inverse program', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.inverse).toBeTruthy();
      expect(block.inverse!.loc).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple sequential blocks with else', () => {
      const template = '{{#if a}}a1{{else}}a2{{/if}}{{#if b}}b1{{else}}b2{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(2);

      const firstBlock = ast.body[0] as BlockStatement;
      expect(firstBlock.path.original).toBe('if');
      expect(firstBlock.inverse).toBeTruthy();

      const secondBlock = ast.body[1] as BlockStatement;
      expect(secondBlock.path.original).toBe('if');
      expect(secondBlock.inverse).toBeTruthy();
    });

    it('should handle block with else followed by content', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}} after';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(2);
      expect(ast.body[0].type).toBe('BlockStatement');
      expect(ast.body[1].type).toBe('ContentStatement');
    });

    it('should handle content before block with else', () => {
      const template = 'before {{#if condition}}yes{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(2);
      expect(ast.body[0].type).toBe('ContentStatement');
      expect(ast.body[1].type).toBe('BlockStatement');
    });
  });

  describe('Real-world Templates', () => {
    it('should parse typical if/else template', () => {
      const template = `{{#if user}}
  Welcome, {{user.name}}!
{{else}}
  Please log in.
{{/if}}`;
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('if');

      // Main branch: content + mustache + content
      expect(block.program!.body.length).toBeGreaterThan(0);

      // Inverse branch: content
      expect(block.inverse!.body.length).toBeGreaterThan(0);
    });

    it('should parse each with empty message', () => {
      const template = `{{#each items}}
  <li>{{this}}</li>
{{else}}
  <p>No items found.</p>
{{/each}}`;
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('each');
      expect(block.program!.body.length).toBeGreaterThan(0);
      expect(block.inverse!.body.length).toBeGreaterThan(0);
    });
  });
});
