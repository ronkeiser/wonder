/**
 * Block Helper Tests
 *
 * Unit tests for #if, #unless, #each, and #with block helpers.
 */

import { describe, expect, it } from 'vitest';
import { Interpreter } from '../../src/interpreter/interpreter.js';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';

/**
 * Helper function to render a template with context
 */
function render(template: string, context: any): string {
  const lexer = new Lexer();
  const parser = new Parser(lexer);
  parser.setInput(template);
  const ast = parser.parse();
  const interpreter = new Interpreter(ast);
  return interpreter.evaluate(context);
}

describe('Block Helpers - #if', () => {
  describe('truthy values', () => {
    it('should render main block for non-empty string', () => {
      const template = '{{#if name}}Hello {{name}}!{{/if}}';
      const result = render(template, { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should render main block for non-zero number', () => {
      const template = '{{#if count}}Count: {{count}}{{/if}}';
      expect(render(template, { count: 5 })).toBe('Count: 5');
      expect(render(template, { count: -1 })).toBe('Count: -1');
    });

    it('should render main block for zero (truthy in Handlebars)', () => {
      const template = '{{#if value}}Value is {{value}}{{/if}}';
      const result = render(template, { value: 0 });
      expect(result).toBe('Value is 0');
    });

    it('should render main block for true', () => {
      const template = '{{#if active}}Active{{/if}}';
      const result = render(template, { active: true });
      expect(result).toBe('Active');
    });

    it('should render main block for non-empty array', () => {
      const template = '{{#if items}}Has items{{/if}}';
      const result = render(template, { items: [1, 2, 3] });
      expect(result).toBe('Has items');
    });

    it('should render main block for empty object (truthy in Handlebars)', () => {
      const template = '{{#if obj}}Has object{{/if}}';
      const result = render(template, { obj: {} });
      expect(result).toBe('Has object');
    });

    it('should render main block for object with properties', () => {
      const template = '{{#if user}}User exists{{/if}}';
      const result = render(template, { user: { name: 'Alice' } });
      expect(result).toBe('User exists');
    });
  });

  describe('falsy values', () => {
    it('should not render main block for empty string', () => {
      const template = '{{#if name}}Hello{{/if}}';
      const result = render(template, { name: '' });
      expect(result).toBe('');
    });

    it('should not render main block for false', () => {
      const template = '{{#if active}}Active{{/if}}';
      const result = render(template, { active: false });
      expect(result).toBe('');
    });

    it('should not render main block for null', () => {
      const template = '{{#if value}}Has value{{/if}}';
      const result = render(template, { value: null });
      expect(result).toBe('');
    });

    it('should not render main block for undefined', () => {
      const template = '{{#if value}}Has value{{/if}}';
      const result = render(template, { value: undefined });
      expect(result).toBe('');
    });

    it('should not render main block for empty array', () => {
      const template = '{{#if items}}Has items{{/if}}';
      const result = render(template, { items: [] });
      expect(result).toBe('');
    });

    it('should not render main block for missing property', () => {
      const template = '{{#if missing}}Has value{{/if}}';
      const result = render(template, {});
      expect(result).toBe('');
    });
  });

  describe('with else block', () => {
    it('should render main block when truthy', () => {
      const template = '{{#if active}}Yes{{else}}No{{/if}}';
      const result = render(template, { active: true });
      expect(result).toBe('Yes');
    });

    it('should render else block when falsy', () => {
      const template = '{{#if active}}Yes{{else}}No{{/if}}';
      const result = render(template, { active: false });
      expect(result).toBe('No');
    });

    it('should render else block for empty string', () => {
      const template = '{{#if name}}Hello {{name}}{{else}}No name{{/if}}';
      const result = render(template, { name: '' });
      expect(result).toBe('No name');
    });

    it('should render else block for null', () => {
      const template = '{{#if user}}Has user{{else}}No user{{/if}}';
      const result = render(template, { user: null });
      expect(result).toBe('No user');
    });

    it('should render else block for empty array', () => {
      const template = '{{#if items}}Has items{{else}}No items{{/if}}';
      const result = render(template, { items: [] });
      expect(result).toBe('No items');
    });

    it('should render main block for zero with else', () => {
      const template = '{{#if count}}Count: {{count}}{{else}}No count{{/if}}';
      const result = render(template, { count: 0 });
      expect(result).toBe('Count: 0');
    });

    it('should render main block for empty object with else', () => {
      const template = '{{#if obj}}Has object{{else}}No object{{/if}}';
      const result = render(template, { obj: {} });
      expect(result).toBe('Has object');
    });
  });

  describe('nested conditions', () => {
    it('should handle nested #if blocks', () => {
      const template = '{{#if a}}A{{#if b}}B{{/if}}{{/if}}';
      expect(render(template, { a: true, b: true })).toBe('AB');
      expect(render(template, { a: true, b: false })).toBe('A');
      expect(render(template, { a: false, b: true })).toBe('');
    });

    it('should handle nested #if with else blocks', () => {
      const template = '{{#if a}}{{#if b}}AB{{else}}A{{/if}}{{else}}None{{/if}}';
      expect(render(template, { a: true, b: true })).toBe('AB');
      expect(render(template, { a: true, b: false })).toBe('A');
      expect(render(template, { a: false, b: true })).toBe('None');
      expect(render(template, { a: false, b: false })).toBe('None');
    });
  });

  describe('with content and variables', () => {
    it('should render content and variables in main block', () => {
      const template = '{{#if user}}User: {{user.name}}, Age: {{user.age}}{{/if}}';
      const result = render(template, { user: { name: 'Alice', age: 30 } });
      expect(result).toBe('User: Alice, Age: 30');
    });

    it('should render content in else block', () => {
      const template = '{{#if user}}User: {{user.name}}{{else}}No user found{{/if}}';
      const result = render(template, { user: null });
      expect(result).toBe('No user found');
    });
  });

  describe('edge cases', () => {
    it('should handle nested property in condition', () => {
      const template = '{{#if user.profile.active}}Active{{else}}Inactive{{/if}}';
      expect(render(template, { user: { profile: { active: true } } })).toBe('Active');
      expect(render(template, { user: { profile: { active: false } } })).toBe('Inactive');
      expect(render(template, { user: { profile: {} } })).toBe('Inactive');
    });

    it('should handle this in condition', () => {
      const template = '{{#if this}}Yes{{else}}No{{/if}}';
      expect(render(template, 'string')).toBe('Yes');
      expect(render(template, '')).toBe('No');
      expect(render(template, 0)).toBe('Yes'); // 0 is truthy in Handlebars
      expect(render(template, false)).toBe('No');
    });
  });
});

describe('Block Helpers - #unless', () => {
  describe('truthy values (render else block)', () => {
    it('should not render main block for non-empty string', () => {
      const template = '{{#unless name}}No name{{/unless}}';
      const result = render(template, { name: 'World' });
      expect(result).toBe('');
    });

    it('should not render main block for true', () => {
      const template = '{{#unless active}}Inactive{{/unless}}';
      const result = render(template, { active: true });
      expect(result).toBe('');
    });

    it('should not render main block for zero (truthy in Handlebars)', () => {
      const template = '{{#unless value}}No value{{/unless}}';
      const result = render(template, { value: 0 });
      expect(result).toBe('');
    });

    it('should not render main block for empty object (truthy)', () => {
      const template = '{{#unless obj}}No object{{/unless}}';
      const result = render(template, { obj: {} });
      expect(result).toBe('');
    });
  });

  describe('falsy values (render main block)', () => {
    it('should render main block for empty string', () => {
      const template = '{{#unless name}}No name{{/unless}}';
      const result = render(template, { name: '' });
      expect(result).toBe('No name');
    });

    it('should render main block for false', () => {
      const template = '{{#unless active}}Inactive{{/unless}}';
      const result = render(template, { active: false });
      expect(result).toBe('Inactive');
    });

    it('should render main block for null', () => {
      const template = '{{#unless value}}No value{{/unless}}';
      const result = render(template, { value: null });
      expect(result).toBe('No value');
    });

    it('should render main block for undefined', () => {
      const template = '{{#unless value}}No value{{/unless}}';
      const result = render(template, { value: undefined });
      expect(result).toBe('No value');
    });

    it('should render main block for empty array', () => {
      const template = '{{#unless items}}No items{{/unless}}';
      const result = render(template, { items: [] });
      expect(result).toBe('No items');
    });
  });

  describe('with else block', () => {
    it('should render else block when truthy', () => {
      const template = '{{#unless active}}Inactive{{else}}Active{{/unless}}';
      const result = render(template, { active: true });
      expect(result).toBe('Active');
    });

    it('should render main block when falsy', () => {
      const template = '{{#unless active}}Inactive{{else}}Active{{/unless}}';
      const result = render(template, { active: false });
      expect(result).toBe('Inactive');
    });

    it('should render else block for zero (truthy)', () => {
      const template = '{{#unless count}}No count{{else}}Count: {{count}}{{/unless}}';
      const result = render(template, { count: 0 });
      expect(result).toBe('Count: 0');
    });
  });

  describe('nested with #if', () => {
    it('should handle #unless nested in #if', () => {
      const template = '{{#if hasUser}}{{#unless verified}}Unverified{{/unless}}{{/if}}';
      expect(render(template, { hasUser: true, verified: false })).toBe('Unverified');
      expect(render(template, { hasUser: true, verified: true })).toBe('');
      expect(render(template, { hasUser: false, verified: false })).toBe('');
    });

    it('should handle #if nested in #unless', () => {
      const template = '{{#unless disabled}}{{#if active}}Active{{/if}}{{/unless}}';
      expect(render(template, { disabled: false, active: true })).toBe('Active');
      expect(render(template, { disabled: false, active: false })).toBe('');
      expect(render(template, { disabled: true, active: true })).toBe('');
    });
  });

  describe('with content and variables', () => {
    it('should render content in main block', () => {
      const template = '{{#unless loggedIn}}Please <a href="/login">log in</a>{{/unless}}';
      const result = render(template, { loggedIn: false });
      expect(result).toBe('Please <a href="/login">log in</a>');
    });

    it('should render variables in else block', () => {
      const template = '{{#unless error}}Success{{else}}Error: {{error}}{{/unless}}';
      const result = render(template, { error: 'Not found' });
      expect(result).toBe('Error: Not found');
    });
  });
});

describe('Block Helpers - #each (Arrays)', () => {
  describe('basic iteration', () => {
    it('should iterate over array of strings', () => {
      const template = '{{#each items}}{{this}}{{/each}}';
      const result = render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('abc');
    });

    it('should iterate over array of numbers', () => {
      const template = '{{#each nums}}{{this}}{{/each}}';
      const result = render(template, { nums: [1, 2, 3] });
      expect(result).toBe('123');
    });

    it('should iterate over single-item array', () => {
      const template = '{{#each items}}Item: {{this}}{{/each}}';
      const result = render(template, { items: ['only'] });
      expect(result).toBe('Item: only');
    });

    it('should handle array with separators', () => {
      const template = '{{#each items}}{{this}}, {{/each}}';
      const result = render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('a, b, c, ');
    });

    it('should iterate over array of objects', () => {
      const template = '{{#each users}}{{name}} {{/each}}';
      const context = {
        users: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }],
      };
      const result = render(template, context);
      expect(result).toBe('Alice Bob Charlie ');
    });
  });

  describe('loop metadata - @index', () => {
    it('should provide @index for each iteration', () => {
      const template = '{{#each items}}{{@index}}{{/each}}';
      const result = render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('012');
    });

    it('should use @index with content', () => {
      const template = '{{#each items}}{{@index}}: {{this}} {{/each}}';
      const result = render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('0: a 1: b 2: c ');
    });

    it('should provide correct @index for single item', () => {
      const template = '{{#each items}}{{@index}}{{/each}}';
      const result = render(template, { items: ['x'] });
      expect(result).toBe('0');
    });
  });

  describe('loop metadata - @first', () => {
    it('should set @first to true for first iteration', () => {
      const template = '{{#each items}}{{#if @first}}F{{/if}}{{this}}{{/each}}';
      const result = render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('Fabc');
    });

    it('should only set @first for first item', () => {
      const template = '{{#each items}}{{#if @first}}First: {{/if}}{{this}} {{/each}}';
      const result = render(template, { items: ['a', 'b'] });
      expect(result).toBe('First: a b ');
    });

    it('should handle @first with single item', () => {
      const template = '{{#each items}}{{#if @first}}Y{{else}}N{{/if}}{{/each}}';
      const result = render(template, { items: ['x'] });
      expect(result).toBe('Y');
    });
  });

  describe('loop metadata - @last', () => {
    it('should set @last to true for last iteration', () => {
      const template = '{{#each items}}{{this}}{{#if @last}}L{{/if}}{{/each}}';
      const result = render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('abcL');
    });

    it('should only set @last for last item', () => {
      const template = '{{#each items}}{{this}}{{#if @last}}.{{else}}, {{/if}}{{/each}}';
      const result = render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('a, b, c.');
    });

    it('should handle @last with single item', () => {
      const template = '{{#each items}}{{#if @last}}Y{{else}}N{{/if}}{{/each}}';
      const result = render(template, { items: ['x'] });
      expect(result).toBe('Y');
    });
  });

  describe('combined loop metadata', () => {
    it('should combine @index, @first, and @last', () => {
      const template =
        '{{#each items}}[{{@index}}{{#if @first}}F{{/if}}{{#if @last}}L{{/if}}]{{/each}}';
      const result = render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('[0F][1][2L]');
    });

    it('should format list with proper punctuation', () => {
      const template = '{{#each items}}{{this}}{{#if @last}}.{{else}}, {{/if}}{{/each}}';
      const result = render(template, { items: ['Alice', 'Bob', 'Charlie'] });
      expect(result).toBe('Alice, Bob, Charlie.');
    });
  });

  describe('context access', () => {
    it('should access nested properties in objects', () => {
      const template = '{{#each users}}{{name}}: {{email}} {{/each}}';
      const context = {
        users: [
          { name: 'Alice', email: 'alice@example.com' },
          { name: 'Bob', email: 'bob@example.com' },
        ],
      };
      const result = render(template, context);
      expect(result).toBe('Alice: alice@example.com Bob: bob@example.com ');
    });

    it('should access parent context with ../', () => {
      const template = '{{#each items}}{{../title}}: {{this}} {{/each}}';
      const context = { title: 'List', items: ['a', 'b', 'c'] };
      const result = render(template, context);
      expect(result).toBe('List: a List: b List: c ');
    });

    it('should access deeply nested parent context', () => {
      const template = '{{#each items}}{{../../grandparent}} > {{../parent}} > {{this}} {{/each}}';
      const context = {
        grandparent: 'GP',
        parent: 'P',
        items: ['a', 'b'],
      };
      const result = render(template, context);
      expect(result).toBe('GP > P > a GP > P > b ');
    });

    it('should access this context explicitly', () => {
      const template = '{{#each items}}{{this.name}}{{/each}}';
      const context = { items: [{ name: 'A' }, { name: 'B' }] };
      const result = render(template, context);
      expect(result).toBe('AB');
    });
  });

  describe('else block (inverse)', () => {
    it('should render else block for empty array', () => {
      const template = '{{#each items}}Item{{else}}Empty{{/each}}';
      const result = render(template, { items: [] });
      expect(result).toBe('Empty');
    });

    it('should render else block with content', () => {
      const template = '{{#each items}}{{this}}{{else}}No items found{{/each}}';
      const result = render(template, { items: [] });
      expect(result).toBe('No items found');
    });

    it('should render else block with variables', () => {
      const template = '{{#each items}}{{this}}{{else}}Count: {{count}}{{/each}}';
      const result = render(template, { items: [], count: 0 });
      expect(result).toBe('Count: 0');
    });

    it('should not render else block for non-empty array', () => {
      const template = '{{#each items}}X{{else}}Empty{{/each}}';
      const result = render(template, { items: [1] });
      expect(result).toBe('X');
    });
  });

  describe('edge cases', () => {
    it('should handle array with mixed primitive types', () => {
      const template = '{{#each items}}{{this}},{{/each}}';
      const result = render(template, { items: [1, 'two', true, null] });
      expect(result).toBe('1,two,true,,');
    });

    it('should handle array with boolean values', () => {
      const template = '{{#each flags}}{{this}}{{/each}}';
      const result = render(template, { flags: [true, false, true] });
      expect(result).toBe('truefalsetrue');
    });

    it('should handle array with null and undefined', () => {
      const template = '{{#each items}}[{{this}}]{{/each}}';
      const result = render(template, { items: [null, undefined, 'value'] });
      expect(result).toBe('[][][value]');
    });
  });

  describe('sparse arrays', () => {
    it('should skip holes in sparse arrays', () => {
      const template = '{{#each items}}{{this}}{{/each}}';
      // Create sparse array: [1, <empty>, 3]
      const items = [1, , 3]; // eslint-disable-line no-sparse-arrays
      const result = render(template, { items });
      expect(result).toBe('13');
    });

    it('should maintain correct @index for sparse arrays', () => {
      const template = '{{#each items}}{{@index}}:{{this}} {{/each}}';
      // Create sparse array: ['a', <empty>, 'c']
      const items = ['a', , 'c']; // eslint-disable-line no-sparse-arrays
      const result = render(template, { items });
      expect(result).toBe('0:a 2:c ');
    });

    it('should set @first correctly for sparse arrays', () => {
      const template = '{{#each items}}{{#if @first}}F{{/if}}{{this}}{{/each}}';
      // Create sparse array: [<empty>, 'b', 'c']
      const items = [, 'b', 'c']; // eslint-disable-line no-sparse-arrays
      const result = render(template, { items });
      expect(result).toBe('Fbc');
    });

    it('should set @last correctly for sparse arrays', () => {
      const template = '{{#each items}}{{this}}{{#if @last}}L{{/if}}{{/each}}';
      // Create sparse array: ['a', 'b', <empty>]
      const items = ['a', 'b', ,]; // eslint-disable-line no-sparse-arrays
      const result = render(template, { items });
      expect(result).toBe('abL');
    });
  });

  describe('non-iterable values', () => {
    it('should render else block for null', () => {
      const template = '{{#each items}}X{{else}}Null{{/each}}';
      const result = render(template, { items: null });
      expect(result).toBe('Null');
    });

    it('should render else block for undefined', () => {
      const template = '{{#each items}}X{{else}}Undefined{{/each}}';
      const result = render(template, { items: undefined });
      expect(result).toBe('Undefined');
    });

    it('should render else block for string (not iterable in this context)', () => {
      const template = '{{#each items}}X{{else}}Not array{{/each}}';
      const result = render(template, { items: 'string' });
      expect(result).toBe('Not array');
    });

    it('should render else block for number', () => {
      const template = '{{#each items}}X{{else}}Not array{{/each}}';
      const result = render(template, { items: 42 });
      expect(result).toBe('Not array');
    });
  });

  describe('#each - Object Iteration', () => {
    describe('Basic iteration', () => {
      it('iterates over object properties', () => {
        const template = '{{#each user}}{{@key}}: {{this}}, {{/each}}';
        const result = render(template, { user: { name: 'Alice', age: 30 } });
        expect(result).toBe('name: Alice, age: 30, ');
      });

      it('handles single property', () => {
        const template = '{{#each obj}}{{@key}}={{this}}{{/each}}';
        const result = render(template, { obj: { x: 42 } });
        expect(result).toBe('x=42');
      });

      it('handles multiple properties with formatting', () => {
        const template = '{{#each data}}[{{@key}}={{this}}]{{/each}}';
        const result = render(template, { data: { a: 1, b: 2, c: 3 } });
        expect(result).toBe('[a=1][b=2][c=3]');
      });
    });

    describe('@key access', () => {
      it('provides property name via @key', () => {
        const template = '{{#each obj}}{{@key}} {{/each}}';
        const result = render(template, { obj: { x: 1, y: 2, z: 3 } });
        expect(result).toBe('x y z ');
      });

      it('combines @key with @index', () => {
        const template = '{{#each obj}}{{@index}}.{{@key}} {{/each}}';
        const result = render(template, { obj: { a: 10, b: 20, c: 30 } });
        expect(result).toBe('0.a 1.b 2.c ');
      });

      it('uses @key in nested content', () => {
        const template = '{{#each items}}key={{@key}},value={{this}};{{/each}}';
        const result = render(template, { items: { first: 'A', second: 'B' } });
        expect(result).toBe('key=first,value=A;key=second,value=B;');
      });
    });

    describe('Loop metadata', () => {
      it('@first identifies first property', () => {
        const template = '{{#each obj}}{{#if @first}}START:{{/if}}{{@key}} {{/each}}';
        const result = render(template, { obj: { a: 1, b: 2, c: 3 } });
        expect(result).toBe('START:a b c ');
      });

      it('@last identifies last property', () => {
        const template = '{{#each obj}}{{@key}}{{#unless @last}}, {{/unless}}{{/each}}';
        const result = render(template, { obj: { x: 1, y: 2, z: 3 } });
        expect(result).toBe('x, y, z');
      });

      it('combines multiple metadata flags', () => {
        const template =
          '{{#each obj}}{{@index}}:{{@key}}={{this}}{{#unless @last}};{{/unless}}{{/each}}';
        const result = render(template, { obj: { a: 10, b: 20 } });
        expect(result).toBe('0:a=10;1:b=20');
      });

      it('@first and @last work with single property', () => {
        const template = '{{#each obj}}{{#if @first}}F{{/if}}{{#if @last}}L{{/if}}{{/each}}';
        const result = render(template, { obj: { only: 'one' } });
        expect(result).toBe('FL');
      });
    });

    describe('Context access', () => {
      it('property value becomes this context', () => {
        const template = '{{#each users}}{{name}} ({{email}}), {{/each}}';
        const result = render(template, {
          users: {
            alice: { name: 'Alice', email: 'alice@example.com' },
            bob: { name: 'Bob', email: 'bob@example.com' },
          },
        });
        expect(result).toBe('Alice (alice@example.com), Bob (bob@example.com), ');
      });

      it('can access parent context', () => {
        const template = '{{#each items}}{{@key}}: {{this}} from {{../title}}; {{/each}}';
        const result = render(template, {
          title: 'Report',
          items: { a: 1, b: 2 },
        });
        expect(result).toBe('a: 1 from Report; b: 2 from Report; ');
      });

      it('nested object properties accessible', () => {
        const template = '{{#each people}}{{@key}}: {{profile.age}}, {{/each}}';
        const result = render(template, {
          people: {
            john: { profile: { age: 30 } },
            jane: { profile: { age: 28 } },
          },
        });
        expect(result).toBe('john: 30, jane: 28, ');
      });
    });

    describe('Else blocks', () => {
      it('empty object renders else block', () => {
        const template = '{{#each obj}}{{@key}}{{else}}Empty{{/each}}';
        const result = render(template, { obj: {} });
        expect(result).toBe('Empty');
      });

      it('else block has access to context variables', () => {
        const template = '{{#each data}}{{@key}}{{else}}No data for {{title}}{{/each}}';
        const result = render(template, { title: 'Test', data: {} });
        expect(result).toBe('No data for Test');
      });
    });
  });

  describe('#with Helper', () => {
    describe('Basic usage', () => {
      it('changes context to nested object', () => {
        const template = '{{#with user}}{{name}} - {{email}}{{/with}}';
        const result = render(template, {
          user: { name: 'Alice', email: 'alice@example.com' },
        });
        expect(result).toBe('Alice - alice@example.com');
      });

      it('accesses deeply nested properties', () => {
        const template = '{{#with company.address}}{{city}}, {{state}}{{/with}}';
        const result = render(template, {
          company: { address: { city: 'Seattle', state: 'WA' } },
        });
        expect(result).toBe('Seattle, WA');
      });

      it('works with single property access', () => {
        const template = '{{#with config}}Value: {{timeout}}{{/with}}';
        const result = render(template, {
          config: { timeout: 5000 },
        });
        expect(result).toBe('Value: 5000');
      });
    });

    describe('Context access', () => {
      it('parent context accessible via ../', () => {
        const template = '{{#with settings}}{{title}}: {{../user.name}}{{/with}}';
        const result = render(template, {
          user: { name: 'Bob' },
          settings: { title: 'Config' },
        });
        expect(result).toBe('Config: Bob');
      });

      it('this keyword references new context', () => {
        const template = '{{#with user}}Name: {{this.name}}, Age: {{this.age}}{{/with}}';
        const result = render(template, {
          user: { name: 'Charlie', age: 35 },
        });
        expect(result).toBe('Name: Charlie, Age: 35');
      });

      it('deep parent access through multiple levels', () => {
        const template = '{{#with a}}{{#with b}}{{../../root}}{{/with}}{{/with}}';
        const result = render(template, {
          root: 'TOP',
          a: { b: { value: 'nested' } },
        });
        expect(result).toBe('TOP');
      });

      it('can access array indices in nested context', () => {
        const template = '{{#with data}}{{items.0}} and {{items.1}}{{/with}}';
        const result = render(template, {
          data: { items: ['first', 'second', 'third'] },
        });
        expect(result).toBe('first and second');
      });
    });

    describe('Else blocks', () => {
      it('renders else block for missing property', () => {
        const template = '{{#with missing}}Has value{{else}}No value{{/with}}';
        const result = render(template, {});
        expect(result).toBe('No value');
      });

      it('renders else block for null value', () => {
        const template = '{{#with data}}Content{{else}}Null data{{/with}}';
        const result = render(template, { data: null });
        expect(result).toBe('Null data');
      });

      it('renders else block for undefined', () => {
        const template = '{{#with value}}Has value{{else}}Undefined{{/with}}';
        const result = render(template, { value: undefined });
        expect(result).toBe('Undefined');
      });

      it('else block can access parent context', () => {
        const template = '{{#with data}}Content{{else}}Missing: {{title}}{{/with}}';
        const result = render(template, { title: 'Report' });
        expect(result).toBe('Missing: Report');
      });
    });

    describe('Edge cases', () => {
      it('false value renders else block', () => {
        const template = '{{#with flag}}True{{else}}False{{/with}}';
        const result = render(template, { flag: false });
        expect(result).toBe('False');
      });

      it('zero value renders main block (0 is truthy in Handlebars)', () => {
        const template = '{{#with count}}Count: {{this}}{{else}}No count{{/with}}';
        const result = render(template, { count: 0 });
        expect(result).toBe('Count: 0');
      });

      it('empty string renders else block', () => {
        const template = '{{#with text}}Has text{{else}}Empty{{/with}}';
        const result = render(template, { text: '' });
        expect(result).toBe('Empty');
      });

      it('empty array renders else block', () => {
        const template = '{{#with items}}Has items{{else}}Empty array{{/with}}';
        const result = render(template, { items: [] });
        expect(result).toBe('Empty array');
      });

      it('non-empty object renders main block', () => {
        const template = '{{#with obj}}Has: {{x}}{{else}}Empty{{/with}}';
        const result = render(template, { obj: { x: 1 } });
        expect(result).toBe('Has: 1');
      });
    });
  });
});
