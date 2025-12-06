import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type {
  BlockStatement,
  BooleanLiteral,
  NumberLiteral,
  PathExpression,
  StringLiteral,
  SubExpression,
} from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

/**
 * SubExpression Parsing Tests (Feature 2.10)
 *
 * SubExpressions allow nested helper calls within expressions.
 * Syntax: (helperName param1 param2 ...)
 *
 * These are essential for V1 built-in helpers that require logical expressions:
 * - {{#if (gt score 80)}} - Greater than comparison
 * - {{#if (and isActive isPremium)}} - Logical AND
 * - {{#unless (eq status "deleted")}} - Equality check
 */
describe('SubExpression Parsing', () => {
  describe('Basic SubExpression Structure (C2-F10-T1)', () => {
    it('parses simple subexpression with two params', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt x 1)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      expect(block.params).toHaveLength(1);
      const subexpr = block.params[0] as SubExpression;

      expect(subexpr.type).toBe('SubExpression');
      expect((subexpr.path as PathExpression).parts).toEqual(['gt']);
      expect(subexpr.params).toHaveLength(2);
      expect((subexpr.params[0] as PathExpression).parts).toEqual(['x']);
      expect((subexpr.params[1] as NumberLiteral).value).toBe(1);
      expect(subexpr.hash.pairs).toHaveLength(0);
    });

    it('parses subexpression with string literal', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (eq status "active")}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect((subexpr.path as PathExpression).parts).toEqual(['eq']);
      expect(subexpr.params).toHaveLength(2);
      expect((subexpr.params[0] as PathExpression).parts).toEqual(['status']);
      expect((subexpr.params[1] as StringLiteral).value).toBe('active');
    });

    it('parses subexpression with boolean literals', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (and true false)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect((subexpr.path as PathExpression).parts).toEqual(['and']);
      expect((subexpr.params[0] as BooleanLiteral).value).toBe(true);
      expect((subexpr.params[1] as BooleanLiteral).value).toBe(false);
    });

    it('parses subexpression with null and undefined', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (helper null undefined)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect(subexpr.params).toHaveLength(2);
      expect(subexpr.params[0].type).toBe('NullLiteral');
      expect(subexpr.params[1].type).toBe('UndefinedLiteral');
    });

    it('parses subexpression with no parameters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (hasPermission)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect((subexpr.path as PathExpression).parts).toEqual(['hasPermission']);
      expect(subexpr.params).toHaveLength(0);
    });

    it('parses subexpression with multiple parameters', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (between value 1 10)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect(subexpr.params).toHaveLength(3);
      expect((subexpr.params[0] as PathExpression).parts).toEqual(['value']);
      expect((subexpr.params[1] as NumberLiteral).value).toBe(1);
      expect((subexpr.params[2] as NumberLiteral).value).toBe(10);
    });

    it('tracks location for subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt x 1)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect(subexpr.loc).toBeTruthy();
      expect(subexpr.loc?.start.line).toBeGreaterThan(0);
      expect(subexpr.loc?.end.column).toBeGreaterThan(subexpr.loc?.start.column ?? 0);
    });

    it('parses subexpression with dotted path', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt user.score 100)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect((subexpr.params[0] as PathExpression).parts).toEqual(['user', 'score']);
    });

    it('parses subexpression with data variable', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (eq @index 0)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      const dataPath = subexpr.params[0] as PathExpression;
      expect(dataPath.data).toBe(true);
      expect(dataPath.parts).toEqual(['index']);
    });
  });

  describe('Nested SubExpressions (C2-F10-T2)', () => {
    it('parses subexpression with one nested subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (and (gt x 1) (lt x 10))}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const outerSubexpr = block.params[0] as SubExpression;

      expect((outerSubexpr.path as PathExpression).parts).toEqual(['and']);
      expect(outerSubexpr.params).toHaveLength(2);

      const nested1 = outerSubexpr.params[0] as SubExpression;
      expect(nested1.type).toBe('SubExpression');
      expect((nested1.path as PathExpression).parts).toEqual(['gt']);
      expect((nested1.params[0] as PathExpression).parts).toEqual(['x']);
      expect((nested1.params[1] as NumberLiteral).value).toBe(1);

      const nested2 = outerSubexpr.params[1] as SubExpression;
      expect(nested2.type).toBe('SubExpression');
      expect((nested2.path as PathExpression).parts).toEqual(['lt']);
      expect((nested2.params[0] as PathExpression).parts).toEqual(['x']);
      expect((nested2.params[1] as NumberLiteral).value).toBe(10);
    });

    it('parses triple nested subexpressions', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (or (and a b) (and c d))}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const orExpr = block.params[0] as SubExpression;

      expect((orExpr.path as PathExpression).parts).toEqual(['or']);
      expect(orExpr.params).toHaveLength(2);

      const and1 = orExpr.params[0] as SubExpression;
      expect((and1.path as PathExpression).parts).toEqual(['and']);
      expect((and1.params[0] as PathExpression).parts).toEqual(['a']);
      expect((and1.params[1] as PathExpression).parts).toEqual(['b']);

      const and2 = orExpr.params[1] as SubExpression;
      expect((and2.path as PathExpression).parts).toEqual(['and']);
      expect((and2.params[0] as PathExpression).parts).toEqual(['c']);
      expect((and2.params[1] as PathExpression).parts).toEqual(['d']);
    });

    it('parses mixed literals and nested subexpressions', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (add (mul x 2) 5)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const addExpr = block.params[0] as SubExpression;

      expect((addExpr.path as PathExpression).parts).toEqual(['add']);

      const mulExpr = addExpr.params[0] as SubExpression;
      expect((mulExpr.path as PathExpression).parts).toEqual(['mul']);
      expect((mulExpr.params[0] as PathExpression).parts).toEqual(['x']);
      expect((mulExpr.params[1] as NumberLiteral).value).toBe(2);

      expect((addExpr.params[1] as NumberLiteral).value).toBe(5);
    });

    it('parses deeply nested subexpressions (4 levels)', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (a (b (c (d x))))}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      let current = block.params[0] as SubExpression;
      expect((current.path as PathExpression).parts).toEqual(['a']);

      current = current.params[0] as SubExpression;
      expect((current.path as PathExpression).parts).toEqual(['b']);

      current = current.params[0] as SubExpression;
      expect((current.path as PathExpression).parts).toEqual(['c']);

      current = current.params[0] as SubExpression;
      expect((current.path as PathExpression).parts).toEqual(['d']);

      expect((current.params[0] as PathExpression).parts).toEqual(['x']);
    });

    it('parses complex nested expression with multiple params', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (or (gt score 80) (and isPremium (lt age 25)))}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const orExpr = block.params[0] as SubExpression;

      expect((orExpr.path as PathExpression).parts).toEqual(['or']);
      expect(orExpr.params).toHaveLength(2);

      const gtExpr = orExpr.params[0] as SubExpression;
      expect((gtExpr.path as PathExpression).parts).toEqual(['gt']);

      const andExpr = orExpr.params[1] as SubExpression;
      expect((andExpr.path as PathExpression).parts).toEqual(['and']);
      expect((andExpr.params[0] as PathExpression).parts).toEqual(['isPremium']);

      const ltExpr = andExpr.params[1] as SubExpression;
      expect((ltExpr.path as PathExpression).parts).toEqual(['lt']);
    });

    it('tracks location for nested subexpressions', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (and (gt x 1) (lt x 10))}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const outerSubexpr = block.params[0] as SubExpression;

      expect(outerSubexpr.loc).toBeTruthy();

      const nested1 = outerSubexpr.params[0] as SubExpression;
      expect(nested1.loc).toBeTruthy();
      expect(nested1.loc?.start.column).toBeGreaterThan(0);

      const nested2 = outerSubexpr.params[1] as SubExpression;
      expect(nested2.loc).toBeTruthy();
    });
  });

  describe('Integration with Block Helpers (C2-F10-T3)', () => {
    it('works in if block', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt score 80)}}High{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      expect((block.path as PathExpression).parts).toEqual(['if']);
      expect(block.params).toHaveLength(1);
      expect(block.params[0].type).toBe('SubExpression');
    });

    it('works in unless block', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#unless (eq status "deleted")}}Show{{/unless}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      expect((block.path as PathExpression).parts).toEqual(['unless']);
      const subexpr = block.params[0] as SubExpression;
      expect((subexpr.path as PathExpression).parts).toEqual(['eq']);
    });

    it('works in each block', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#each (filter items isActive)}}{{name}}{{/each}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      expect((block.path as PathExpression).parts).toEqual(['each']);
      const subexpr = block.params[0] as SubExpression;
      expect((subexpr.path as PathExpression).parts).toEqual(['filter']);
    });

    it('works in with block', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#with (find users id)}}{{name}}{{/with}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      expect((block.path as PathExpression).parts).toEqual(['with']);
      expect(block.params[0].type).toBe('SubExpression');
    });

    it('allows multiple subexpressions in block params', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#helper (gt x 1) (lt y 10)}}content{{/helper}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      expect(block.params).toHaveLength(2);
      expect(block.params[0].type).toBe('SubExpression');
      expect(block.params[1].type).toBe('SubExpression');
    });

    it('allows mixing subexpressions with literals', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#helper (gt x 1) "text" 42}}content{{/helper}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      expect(block.params).toHaveLength(3);
      expect(block.params[0].type).toBe('SubExpression');
      expect(block.params[1].type).toBe('StringLiteral');
      expect(block.params[2].type).toBe('NumberLiteral');
    });

    it('works in block with else', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt score 80)}}Pass{{else}}Fail{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;

      expect(block.params[0].type).toBe('SubExpression');
      expect(block.program).toBeTruthy();
      expect(block.inverse).toBeTruthy();
    });
  });

  describe('Error Conditions (C2-F10-T4)', () => {
    it('throws on unclosed subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt x 1}}yes{{/if}}');

      expect(() => parser.parse()).toThrow(/unclosed.*subexpression/i);
    });

    it('throws on unexpected closing parenthesis', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if gt x 1)}}yes{{/if}}');

      expect(() => parser.parse()).toThrow();
    });

    it('throws on unclosed nested subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (and (gt x 1) (lt x 10)}}yes{{/if}}');

      expect(() => parser.parse()).toThrow(/unclosed/i);
    });

    it('throws on missing helper name', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if ()}}yes{{/if}}');

      expect(() => parser.parse()).toThrow(/helper name/i);
    });

    it('throws on invalid token in subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt x {{)}}yes{{/if}}');

      expect(() => parser.parse()).toThrow();
    });

    it('includes helper name in unclosed error', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (myHelper x y}}yes{{/if}}');

      try {
        parser.parse();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toMatch(/myHelper/);
      }
    });

    it('throws on unexpected EOF in subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt x 1');

      expect(() => parser.parse()).toThrow();
    });

    it('throws on deeply nested unclosed subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (a (b (c x))}}yes{{/if}}');

      expect(() => parser.parse()).toThrow(/unclosed/i);
    });

    it('provides position information in errors', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('Line 1\n{{#if (gt x 1}}content');

      try {
        parser.parse();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toMatch(/line|position|column/i);
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles whitespace inside subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if ( gt   x   1 )}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect((subexpr.path as PathExpression).parts).toEqual(['gt']);
      expect(subexpr.params).toHaveLength(2);
    });

    it('parses subexpression with parent path', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (gt ../value 10)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      const path = subexpr.params[0] as PathExpression;
      expect(path.depth).toBe(1);
      expect(path.parts).toEqual(['value']);
    });

    it('parses subexpression with this reference', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (eq this "value")}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      const path = subexpr.params[0] as PathExpression;
      expect(path.parts).toEqual([]);
      expect(path.original).toBe('this');
    });

    it('handles multiple subexpressions in complex template', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(`
        {{#if (gt score 80)}}
          High
        {{else}}
          {{#if (gt score 50)}}
            Medium
          {{else}}
            Low
          {{/if}}
        {{/if}}
      `);

      const program = parser.parse();
      expect(program.body.length).toBeGreaterThan(0);

      // Verify both if blocks have subexpressions
      const blocks = program.body.filter(
        (node) => node.type === 'BlockStatement',
      ) as BlockStatement[];
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('parses empty parameter subexpression', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput('{{#if (isValid)}}yes{{/if}}');

      const program = parser.parse();
      const block = program.body[0] as BlockStatement;
      const subexpr = block.params[0] as SubExpression;

      expect(subexpr.params).toHaveLength(0);
    });
  });
});
