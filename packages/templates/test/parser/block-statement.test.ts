import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type { BlockStatement, ContentStatement } from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser - BlockStatement Parsing (Simple Blocks)', () => {
  let lexer: Lexer;
  let parser: Parser;

  beforeEach(() => {
    lexer = new Lexer();
    parser = new Parser(lexer);
  });

  describe('Basic Block Structure', () => {
    it('should parse simple block {{#if condition}}content{{/if}}', () => {
      parser.setInput('{{#if condition}}content{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.type).toBe('BlockStatement');
      expect(node.path.type).toBe('PathExpression');
      expect(node.path.parts).toEqual(['if']);
      expect(node.path.original).toBe('if');
      expect(node.params).toEqual([]);
      expect(node.hash.pairs).toEqual([]);
      expect(node.inverse).toBeNull();
    });

    it('should parse block with each helper {{#each items}}{{/each}}', () => {
      parser.setInput('{{#each items}}item{{/each}}');

      const node = parser.parseBlockStatement();

      expect(node.type).toBe('BlockStatement');
      expect(node.path.parts).toEqual(['each']);
      expect(node.path.original).toBe('each');
    });

    it('should parse block with unless helper {{#unless ready}}{{/unless}}', () => {
      parser.setInput('{{#unless ready}}waiting{{/unless}}');

      const node = parser.parseBlockStatement();

      expect(node.type).toBe('BlockStatement');
      expect(node.path.parts).toEqual(['unless']);
      expect(node.path.original).toBe('unless');
    });

    it('should parse block with with helper {{#with user}}{{/with}}', () => {
      parser.setInput('{{#with user}}{{name}}{{/with}}');

      const node = parser.parseBlockStatement();

      expect(node.type).toBe('BlockStatement');
      expect(node.path.parts).toEqual(['with']);
      expect(node.path.original).toBe('with');
    });
  });

  describe('Helper Name Extraction', () => {
    it('should extract simple helper name correctly', () => {
      parser.setInput('{{#if x}}y{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.path.parts).toEqual(['if']);
      expect(node.path.original).toBe('if');
      expect(node.path.depth).toBe(0);
      expect(node.path.data).toBe(false);
    });

    it('should extract nested helper name {{#helper.nested}}{{/helper.nested}}', () => {
      parser.setInput('{{#helper.nested}}content{{/helper.nested}}');

      const node = parser.parseBlockStatement();

      expect(node.path.parts).toEqual(['helper', 'nested']);
      expect(node.path.original).toBe('helper.nested');
    });

    it('should handle custom helper names', () => {
      parser.setInput('{{#myCustomHelper}}content{{/myCustomHelper}}');

      const node = parser.parseBlockStatement();

      expect(node.path.parts).toEqual(['myCustomHelper']);
      expect(node.path.original).toBe('myCustomHelper');
    });
  });

  describe('Program Content Parsing', () => {
    it('should parse empty block content', () => {
      parser.setInput('{{#if condition}}{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.program).not.toBeNull();
      expect(node.program?.type).toBe('Program');
      expect(node.program?.body).toEqual([]);
    });

    it('should parse single content statement in block', () => {
      parser.setInput('{{#if condition}}Hello World{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.program?.body).toHaveLength(1);
      expect(node.program?.body[0].type).toBe('ContentStatement');
      const content = node.program?.body[0] as ContentStatement;
      expect(content.value).toBe('Hello World');
    });

    it('should parse multiple statements in block', () => {
      parser.setInput('{{#if condition}}Hello {{name}}!{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.program?.body).toHaveLength(3);
      expect(node.program?.body[0].type).toBe('ContentStatement');
      expect(node.program?.body[1].type).toBe('MustacheStatement');
      expect(node.program?.body[2].type).toBe('ContentStatement');
    });

    it('should parse block with nested mustaches', () => {
      parser.setInput('{{#if user}}Name: {{user.name}}, Age: {{user.age}}{{/if}}');

      const node = parser.parseBlockStatement();

      // Debug: let's see what we actually got
      // The template is: "Name: {{user.name}}, Age: {{user.age}}"
      // Should be: Content, Mustache, Content, Mustache (4 statements)
      expect(node.program?.body).toHaveLength(4);
      // Content "Name: "
      expect(node.program?.body[0].type).toBe('ContentStatement');
      // Mustache {{user.name}}
      expect(node.program?.body[1].type).toBe('MustacheStatement');
      // Content ", Age: "
      expect(node.program?.body[2].type).toBe('ContentStatement');
      // Mustache {{user.age}}
      expect(node.program?.body[3].type).toBe('MustacheStatement');
    });

    it('should parse block with comments', () => {
      parser.setInput('{{#if condition}}{{! this is a comment }}content{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.program?.body).toHaveLength(2);
      expect(node.program?.body[0].type).toBe('CommentStatement');
      expect(node.program?.body[1].type).toBe('ContentStatement');
    });

    it('should parse block with whitespace and newlines', () => {
      const template = `{{#if condition}}
  Line 1
  Line 2
{{/if}}`;

      parser.setInput(template);
      const node = parser.parseBlockStatement();

      expect(node.program?.body).toHaveLength(1);
      expect(node.program?.body[0].type).toBe('ContentStatement');
    });
  });

  describe('Location Tracking', () => {
    it('should track location spanning entire block', () => {
      parser.setInput('{{#if x}}content{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.loc).not.toBeNull();
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.start.column).toBe(0);
      expect(node.loc?.end.line).toBe(1);
      // Location should span to end of closing tag
      expect(node.loc?.end.column).toBeGreaterThan(0);
    });

    it('should track location for multi-line blocks', () => {
      const template = `{{#if condition}}
content
{{/if}}`;

      parser.setInput(template);
      const node = parser.parseBlockStatement();

      expect(node.loc).not.toBeNull();
      expect(node.loc?.start.line).toBe(1);
      expect(node.loc?.end.line).toBe(3);
    });
  });

  describe('Nested Content Parsing', () => {
    it('should parse nested content into program.body', () => {
      parser.setInput('{{#if x}}<div>{{y}}</div>{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.program?.body).toHaveLength(3);
      expect(node.program?.body[0].type).toBe('ContentStatement');
      expect(node.program?.body[1].type).toBe('MustacheStatement');
      expect(node.program?.body[2].type).toBe('ContentStatement');
    });

    it('should parse complex HTML content', () => {
      const template = `{{#if user}}<div class="profile">
  <h1>{{user.name}}</h1>
  <p>{{user.bio}}</p>
</div>{{/if}}`;

      parser.setInput(template);
      const node = parser.parseBlockStatement();

      expect(node.program?.body.length).toBeGreaterThan(0);
      // Should contain mix of content and mustache statements
      const hasContent = node.program?.body.some((stmt) => stmt.type === 'ContentStatement');
      const hasMustache = node.program?.body.some((stmt) => stmt.type === 'MustacheStatement');
      expect(hasContent).toBe(true);
      expect(hasMustache).toBe(true);
    });
  });

  describe('V1 Feature Compliance', () => {
    it('should set params to empty array (V1 has no parameters)', () => {
      parser.setInput('{{#if condition}}content{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.params).toEqual([]);
    });

    it('should set hash.pairs to empty array (V1 has no named params)', () => {
      parser.setInput('{{#if condition}}content{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.hash.type).toBe('Hash');
      expect(node.hash.pairs).toEqual([]);
    });

    it('should set inverse to null (no else block in this task)', () => {
      parser.setInput('{{#if condition}}content{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.inverse).toBeNull();
    });

    it('should set all strip flags to false (V2 feature)', () => {
      parser.setInput('{{#if condition}}content{{/if}}');

      const node = parser.parseBlockStatement();

      expect(node.openStrip.open).toBe(false);
      expect(node.openStrip.close).toBe(false);
      expect(node.inverseStrip.open).toBe(false);
      expect(node.inverseStrip.close).toBe(false);
      expect(node.closeStrip.open).toBe(false);
      expect(node.closeStrip.close).toBe(false);
    });
  });

  describe('Error Handling - Block Name Validation', () => {
    it('should throw error for mismatched block names', () => {
      parser.setInput('{{#if condition}}content{{/each}}');

      expect(() => parser.parseBlockStatement()).toThrow(/mismatch/i);
    });

    it('should throw error with both helper names', () => {
      parser.setInput('{{#if condition}}content{{/each}}');

      try {
        parser.parseBlockStatement();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toMatch(/if/);
        expect(error.message).toMatch(/each/);
      }
    });

    it('should throw error for case-sensitive name mismatch', () => {
      parser.setInput('{{#if condition}}content{{/IF}}');

      expect(() => parser.parseBlockStatement()).toThrow(/mismatch/i);
    });

    it('should throw error when closing different nested helper', () => {
      parser.setInput('{{#helper1}}content{{/helper2}}');

      try {
        parser.parseBlockStatement();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toMatch(/helper1/);
        expect(error.message).toMatch(/helper2/);
      }
    });
  });

  describe('Error Handling - Missing Closing Tag', () => {
    it('should throw error for unclosed block (EOF)', () => {
      parser.setInput('{{#if condition}}content');

      expect(() => parser.parseBlockStatement()).toThrow(/expected/i);
    });

    it('should throw error for missing closing tag name', () => {
      parser.setInput('{{#if condition}}content{{/}}');

      expect(() => parser.parseBlockStatement()).toThrow();
    });
  });

  describe('Error Handling - Malformed Blocks', () => {
    it('should throw error for missing }} after helper name', () => {
      parser.setInput('{{#if condition');

      expect(() => parser.parseBlockStatement()).toThrow(/expected.*}}/i);
    });

    it('should throw error for missing }} after closing tag', () => {
      parser.setInput('{{#if x}}content{{/if');

      expect(() => parser.parseBlockStatement()).toThrow(/expected.*}}/i);
    });
  });
});
