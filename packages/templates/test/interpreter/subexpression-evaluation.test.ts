import { describe, expect, it } from 'vitest';
import { Interpreter } from '../../src/interpreter/interpreter';
import { Lexer } from '../../src/lexer/lexer';
import { Parser } from '../../src/parser/parser';

/**
 * SubExpression Evaluation Tests (Feature 6.2)
 *
 * Tests evaluation of subexpressions (nested helper calls) with built-in
 * comparison and logical helpers.
 */
describe('SubExpression Evaluation', () => {
  const lexer = new Lexer();
  const parser = new Parser(lexer);

  const evaluate = (template: string, context: any, options?: any) => {
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, options);
    return interpreter.evaluate(context);
  };

  describe('Simple Comparison Helpers (C6-F2-T1)', () => {
    it('evaluates gt (greater than) comparison', () => {
      const result = evaluate('{{#if (gt score 80)}}yes{{/if}}', { score: 85 });
      expect(result).toBe('yes');
    });

    it('evaluates gt returns false when not greater', () => {
      const result = evaluate('{{#if (gt score 80)}}yes{{else}}no{{/if}}', { score: 75 });
      expect(result).toBe('no');
    });

    it('evaluates lt (less than) comparison', () => {
      const result = evaluate('{{#if (lt age 18)}}minor{{/if}}', { age: 15 });
      expect(result).toBe('minor');
    });

    it('evaluates eq (equality) comparison', () => {
      const result = evaluate('{{#if (eq status "active")}}yes{{/if}}', { status: 'active' });
      expect(result).toBe('yes');
    });

    it('evaluates eq with numbers', () => {
      const result = evaluate('{{#if (eq count 0)}}zero{{/if}}', { count: 0 });
      expect(result).toBe('zero');
    });

    it('evaluates ne (not equal) comparison', () => {
      const result = evaluate('{{#if (ne status "deleted")}}show{{/if}}', { status: 'active' });
      expect(result).toBe('show');
    });

    it('evaluates gte (greater than or equal)', () => {
      const result = evaluate('{{#if (gte age 18)}}adult{{/if}}', { age: 18 });
      expect(result).toBe('adult');
    });

    it('evaluates lte (less than or equal)', () => {
      const result = evaluate('{{#if (lte score 60)}}fail{{/if}}', { score: 55 });
      expect(result).toBe('fail');
    });
  });

  describe('Logical Helpers (C6-F2-T1)', () => {
    it('evaluates and with all truthy values', () => {
      const result = evaluate('{{#if (and isActive isPremium)}}yes{{/if}}', {
        isActive: true,
        isPremium: true,
      });
      expect(result).toBe('yes');
    });

    it('evaluates and with one falsy value', () => {
      const result = evaluate('{{#if (and isActive isPremium)}}yes{{else}}no{{/if}}', {
        isActive: true,
        isPremium: false,
      });
      expect(result).toBe('no');
    });

    it('evaluates or with at least one truthy value', () => {
      const result = evaluate('{{#if (or isAdmin isOwner)}}access{{/if}}', {
        isAdmin: false,
        isOwner: true,
      });
      expect(result).toBe('access');
    });

    it('evaluates or with all falsy values', () => {
      const result = evaluate('{{#if (or a b)}}yes{{else}}no{{/if}}', { a: false, b: null });
      expect(result).toBe('no');
    });

    it('evaluates not with falsy value', () => {
      const result = evaluate('{{#if (not isDisabled)}}enabled{{/if}}', { isDisabled: false });
      expect(result).toBe('enabled');
    });

    it('evaluates not with truthy value', () => {
      const result = evaluate('{{#if (not isActive)}}inactive{{else}}active{{/if}}', {
        isActive: true,
      });
      expect(result).toBe('active');
    });
  });

  describe('Nested SubExpressions (C6-F2-T1)', () => {
    it('evaluates nested and with gt/lt comparisons', () => {
      const result = evaluate('{{#if (and (gt x 5) (lt x 10))}}yes{{/if}}', { x: 7 });
      expect(result).toBe('yes');
    });

    it('evaluates nested and returns false when one condition fails', () => {
      const result = evaluate('{{#if (and (gt x 5) (lt x 10))}}yes{{else}}no{{/if}}', { x: 12 });
      expect(result).toBe('no');
    });

    it('evaluates nested or with and expressions', () => {
      const result = evaluate('{{#if (or (and a b) (and c d))}}yes{{/if}}', {
        a: true,
        b: false,
        c: true,
        d: true,
      });
      expect(result).toBe('yes'); // (false || true) = true
    });

    it('evaluates deeply nested subexpressions (3 levels)', () => {
      const result = evaluate('{{#if (or (and (gt x 5) (lt x 10)) (eq y 0))}}yes{{/if}}', {
        x: 3,
        y: 0,
      });
      expect(result).toBe('yes'); // ((false && false) || true) = true
    });
  });

  describe('SubExpression with String Literals (C6-F2-T1)', () => {
    it('evaluates eq with string literal', () => {
      const result = evaluate('{{#if (eq status "active")}}yes{{/if}}', { status: 'active' });
      expect(result).toBe('yes');
    });

    it('evaluates ne with string literal', () => {
      const result = evaluate('{{#if (ne role "guest")}}show{{/if}}', { role: 'admin' });
      expect(result).toBe('show');
    });
  });

  describe('SubExpression with Number Literals (C6-F2-T1)', () => {
    it('evaluates gt with number literal', () => {
      const result = evaluate('{{#if (gt count 10)}}many{{/if}}', { count: 15 });
      expect(result).toBe('many');
    });

    it('evaluates lte with number literal', () => {
      const result = evaluate('{{#if (lte price 100)}}affordable{{/if}}', { price: 75 });
      expect(result).toBe('affordable');
    });
  });

  describe('SubExpression with Boolean Literals (C6-F2-T1)', () => {
    it('evaluates and with boolean literal', () => {
      const result = evaluate('{{#if (and true isActive)}}yes{{/if}}', { isActive: true });
      expect(result).toBe('yes');
    });

    it('evaluates or with boolean literal', () => {
      const result = evaluate('{{#if (or false isAdmin)}}yes{{/if}}', { isAdmin: true });
      expect(result).toBe('yes');
    });
  });

  describe('Error Conditions (C6-F2-T1)', () => {
    it('throws error for unknown helper', () => {
      expect(() => evaluate('{{#if (unknown x)}}yes{{/if}}', { x: 1 })).toThrow(/unknown helper/i);
    });

    it('throws error with helper name in message', () => {
      expect(() => evaluate('{{#if (notExists value)}}yes{{/if}}', { value: 1 })).toThrow(
        /notExists/,
      );
    });
  });

  describe('Integration with Block Helpers', () => {
    it('works with #unless block', () => {
      const result = evaluate('{{#unless (eq status "deleted")}}show{{/unless}}', {
        status: 'active',
      });
      expect(result).toBe('show');
    });

    it('works with #each block', () => {
      const result = evaluate('{{#each items}}{{#if (gt this 5)}}{{this}} {{/if}}{{/each}}', {
        items: [3, 7, 2, 9],
      });
      expect(result).toBe('7 9 ');
    });

    it('works with #with block', () => {
      const result = evaluate('{{#with user}}{{#if (eq role "admin")}}{{name}}{{/if}}{{/with}}', {
        user: { name: 'Alice', role: 'admin' },
      });
      expect(result).toBe('Alice');
    });
  });

  describe('Complex Real-World Scenarios', () => {
    it('filters array elements with gt comparison', () => {
      const result = evaluate('{{#each scores}}{{#if (gte this 70)}}{{this}} {{/if}}{{/each}}', {
        scores: [85, 60, 92, 45, 78],
      });
      expect(result).toBe('85 92 78 ');
    });

    it('checks multiple conditions for access control', () => {
      const result = evaluate(
        '{{#if (or (eq role "admin") (and (eq role "editor") isActive))}}Access Granted{{else}}Access Denied{{/if}}',
        { role: 'editor', isActive: true },
      );
      expect(result).toBe('Access Granted');
    });

    it('validates range with nested comparisons', () => {
      const result = evaluate(
        '{{#if (and (gte score 0) (lte score 100))}}Valid{{else}}Invalid{{/if}}',
        { score: 85 },
      );
      expect(result).toBe('Valid');
    });

    it('combines not with other operators', () => {
      const result = evaluate('{{#if (and (not isDeleted) (eq status "published"))}}Show{{/if}}', {
        isDeleted: false,
        status: 'published',
      });
      expect(result).toBe('Show');
    });
  });

  describe('Handlebars Truthiness in Logical Helpers', () => {
    it('treats 0 as truthy in and helper', () => {
      const result = evaluate('{{#if (and true 0)}}yes{{/if}}', {});
      expect(result).toBe('yes'); // 0 is truthy in Handlebars
    });

    it('treats empty object as truthy in and helper', () => {
      const result = evaluate('{{#if (and true obj)}}yes{{/if}}', { obj: {} });
      expect(result).toBe('yes'); // {} is truthy
    });

    it('treats empty array as falsy in and helper', () => {
      const result = evaluate('{{#if (and true arr)}}yes{{else}}no{{/if}}', { arr: [] });
      expect(result).toBe('no'); // [] is falsy
    });

    it('treats empty string as falsy in or helper', () => {
      const result = evaluate('{{#if (or false str)}}yes{{else}}no{{/if}}', { str: '' });
      expect(result).toBe('no'); // "" is falsy
    });
  });
});
