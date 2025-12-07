/**
 * Runtime Helper Registry Tests
 *
 * Tests for Feature 6.4: Runtime Helper Registry
 * Verifies that user-provided helpers can be passed at render time
 * and are properly merged with built-in helpers.
 */

import { describe, expect, test } from 'vitest';
import { compile, render } from '../../src/index.js';

describe('Runtime Helper Registry (C6-F4)', () => {
  describe('Custom Helpers', () => {
    test('simple custom helper with no args', () => {
      const result = render(
        '{{greeting}}',
        {},
        {
          helpers: {
            greeting: () => 'Hello, World!',
          },
        },
      );
      expect(result).toBe('Hello, World!');
    });

    test('custom helper with single arg', () => {
      const result = render(
        '{{uppercase name}}',
        { name: 'alice' },
        {
          helpers: {
            uppercase: (str: string) => str.toUpperCase(),
          },
        },
      );
      expect(result).toBe('ALICE');
    });

    test('custom helper with multiple args', () => {
      const result = render(
        '{{add a b}}',
        { a: 5, b: 3 },
        {
          helpers: {
            add: (a: number, b: number) => a + b,
          },
        },
      );
      expect(result).toBe('8');
    });

    test('custom helper with three args', () => {
      const result = render(
        '{{sum x y z}}',
        { x: 10, y: 20, z: 30 },
        {
          helpers: {
            sum: (a: number, b: number, c: number) => a + b + c,
          },
        },
      );
      expect(result).toBe('60');
    });

    test('custom helper with literal arguments', () => {
      const result = render(
        '{{multiply 7 6}}',
        {},
        {
          helpers: {
            multiply: (a: number, b: number) => a * b,
          },
        },
      );
      expect(result).toBe('42');
    });

    test('custom helper with mixed literal and path args', () => {
      const result = render(
        '{{concat prefix " - " name}}',
        { prefix: 'USER', name: 'Alice' },
        {
          helpers: {
            concat: (...args: string[]) => args.join(''),
          },
        },
      );
      expect(result).toBe('USER - Alice');
    });
  });

  describe('Helper Context Binding', () => {
    test('helper accessing context via this', () => {
      const result = render(
        '{{double}}',
        { value: 5 },
        {
          helpers: {
            double: function (this: any) {
              return this.value * 2;
            },
          },
        },
      );
      expect(result).toBe('10');
    });

    test('helper accessing nested context properties', () => {
      const result = render(
        '{{fullName}}',
        { person: { firstName: 'John', lastName: 'Doe' } },
        {
          helpers: {
            fullName: function (this: any) {
              return `${this.person.firstName} ${this.person.lastName}`;
            },
          },
        },
      );
      expect(result).toBe('John Doe');
    });

    test('helper with args and context access', () => {
      const result = render(
        '{{addToValue amount}}',
        { value: 100, amount: 50 },
        {
          helpers: {
            addToValue: function (this: any, amount: number) {
              return this.value + amount;
            },
          },
        },
      );
      expect(result).toBe('150');
    });
  });

  describe('Helpers in SubExpressions', () => {
    test('custom helper in subexpression', () => {
      const result = render(
        '{{#if (isAdmin role)}}Admin{{else}}User{{/if}}',
        { role: 'administrator' },
        {
          helpers: {
            isAdmin: (role: string) => role === 'administrator',
          },
        },
      );
      expect(result).toBe('Admin');
    });

    test('custom helper in nested subexpression', () => {
      const result = render(
        '{{#if (and (isActive status) (hasPermission role))}}Allowed{{else}}Denied{{/if}}',
        { status: 'active', role: 'editor' },
        {
          helpers: {
            isActive: (status: string) => status === 'active',
            hasPermission: (role: string) => role === 'editor' || role === 'admin',
          },
        },
      );
      expect(result).toBe('Allowed');
    });

    test('custom helper combined with built-in helper', () => {
      const result = render(
        '{{#if (and (gt age 18) (isVerified status))}}Access{{/if}}',
        { age: 25, status: 'verified' },
        {
          helpers: {
            isVerified: (status: string) => status === 'verified',
          },
        },
      );
      expect(result).toBe('Access');
    });
  });

  describe('Helper Overriding', () => {
    test('user helper overrides built-in helper', () => {
      const result = render(
        '{{#if (eq a b)}}yes{{else}}no{{/if}}',
        { a: 5, b: 3 },
        {
          helpers: {
            eq: () => true, // Always returns true
          },
        },
      );
      expect(result).toBe('yes');
    });

    test('can override comparison helper with custom logic', () => {
      const result = render(
        '{{#if (gt price 100)}}Expensive{{else}}Affordable{{/if}}',
        { price: 50 },
        {
          helpers: {
            gt: () => true, // Always expensive!
          },
        },
      );
      expect(result).toBe('Expensive');
    });

    test('can override logical helper', () => {
      const result = render(
        '{{#if (and x y)}}both{{else}}not both{{/if}}',
        { x: false, y: false },
        {
          helpers: {
            and: () => true, // Always true
          },
        },
      );
      expect(result).toBe('both');
    });
  });

  describe('Built-in Helpers Without Options', () => {
    test('built-in helpers work when options not provided', () => {
      const result = render('{{#if (gt score 80)}}Pass{{else}}Fail{{/if}}', {
        score: 90,
      });
      expect(result).toBe('Pass');
    });

    test('multiple built-in helpers without options', () => {
      const result = render('{{#if (and (gt age 18) (lt age 65))}}Working Age{{/if}}', { age: 30 });
      expect(result).toBe('Working Age');
    });

    test('built-in comparison helpers work', () => {
      const result = render('{{#if (eq status "active")}}Active{{/if}}', {
        status: 'active',
      });
      expect(result).toBe('Active');
    });
  });

  describe('Compiled Templates with Helpers', () => {
    test('compiled template accepts helpers at render time', () => {
      const compiled = compile('{{uppercase name}}');

      const result1 = compiled.render(
        { name: 'alice' },
        {
          helpers: {
            uppercase: (str: string) => str.toUpperCase(),
          },
        },
      );
      expect(result1).toBe('ALICE');

      const result2 = compiled.render(
        { name: 'bob' },
        {
          helpers: {
            uppercase: (str: string) => str.toUpperCase(),
          },
        },
      );
      expect(result2).toBe('BOB');
    });

    test('different helpers for same compiled template', () => {
      const compiled = compile('{{format value}}');

      const result1 = compiled.render(
        { value: 42 },
        {
          helpers: {
            format: (v: number) => `Number: ${v}`,
          },
        },
      );
      expect(result1).toBe('Number: 42');

      const result2 = compiled.render(
        { value: 42 },
        {
          helpers: {
            format: (v: number) => `Value: ${v * 2}`,
          },
        },
      );
      expect(result2).toBe('Value: 84');
    });

    test('compiled template works without helpers then with helpers', () => {
      const compiled = compile('{{#if (gt x 5)}}yes{{else}}no{{/if}}');

      // First render uses built-in gt
      const result1 = compiled.render({ x: 10 });
      expect(result1).toBe('yes');

      // Second render overrides gt
      const result2 = compiled.render(
        { x: 10 },
        {
          helpers: {
            gt: () => false, // Always false
          },
        },
      );
      expect(result2).toBe('no');
    });
  });

  describe('Complex Helper Scenarios', () => {
    test('helper returning formatted string', () => {
      const result = render(
        '{{currency amount}}',
        { amount: 1234.56 },
        {
          helpers: {
            currency: (amount: number) => `$${amount.toFixed(2)}`,
          },
        },
      );
      expect(result).toBe('$1234.56');
    });

    test('helper returning HTML (needs escaping)', () => {
      const result = render(
        '{{bold text}}',
        { text: 'hello' },
        {
          helpers: {
            bold: (text: string) => `<b>${text}</b>`,
          },
        },
      );
      // Output should be escaped
      expect(result).toBe('&lt;b&gt;hello&lt;/b&gt;');
    });

    test('helper with conditional logic', () => {
      const result = render(
        '{{pluralize count "item"}}',
        { count: 3 },
        {
          helpers: {
            pluralize: (count: number, word: string) => (count === 1 ? word : `${word}s`),
          },
        },
      );
      expect(result).toBe('items');
    });

    test('helper with default parameter', () => {
      const result = render(
        '{{#if (hasLength items)}}Has items{{else}}Empty{{/if}}',
        { items: [1, 2, 3] },
        {
          helpers: {
            hasLength: (arr: any[]) => arr && arr.length > 0,
          },
        },
      );
      expect(result).toBe('Has items');
    });

    test('multiple custom helpers in same template', () => {
      const result = render(
        '{{uppercase firstName}} {{lowercase lastName}} - {{age}} years old',
        { firstName: 'john', lastName: 'DOE', age: 30 },
        {
          helpers: {
            uppercase: (str: string) => str.toUpperCase(),
            lowercase: (str: string) => str.toLowerCase(),
          },
        },
      );
      expect(result).toBe('JOHN doe - 30 years old');
    });
  });

  describe('Error Handling', () => {
    test('unknown helper without fallback throws error', () => {
      expect(() => {
        render('{{unknownHelper value}}', { value: 42 });
      }).toThrow('Unknown helper: unknownHelper');
    });

    test('helper can be provided to fix unknown helper error', () => {
      const result = render(
        '{{customHelper value}}',
        { value: 42 },
        {
          helpers: {
            customHelper: (v: number) => v * 2,
          },
        },
      );
      expect(result).toBe('84');
    });
  });
});
