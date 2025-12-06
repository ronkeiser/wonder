/**
 * Tests for nested block parsing (C2-F6-T4)
 * Validates that blocks can be nested to arbitrary depth with correct content separation
 */

import { describe, it, expect } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { Parser } from '../../src/parser/parser';
import type { BlockStatement, Program } from '../../src/parser/ast-nodes';

const createParser = (template: string): Parser => {
  const lexer = new Lexer();
  const parser = new Parser(lexer);
  parser.setInput(template);
  return parser;
};

describe('Nested Block Parsing', () => {
  describe('Two-level nesting', () => {
    it('should parse two nested if blocks', () => {
      const parser = createParser('{{#if a}}{{#if b}}inner{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.type).toBe('BlockStatement');
      expect(outerBlock.path.original).toBe('if');

      // Check outer block's program body contains inner block
      expect(outerBlock.program!.body).toHaveLength(1);
      const innerBlock = outerBlock.program!.body[0] as BlockStatement;
      expect(innerBlock.type).toBe('BlockStatement');
      expect(innerBlock.path.original).toBe('if');

      // Check inner block's content
      expect(innerBlock.program!.body).toHaveLength(1);
      expect(innerBlock.program!.body[0].type).toBe('ContentStatement');
    });

    it('should parse nested each inside if', () => {
      const parser = createParser('{{#if condition}}{{#each items}}{{this}}{{/each}}{{/if}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.path.original).toBe('if');

      const innerBlock = outerBlock.program!.body[0] as BlockStatement;
      expect(innerBlock.type).toBe('BlockStatement');
      expect(innerBlock.path.original).toBe('each');
    });

    it('should parse nested with inside unless', () => {
      const parser = createParser('{{#unless done}}{{#with user}}{{name}}{{/with}}{{/unless}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.path.original).toBe('unless');

      const innerBlock = outerBlock.program!.body[0] as BlockStatement;
      expect(innerBlock.path.original).toBe('with');
    });

    it('should handle content before nested block', () => {
      const parser = createParser('{{#if a}}before{{#if b}}inner{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(2);
      expect(outerBlock.program!.body[0].type).toBe('ContentStatement');
      expect(outerBlock.program!.body[1].type).toBe('BlockStatement');
    });

    it('should handle content after nested block', () => {
      const parser = createParser('{{#if a}}{{#if b}}inner{{/if}}after{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(2);
      expect(outerBlock.program!.body[0].type).toBe('BlockStatement');
      expect(outerBlock.program!.body[1].type).toBe('ContentStatement');
    });

    it('should handle content before and after nested block', () => {
      const parser = createParser('{{#if a}}before{{#if b}}inner{{/if}}after{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(3);
      expect(outerBlock.program!.body[0].type).toBe('ContentStatement');
      expect(outerBlock.program!.body[1].type).toBe('BlockStatement');
      expect(outerBlock.program!.body[2].type).toBe('ContentStatement');
    });
  });

  describe('Three-level nesting', () => {
    it('should parse three nested if blocks', () => {
      const parser = createParser('{{#if a}}{{#if b}}{{#if c}}deep{{/if}}{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const level1 = ast.body[0] as BlockStatement;
      expect(level1.path.original).toBe('if');

      const level2 = level1.program!.body[0] as BlockStatement;
      expect(level2.path.original).toBe('if');

      const level3 = level2.program!.body[0] as BlockStatement;
      expect(level3.path.original).toBe('if');

      expect(level3.program!.body).toHaveLength(1);
      expect(level3.program!.body[0].type).toBe('ContentStatement');
    });

    it('should parse mixed block types at three levels', () => {
      const parser = createParser('{{#if x}}{{#each items}}{{#with this}}{{name}}{{/with}}{{/each}}{{/if}}');
      const ast = parser.parseProgram();

      const level1 = ast.body[0] as BlockStatement;
      expect(level1.path.original).toBe('if');

      const level2 = level1.program!.body[0] as BlockStatement;
      expect(level2.path.original).toBe('each');

      const level3 = level2.program!.body[0] as BlockStatement;
      expect(level3.path.original).toBe('with');
    });

    it('should handle content at multiple levels', () => {
      const parser = createParser('{{#if a}}L1{{#if b}}L2{{#if c}}L3{{/if}}{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const level1 = ast.body[0] as BlockStatement;
      expect(level1.program!.body).toHaveLength(2); // "L1" + nested block

      const level2 = level1.program!.body[1] as BlockStatement;
      expect(level2.program!.body).toHaveLength(2); // "L2" + nested block

      const level3 = level2.program!.body[1] as BlockStatement;
      expect(level3.program!.body).toHaveLength(1); // "L3"
    });
  });

  describe('Deeply nested structures', () => {
    it('should handle four levels of nesting', () => {
      const template = '{{#if a}}{{#if b}}{{#if c}}{{#if d}}deep{{/if}}{{/if}}{{/if}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      let current = ast.body[0] as BlockStatement;
      expect(current.path.original).toBe('if');

      current = current.program!.body[0] as BlockStatement;
      expect(current.path.original).toBe('if');

      current = current.program!.body[0] as BlockStatement;
      expect(current.path.original).toBe('if');

      current = current.program!.body[0] as BlockStatement;
      expect(current.path.original).toBe('if');

      expect(current.program!.body[0].type).toBe('ContentStatement');
    });

    it('should handle five levels of nesting', () => {
      const template = '{{#if a}}{{#if b}}{{#if c}}{{#if d}}{{#if e}}very deep{{/if}}{{/if}}{{/if}}{{/if}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      let current = ast.body[0] as BlockStatement;
      
      // Level 1
      expect(current.path.original).toBe('if');
      current = current.program!.body[0] as BlockStatement;
      
      // Level 2
      expect(current.path.original).toBe('if');
      current = current.program!.body[0] as BlockStatement;
      
      // Level 3
      expect(current.path.original).toBe('if');
      current = current.program!.body[0] as BlockStatement;
      
      // Level 4
      expect(current.path.original).toBe('if');
      current = current.program!.body[0] as BlockStatement;
      
      // Level 5
      expect(current.path.original).toBe('if');
      expect(current.program!.body[0].type).toBe('ContentStatement');
    });

    it('should handle six levels with mixed content', () => {
      const template = '{{#if a}}1{{#if b}}2{{#if c}}3{{#if d}}4{{#if e}}5{{#if f}}6{{/if}}{{/if}}{{/if}}{{/if}}{{/if}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(1);
      // Just verify it parses without error - structure is deeply nested
      const root = ast.body[0] as BlockStatement;
      expect(root.type).toBe('BlockStatement');
    });
  });

  describe('Nested blocks with else clauses', () => {
    it('should parse nested blocks with else in outer block', () => {
      const parser = createParser('{{#if a}}{{#if b}}inner{{/if}}{{else}}outer else{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(1);
      expect(outerBlock.program!.body[0].type).toBe('BlockStatement');

      expect(outerBlock.inverse).not.toBeNull();
      expect(outerBlock.inverse!.body).toHaveLength(1);
      expect(outerBlock.inverse!.body[0].type).toBe('ContentStatement');
    });

    it('should parse nested blocks with else in inner block', () => {
      const parser = createParser('{{#if a}}{{#if b}}yes{{else}}no{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      const innerBlock = outerBlock.program!.body[0] as BlockStatement;

      expect(innerBlock.program!.body).toHaveLength(1);
      expect(innerBlock.inverse).not.toBeNull();
      expect(innerBlock.inverse!.body).toHaveLength(1);
    });

    it('should parse nested blocks with else in both blocks', () => {
      const parser = createParser('{{#if a}}{{#if b}}yes{{else}}no{{/if}}{{else}}outer no{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.inverse).not.toBeNull();

      const innerBlock = outerBlock.program!.body[0] as BlockStatement;
      expect(innerBlock.inverse).not.toBeNull();
    });

    it('should parse three levels with else clauses', () => {
      const template = '{{#if a}}{{#if b}}{{#if c}}yes{{else}}c-no{{/if}}{{else}}b-no{{/if}}{{else}}a-no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const level1 = ast.body[0] as BlockStatement;
      expect(level1.inverse).not.toBeNull();

      const level2 = level1.program!.body[0] as BlockStatement;
      expect(level2.inverse).not.toBeNull();

      const level3 = level2.program!.body[0] as BlockStatement;
      expect(level3.inverse).not.toBeNull();
    });
  });

  describe('Multiple nested blocks (siblings)', () => {
    it('should parse two sibling blocks inside parent', () => {
      const parser = createParser('{{#if a}}{{#if b}}B{{/if}}{{#if c}}C{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(2);

      const firstInner = outerBlock.program!.body[0] as BlockStatement;
      expect(firstInner.path.original).toBe('if');

      const secondInner = outerBlock.program!.body[1] as BlockStatement;
      expect(secondInner.path.original).toBe('if');
    });

    it('should parse three sibling blocks inside parent', () => {
      const parser = createParser('{{#if a}}{{#if b}}B{{/if}}{{#if c}}C{{/if}}{{#if d}}D{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(3);
    });

    it('should handle content between sibling blocks', () => {
      const parser = createParser('{{#if a}}{{#if b}}B{{/if}}middle{{#if c}}C{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(3);
      expect(outerBlock.program!.body[0].type).toBe('BlockStatement');
      expect(outerBlock.program!.body[1].type).toBe('ContentStatement');
      expect(outerBlock.program!.body[2].type).toBe('BlockStatement');
    });
  });

  describe('Content separation in nested blocks', () => {
    it('should correctly separate content to each block level', () => {
      const parser = createParser('outer{{#if a}}level1{{#if b}}level2{{/if}}back1{{/if}}outer2');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(3); // outer content, block, outer2 content

      const block = ast.body[1] as BlockStatement;
      expect(block.program!.body).toHaveLength(3); // level1, nested block, back1

      const nestedBlock = block.program!.body[1] as BlockStatement;
      expect(nestedBlock.program!.body).toHaveLength(1); // level2
    });

    it('should not leak content between nesting levels', () => {
      const parser = createParser('{{#if a}}A1{{#if b}}B1{{/if}}A2{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      const innerBlock = outerBlock.program!.body[1] as BlockStatement;

      // Inner block should only have its content
      expect(innerBlock.program!.body).toHaveLength(1);
      expect(innerBlock.program!.body[0].type).toBe('ContentStatement');

      // Outer block should have: A1, inner block, A2
      expect(outerBlock.program!.body).toHaveLength(3);
    });

    it('should handle mustaches at different nesting levels', () => {
      const parser = createParser('{{x}}{{#if a}}{{y}}{{#if b}}{{z}}{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      expect(ast.body).toHaveLength(2); // {{x}} and outer block

      const outerBlock = ast.body[1] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(2); // {{y}} and inner block

      const innerBlock = outerBlock.program!.body[1] as BlockStatement;
      expect(innerBlock.program!.body).toHaveLength(1); // {{z}}
    });
  });

  describe('Location tracking in nested blocks', () => {
    it('should track locations for nested blocks', () => {
      const parser = createParser('{{#if a}}{{#if b}}text{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.loc).not.toBeNull();
      expect(outerBlock.loc!.start.line).toBe(1);

      const innerBlock = outerBlock.program!.body[0] as BlockStatement;
      expect(innerBlock.loc).not.toBeNull();
    });

    it('should track different locations for sibling blocks', () => {
      const parser = createParser('{{#if a}}{{#if b}}B{{/if}}{{#if c}}C{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      const firstInner = outerBlock.program!.body[0] as BlockStatement;
      const secondInner = outerBlock.program!.body[1] as BlockStatement;

      expect(firstInner.loc).not.toBeNull();
      expect(secondInner.loc).not.toBeNull();
      
      // Second block should start after first block
      expect(secondInner.loc!.start.column).toBeGreaterThan(firstInner.loc!.start.column);
    });
  });

  describe('Real-world nested patterns', () => {
    it('should parse conditional list rendering', () => {
      const template = '{{#if hasItems}}{{#each items}}{{name}}{{/each}}{{else}}No items{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const ifBlock = ast.body[0] as BlockStatement;
      expect(ifBlock.path.original).toBe('if');
      
      const eachBlock = ifBlock.program!.body[0] as BlockStatement;
      expect(eachBlock.path.original).toBe('each');
      
      expect(ifBlock.inverse).not.toBeNull();
    });

    it('should parse nested conditionals with data', () => {
      const template = '{{#if user}}{{#if user.active}}{{user.name}}{{else}}Inactive{{/if}}{{else}}No user{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const outerIf = ast.body[0] as BlockStatement;
      const innerIf = outerIf.program!.body[0] as BlockStatement;
      
      expect(outerIf.inverse).not.toBeNull();
      expect(innerIf.inverse).not.toBeNull();
    });

    it('should parse table-like structure', () => {
      const template = '{{#each rows}}{{#each columns}}{{value}}{{/each}}{{/each}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const outerEach = ast.body[0] as BlockStatement;
      expect(outerEach.path.original).toBe('each');
      
      const innerEach = outerEach.program!.body[0] as BlockStatement;
      expect(innerEach.path.original).toBe('each');
    });

    it('should parse conditional within loop', () => {
      const template = '{{#each items}}{{#if this.visible}}{{this.name}}{{/if}}{{/each}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const eachBlock = ast.body[0] as BlockStatement;
      const ifBlock = eachBlock.program!.body[0] as BlockStatement;
      
      expect(eachBlock.path.original).toBe('each');
      expect(ifBlock.path.original).toBe('if');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty nested blocks', () => {
      const parser = createParser('{{#if a}}{{#if b}}{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      const innerBlock = outerBlock.program!.body[0] as BlockStatement;
      
      expect(innerBlock.program!.body).toHaveLength(0);
    });

    it('should handle nested blocks with only whitespace', () => {
      const parser = createParser('{{#if a}}  {{#if b}}  {{/if}}  {{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body.length).toBeGreaterThan(0);
    });

    it('should handle nested blocks with comments', () => {
      const parser = createParser('{{#if a}}{{! comment }}{{#if b}}text{{/if}}{{/if}}');
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.program!.body).toHaveLength(2);
      expect(outerBlock.program!.body[0].type).toBe('CommentStatement');
      expect(outerBlock.program!.body[1].type).toBe('BlockStatement');
    });

    it('should handle deeply nested with various statement types', () => {
      const template = '{{#if a}}text{{x}}{{! comment }}{{#if b}}{{y}}{{/if}}{{z}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.program!.body).toHaveLength(5);
      expect(block.program!.body[0].type).toBe('ContentStatement');
      expect(block.program!.body[1].type).toBe('MustacheStatement');
      expect(block.program!.body[2].type).toBe('CommentStatement');
      expect(block.program!.body[3].type).toBe('BlockStatement');
      expect(block.program!.body[4].type).toBe('MustacheStatement');
    });
  });
});
