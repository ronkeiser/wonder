import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type {
  BlockStatement,
  BooleanLiteral,
  CommentStatement,
  ContentStatement,
  MustacheStatement,
  NumberLiteral,
  PathExpression,
  Program,
  StringLiteral,
} from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

/**
 * Integration Tests for Parser (Feature 2.9)
 *
 * These tests verify that all parser features work correctly together
 * in real-world template scenarios. They test complete templates with
 * multiple statement types, complex nesting, and edge cases.
 */
describe('Parser Integration Tests', () => {
  describe('Complete Templates (C2-F9-T1)', () => {
    it('parses simple variable template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('Hello {{name}}!');

      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body).toHaveLength(3);

      // Content before
      const content1 = program.body[0] as ContentStatement;
      expect(content1.type).toBe('ContentStatement');
      expect(content1.value).toBe('Hello ');

      // Mustache
      const mustache = program.body[1] as MustacheStatement;
      expect(mustache.type).toBe('MustacheStatement');
      expect((mustache.path as PathExpression).parts).toEqual(['name']);

      // Content after
      const content2 = program.body[2] as ContentStatement;
      expect(content2.type).toBe('ContentStatement');
      expect(content2.value).toBe('!');
    });

    it('parses template with if block', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if condition}}yes{{/if}}');

      const program = parser.parse();

      expect(program.body).toHaveLength(1);
      const block = program.body[0] as BlockStatement;
      expect(block.type).toBe('BlockStatement');
      expect((block.path as PathExpression).parts).toEqual(['if']);
      expect(block.program).toBeTruthy();
      expect(block.program?.body).toHaveLength(1);
      expect((block.program?.body[0] as ContentStatement).value).toBe('yes');
    });

    it('parses template with nested blocks', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if outer}}{{#if inner}}content{{/if}}{{/if}}');

      const program = parser.parse();

      const outerBlock = program.body[0] as BlockStatement;
      expect(outerBlock.type).toBe('BlockStatement');
      expect((outerBlock.path as PathExpression).parts).toEqual(['if']);

      const innerBlock = outerBlock.program?.body[0] as BlockStatement;
      expect(innerBlock.type).toBe('BlockStatement');
      expect((innerBlock.path as PathExpression).parts).toEqual(['if']);

      const content = innerBlock.program?.body[0] as ContentStatement;
      expect(content.value).toBe('content');
    });

    it('parses template with all statement types', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('Text {{variable}} {{! comment }} {{#if test}}block{{/if}}');

      const program = parser.parse();

      // Verify all statement types are present
      expect(program.body.length).toBeGreaterThan(0);

      const types = program.body.map((node) => node.type);
      expect(types).toContain('ContentStatement');
      expect(types).toContain('MustacheStatement');
      expect(types).toContain('CommentStatement');
      expect(types).toContain('BlockStatement');
    });

    it('parses complex nested structure', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(`
        <div>
          {{#if user}}
            <h1>{{user.name}}</h1>
            {{#each user.posts}}
              <p>{{title}}</p>
            {{/each}}
          {{/if}}
        </div>
      `);

      const program = parser.parse();

      // Find the if block
      const ifBlock = program.body.find((node) => node.type === 'BlockStatement') as BlockStatement;
      expect(ifBlock).toBeTruthy();
      expect((ifBlock.path as PathExpression).parts).toEqual(['if']);

      // Find the each block inside if
      const eachBlock = ifBlock.program?.body.find(
        (node) => node.type === 'BlockStatement',
      ) as BlockStatement;
      expect(eachBlock).toBeTruthy();
      expect((eachBlock.path as PathExpression).parts).toEqual(['each']);
    });

    it('parses template with block and else', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if condition}}yes{{else}}no{{/if}}');

      const program = parser.parse();

      const block = program.body[0] as BlockStatement;
      expect(block.program?.body).toHaveLength(1);
      expect((block.program?.body[0] as ContentStatement).value).toBe('yes');
      expect(block.inverse?.body).toHaveLength(1);
      expect((block.inverse?.body[0] as ContentStatement).value).toBe('no');
    });

    it('parses email template example', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(`
        Hello {{user.firstName}},

        {{#if hasNewMessages}}
          You have {{messageCount}} new messages.
          {{#each messages}}
            - {{subject}} from {{sender}}
          {{/each}}
        {{else}}
          No new messages.
        {{/if}}

        Best regards,
        The Team
      `);

      const program = parser.parse();

      expect(program.type).toBe('Program');
      expect(program.body.length).toBeGreaterThan(0);

      // Verify structure contains expected elements
      const hasIfBlock = program.body.some(
        (node) =>
          node.type === 'BlockStatement' &&
          (node as BlockStatement).path.type === 'PathExpression' &&
          ((node as BlockStatement).path as PathExpression).parts[0] === 'if',
      );
      expect(hasIfBlock).toBe(true);

      const hasMustaches = program.body.some((node) => node.type === 'MustacheStatement');
      expect(hasMustaches).toBe(true);
    });

    it('parses template with multiple variables', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{firstName}} {{middleName}} {{lastName}}');

      const program = parser.parse();

      const mustaches = program.body.filter(
        (node) => node.type === 'MustacheStatement',
      ) as MustacheStatement[];
      expect(mustaches).toHaveLength(3);
      expect((mustaches[0].path as PathExpression).parts).toEqual(['firstName']);
      expect((mustaches[1].path as PathExpression).parts).toEqual(['middleName']);
      expect((mustaches[2].path as PathExpression).parts).toEqual(['lastName']);
    });

    it('parses template with literal block parameters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if score 80 true}}High score{{/if}}');

      const program = parser.parse();

      const block = program.body[0] as BlockStatement;
      expect(block.params).toHaveLength(3);
      expect((block.params[0] as PathExpression).parts).toEqual(['score']);
      expect((block.params[1] as NumberLiteral).value).toBe(80);
      expect((block.params[2] as BooleanLiteral).value).toBe(true);
    });

    it('parses deeply nested blocks', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#a}}{{#b}}{{#c}}{{#d}}deep{{/d}}{{/c}}{{/b}}{{/a}}');

      const program = parser.parse();

      let currentBlock = program.body[0] as BlockStatement;
      expect((currentBlock.path as PathExpression).parts).toEqual(['a']);

      currentBlock = currentBlock.program?.body[0] as BlockStatement;
      expect((currentBlock.path as PathExpression).parts).toEqual(['b']);

      currentBlock = currentBlock.program?.body[0] as BlockStatement;
      expect((currentBlock.path as PathExpression).parts).toEqual(['c']);

      currentBlock = currentBlock.program?.body[0] as BlockStatement;
      expect((currentBlock.path as PathExpression).parts).toEqual(['d']);

      const content = currentBlock.program?.body[0] as ContentStatement;
      expect(content.value).toBe('deep');
    });
  });

  describe('AST Properties (C2-F9-T2)', () => {
    it('calculates path depth for parent references', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{../parent}} {{../../grandparent}} {{value}}');

      const program = parser.parse();

      const mustaches = program.body.filter(
        (node) => node.type === 'MustacheStatement',
      ) as MustacheStatement[];

      const parent = mustaches[0].path as PathExpression;
      expect(parent.depth).toBe(1);
      expect(parent.parts).toEqual(['parent']);

      const grandparent = mustaches[1].path as PathExpression;
      expect(grandparent.depth).toBe(2);
      expect(grandparent.parts).toEqual(['grandparent']);

      const current = mustaches[2].path as PathExpression;
      expect(current.depth).toBe(0);
      expect(current.parts).toEqual(['value']);
    });

    it('sets data flag for @ variables', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{@index}} {{@key}} {{normalVar}}');

      const program = parser.parse();

      const mustaches = program.body.filter(
        (node) => node.type === 'MustacheStatement',
      ) as MustacheStatement[];

      const index = mustaches[0].path as PathExpression;
      expect(index.data).toBe(true);
      expect(index.parts).toEqual(['index']);

      const key = mustaches[1].path as PathExpression;
      expect(key.data).toBe(true);
      expect(key.parts).toEqual(['key']);

      const normal = mustaches[2].path as PathExpression;
      expect(normal.data).toBe(false);
      expect(normal.parts).toEqual(['normalVar']);
    });

    it('sets escaped flag correctly for mustaches', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{escaped}} {{{unescaped}}}');

      const program = parser.parse();

      const mustaches = program.body.filter(
        (node) => node.type === 'MustacheStatement',
      ) as MustacheStatement[];

      expect(mustaches[0].escaped).toBe(true);
      expect(mustaches[1].escaped).toBe(false);
    });

    it('verifies block program structure', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if test}}main{{else}}alt{{/if}}');

      const program = parser.parse();

      const block = program.body[0] as BlockStatement;

      // Main program
      expect(block.program).toBeTruthy();
      expect(block.program?.type).toBe('Program');
      expect(block.program?.body).toHaveLength(1);
      expect((block.program?.body[0] as ContentStatement).value).toBe('main');

      // Inverse program
      expect(block.inverse).toBeTruthy();
      expect(block.inverse?.type).toBe('Program');
      expect(block.inverse?.body).toHaveLength(1);
      expect((block.inverse?.body[0] as ContentStatement).value).toBe('alt');
    });

    it('tracks locations accurately', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('Hello {{name}}!');

      const program = parser.parse();

      expect(program.loc).toBeTruthy();
      expect(program.loc?.start.line).toBe(1);
      expect(program.loc?.start.column).toBe(0);

      const mustache = program.body[1] as MustacheStatement;
      expect(mustache.loc).toBeTruthy();
      expect(mustache.loc?.start.line).toBe(1);
      expect(mustache.loc?.start.column).toBeGreaterThan(5);
    });

    it('preserves path original strings', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{user.name}} {{../parent}} {{@root.data}}');

      const program = parser.parse();

      const mustaches = program.body.filter(
        (node) => node.type === 'MustacheStatement',
      ) as MustacheStatement[];

      expect((mustaches[0].path as PathExpression).original).toBe('user.name');
      expect((mustaches[1].path as PathExpression).original).toBe('../parent');
      expect((mustaches[2].path as PathExpression).original).toBe('@root.data');
    });

    it('handles special path this correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{this}} {{this.prop}} {{.}}');

      const program = parser.parse();

      const mustaches = program.body.filter(
        (node) => node.type === 'MustacheStatement',
      ) as MustacheStatement[];

      // {{this}}
      const thisPath = mustaches[0].path as PathExpression;
      expect(thisPath.parts).toEqual([]);
      expect(thisPath.original).toBe('this');

      // {{this.prop}}
      const thisProp = mustaches[1].path as PathExpression;
      expect(thisProp.parts).toEqual(['prop']);
      expect(thisProp.original).toBe('this.prop');

      // {{.}}
      const dot = mustaches[2].path as PathExpression;
      expect(dot.parts).toEqual([]);
      expect(dot.original).toBe('.');
    });

    it('verifies literal values in block params', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if "test" 123 true null}}content{{/if}}');

      const program = parser.parse();

      const block = program.body[0] as BlockStatement;
      expect(block.params).toHaveLength(4);

      expect((block.params[0] as StringLiteral).value).toBe('test');
      expect((block.params[1] as NumberLiteral).value).toBe(123);
      expect((block.params[2] as BooleanLiteral).value).toBe(true);
      expect(block.params[3].type).toBe('NullLiteral');
    });
  });

  describe('Error Conditions (C2-F9-T3)', () => {
    it('throws on unclosed if block', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if condition}}content');

      expect(() => parser.parse()).toThrow(/unclosed.*if/i);
    });

    it('throws on unclosed each block', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#each items}}item');

      expect(() => parser.parse()).toThrow(/unclosed.*each/i);
    });

    it('throws on mismatched block names', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if condition}}content{{/each}}');

      expect(() => parser.parse()).toThrow(/if.*each/);
    });

    it('throws on unexpected EOF', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if test}}{{#each items}}');

      expect(() => parser.parse()).toThrow();
    });

    it('throws on nested unclosed blocks', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if outer}}{{#if inner}}content{{/if}}');

      expect(() => parser.parse()).toThrow(/unclosed/i);
    });

    it('includes position in unclosed block error', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('Some text\n{{#if test}}content');

      try {
        parser.parse();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toMatch(/line|position|column/i);
      }
    });

    it('throws on mismatched deeply nested blocks', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#a}}{{#b}}{{#c}}content{{/b}}{{/c}}{{/a}}');

      expect(() => parser.parse()).toThrow();
    });

    it('provides clear error for unexpected closing tag', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{/if}}');

      expect(() => parser.parse()).toThrow();
    });

    it('handles multiple errors correctly', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      // First error
      parser.setInput('{{#if test}}');
      expect(() => parser.parse()).toThrow();

      // Parser should be reusable
      parser.setInput('{{#if test}}{{/each}}');
      expect(() => parser.parse()).toThrow();
    });

    it('throws on empty block name', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#}}content{{/}}');

      expect(() => parser.parse()).toThrow();
    });

    it('error messages include block names', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#myHelper}}content');

      try {
        parser.parse();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toMatch(/myHelper/);
      }
    });

    it('validates block closing with correct name', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#customBlock}}content{{/customBlock}}');

      // Should not throw
      const program = parser.parse();
      expect(program.body).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('parses empty template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('');

      const program = parser.parse();
      expect(program.body).toHaveLength(0);
    });

    it('parses content-only template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('Just plain text with no templates');

      const program = parser.parse();
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('ContentStatement');
    });

    it('parses mustache-only template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{variable}}');

      const program = parser.parse();
      expect(program.body).toHaveLength(1);
      expect(program.body[0].type).toBe('MustacheStatement');
    });

    it('parses template with only comments', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{! comment 1 }} {{! comment 2 }}');

      const program = parser.parse();
      const comments = program.body.filter((node) => node.type === 'CommentStatement');
      expect(comments).toHaveLength(2);
    });

    it('parses empty block', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if test}}{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      expect(block.program?.body).toHaveLength(0);
    });

    it('parses whitespace-only template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('   \n  \t  \n  ');

      const program = parser.parse();
      expect(program.body).toHaveLength(1);
      expect((program.body[0] as ContentStatement).value).toMatch(/\s+/);
    });

    it('handles adjacent mustaches', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{a}}{{b}}{{c}}');

      const program = parser.parse();
      expect(program.body).toHaveLength(3);
      expect(program.body.every((node) => node.type === 'MustacheStatement')).toBe(true);
    });

    it('handles adjacent blocks', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#a}}1{{/a}}{{#b}}2{{/b}}{{#c}}3{{/c}}');

      const program = parser.parse();
      expect(program.body).toHaveLength(3);
      expect(program.body.every((node) => node.type === 'BlockStatement')).toBe(true);
    });

    it('parses complex whitespace patterns', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('  {{  variable  }}  ');

      const program = parser.parse();
      expect(program.body).toHaveLength(3);
      expect(program.body[0].type).toBe('ContentStatement');
      expect(program.body[1].type).toBe('MustacheStatement');
      expect(program.body[2].type).toBe('ContentStatement');
    });

    it('handles multiline templates', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(`Line 1
Line 2
{{variable}}
Line 4`);

      const program = parser.parse();
      expect(program.body.length).toBeGreaterThan(1);
      const hasContent = program.body.some((node) => node.type === 'ContentStatement');
      const hasMustache = program.body.some((node) => node.type === 'MustacheStatement');
      expect(hasContent).toBe(true);
      expect(hasMustache).toBe(true);
    });
  });
});
