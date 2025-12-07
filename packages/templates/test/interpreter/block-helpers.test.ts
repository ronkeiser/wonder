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
