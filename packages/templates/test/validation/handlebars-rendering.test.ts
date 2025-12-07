/**
 * Handlebars Rendering Validation Tests
 *
 * Compares rendered output between Handlebars and our implementation
 * to ensure behavioral compatibility.
 */

import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { render } from '../../src/index';

interface TestCase {
  name: string;
  template: string;
  context: Record<string, any>;
  helpers?: Record<string, (...args: any[]) => any>;
}

const testCases: TestCase[] = [
  // ===== Variables and Paths =====
  {
    name: 'Simple variable',
    template: 'Hello {{name}}!',
    context: { name: 'World' },
  },
  {
    name: 'Nested path',
    template: '{{user.name}}',
    context: { user: { name: 'Alice' } },
  },
  {
    name: 'Deep path',
    template: '{{a.b.c.d}}',
    context: { a: { b: { c: { d: 'deep' } } } },
  },
  {
    name: 'Missing variable',
    template: '{{missing}}',
    context: {},
  },
  {
    name: 'Undefined value',
    template: '{{value}}',
    context: { value: undefined },
  },
  {
    name: 'Null value',
    template: '{{value}}',
    context: { value: null },
  },
  {
    name: 'Zero value',
    template: '{{value}}',
    context: { value: 0 },
  },
  {
    name: 'False value',
    template: '{{value}}',
    context: { value: false },
  },
  {
    name: 'Empty string',
    template: '{{value}}',
    context: { value: '' },
  },

  // ===== Escaping =====
  {
    name: 'HTML escaping with {{',
    template: '{{html}}',
    context: { html: '<script>alert("xss")</script>' },
  },
  {
    name: 'No escaping with {{{',
    template: '{{{html}}}',
    context: { html: '<strong>bold</strong>' },
  },

  // ===== Block Helpers - #if =====
  {
    name: '#if with truthy value',
    template: '{{#if value}}yes{{/if}}',
    context: { value: true },
  },
  {
    name: '#if with falsy value',
    template: '{{#if value}}yes{{/if}}',
    context: { value: false },
  },
  {
    name: '#if with else',
    template: '{{#if value}}yes{{else}}no{{/if}}',
    context: { value: false },
  },
  {
    name: '#if with 0',
    template: '{{#if value}}yes{{else}}no{{/if}}',
    context: { value: 0 },
  },
  {
    name: '#if with empty string',
    template: '{{#if value}}yes{{else}}no{{/if}}',
    context: { value: '' },
  },
  {
    name: '#if with null',
    template: '{{#if value}}yes{{else}}no{{/if}}',
    context: { value: null },
  },
  {
    name: '#if with undefined',
    template: '{{#if value}}yes{{else}}no{{/if}}',
    context: { value: undefined },
  },

  // ===== Block Helpers - #unless =====
  {
    name: '#unless with truthy',
    template: '{{#unless value}}yes{{/unless}}',
    context: { value: true },
  },
  {
    name: '#unless with falsy',
    template: '{{#unless value}}yes{{/unless}}',
    context: { value: false },
  },
  {
    name: '#unless with else',
    template: '{{#unless value}}no{{else}}yes{{/unless}}',
    context: { value: true },
  },

  // ===== Block Helpers - #each =====
  {
    name: '#each with array',
    template: '{{#each items}}{{this}},{{/each}}',
    context: { items: ['a', 'b', 'c'] },
  },
  {
    name: '#each with empty array',
    template: '{{#each items}}item{{else}}empty{{/each}}',
    context: { items: [] },
  },
  {
    name: '#each with object',
    template: '{{#each obj}}{{@key}}:{{this}},{{/each}}',
    context: { obj: { a: 1, b: 2 } },
  },
  {
    name: '#each with @index',
    template: '{{#each items}}{{@index}}:{{this}},{{/each}}',
    context: { items: ['x', 'y', 'z'] },
  },
  {
    name: '#each with @first',
    template: '{{#each items}}{{#if @first}}[{{/if}}{{this}}{{#if @first}}]{{/if}}{{/each}}',
    context: { items: ['a', 'b', 'c'] },
  },
  {
    name: '#each with @last',
    template: '{{#each items}}{{this}}{{#unless @last}},{{/unless}}{{/each}}',
    context: { items: ['a', 'b', 'c'] },
  },

  // ===== Block Helpers - #with =====
  {
    name: '#with changes context',
    template: '{{#with user}}{{name}}{{/with}}',
    context: { user: { name: 'Bob' } },
  },
  {
    name: '#with with null',
    template: '{{#with value}}yes{{else}}no{{/with}}',
    context: { value: null },
  },

  // ===== Parent Context Access =====
  {
    name: '../ to access parent',
    template: '{{#with inner}}{{../outer}}{{/with}}',
    context: { outer: 'parent', inner: { value: 'child' } },
  },
  {
    name: '../../ to access grandparent',
    template: '{{#with a}}{{#with b}}{{../../root}}{{/with}}{{/with}}',
    context: { root: 'top', a: { b: {} } },
  },

  // ===== Nested Blocks =====
  {
    name: 'Nested #if',
    template: '{{#if a}}{{#if b}}both{{/if}}{{/if}}',
    context: { a: true, b: true },
  },
  {
    name: 'Nested #each',
    template: '{{#each outer}}{{#each inner}}{{this}},{{/each}}|{{/each}}',
    context: { outer: [{ inner: [1, 2] }, { inner: [3, 4] }] },
  },

  // ===== Comparison Helpers =====
  {
    name: 'eq helper - equal',
    template: '{{#if (eq a b)}}yes{{else}}no{{/if}}',
    context: { a: 5, b: 5 },
    helpers: {
      eq: (a: any, b: any) => a === b,
    },
  },
  {
    name: 'eq helper - not equal',
    template: '{{#if (eq a b)}}yes{{else}}no{{/if}}',
    context: { a: 5, b: 10 },
    helpers: {
      eq: (a: any, b: any) => a === b,
    },
  },
  {
    name: 'ne helper',
    template: '{{#if (ne a b)}}different{{/if}}',
    context: { a: 5, b: 10 },
    helpers: {
      ne: (a: any, b: any) => a !== b,
    },
  },
  {
    name: 'gt helper',
    template: '{{#if (gt a b)}}greater{{/if}}',
    context: { a: 10, b: 5 },
    helpers: {
      gt: (a: any, b: any) => a > b,
    },
  },
  {
    name: 'lt helper',
    template: '{{#if (lt a b)}}less{{/if}}',
    context: { a: 5, b: 10 },
    helpers: {
      lt: (a: any, b: any) => a < b,
    },
  },
  {
    name: 'and helper - both true',
    template: '{{#if (and a b)}}yes{{/if}}',
    context: { a: true, b: true },
    helpers: {
      and: (a: any, b: any) => a && b,
    },
  },
  {
    name: 'and helper - one false',
    template: '{{#if (and a b)}}yes{{else}}no{{/if}}',
    context: { a: true, b: false },
    helpers: {
      and: (a: any, b: any) => a && b,
    },
  },
  {
    name: 'or helper',
    template: '{{#if (or a b)}}yes{{/if}}',
    context: { a: false, b: true },
    helpers: {
      or: (a: any, b: any) => a || b,
    },
  },
  {
    name: 'not helper',
    template: '{{#if (not value)}}inverted{{/if}}',
    context: { value: false },
    helpers: {
      not: (a: any) => !a,
    },
  },

  // ===== Custom Helpers =====
  {
    name: 'Custom helper without args',
    template: '{{timestamp}}',
    context: {},
    helpers: {
      timestamp: () => '2024-01-01',
    },
  },
  {
    name: 'Custom helper with args',
    template: '{{uppercase name}}',
    context: { name: 'alice' },
    helpers: {
      uppercase: (str: string) => str.toUpperCase(),
    },
  },
  {
    name: 'Custom helper with multiple args',
    template: '{{add a b}}',
    context: { a: 5, b: 3 },
    helpers: {
      add: (a: number, b: number) => a + b,
    },
  },

  // ===== Real-world Scenarios =====
  {
    name: 'User list with conditional',
    template: '{{#each users}}{{#if active}}{{name}} (active){{else}}{{name}}{{/if}}\n{{/each}}',
    context: {
      users: [
        { name: 'Alice', active: true },
        { name: 'Bob', active: false },
        { name: 'Carol', active: true },
      ],
    },
  },
  {
    name: 'Nested object navigation',
    template: '{{company.employees.0.name}}',
    context: {
      company: {
        employees: [{ name: 'Alice' }, { name: 'Bob' }],
      },
    },
  },
  {
    name: 'Combining paths and helpers',
    template:
      '{{#if (eq user.role "admin")}}Admin: {{user.name}}{{else}}User: {{user.name}}{{/if}}',
    context: { user: { name: 'Alice', role: 'admin' } },
    helpers: {
      eq: (a: any, b: any) => a === b,
    },
  },
];

describe('Handlebars Rendering Validation', () => {
  testCases.forEach(({ name, template, context, helpers = {} }) => {
    it(name, () => {
      // Register helpers with Handlebars
      Object.entries(helpers).forEach(([helperName, helperFn]) => {
        Handlebars.registerHelper(helperName, helperFn);
      });

      // Render with both implementations
      const hbsResult = Handlebars.compile(template)(context);
      const ourResult = render(template, context, { helpers });

      // Unregister helpers for next test
      Object.keys(helpers).forEach((helperName) => {
        Handlebars.unregisterHelper(helperName);
      });

      // Compare results
      expect(ourResult).toBe(hbsResult);
    });
  });
});
