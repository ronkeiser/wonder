/**
 * Integration Tests for Interpreter
 *
 * Tests the full pipeline: Lexer → Parser → Interpreter
 */

import { describe, expect, it } from 'vitest';
import { Interpreter } from '../../src/interpreter/interpreter.js';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';

/**
 * Helper function to compile and render a template
 */
function render(template: string, context: any): string {
  const lexer = new Lexer();
  const parser = new Parser(lexer);
  parser.setInput(template); // This calls lexer.tokenize() internally
  const ast = parser.parse();
  const interpreter = new Interpreter(ast);
  return interpreter.evaluate(context);
}

describe('Interpreter Integration Tests', () => {
  describe('C4-IT-T1: Simple Variable Resolution', () => {
    it('should resolve simple variable', () => {
      const template = 'Hello {{name}}!';
      const context = { name: 'World' };
      const result = render(template, context);
      expect(result).toBe('Hello World!');
    });

    it('should resolve multiple variables', () => {
      const template = '{{greeting}} {{name}}!';
      const context = { greeting: 'Hello', name: 'World' };
      const result = render(template, context);
      expect(result).toBe('Hello World!');
    });

    it('should handle variables with whitespace in mustache', () => {
      const template = '{{  name  }}';
      const context = { name: 'World' };
      const result = render(template, context);
      expect(result).toBe('World');
    });

    it('should handle empty context', () => {
      const template = 'Hello {{name}}!';
      const context = {};
      const result = render(template, context);
      expect(result).toBe('Hello !');
    });

    it('should handle missing variable', () => {
      const template = '{{missing}}';
      const context = { present: 'value' };
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should handle template with only content', () => {
      const template = 'Just plain text';
      const context = {};
      const result = render(template, context);
      expect(result).toBe('Just plain text');
    });

    it('should handle template with only variable', () => {
      const template = '{{value}}';
      const context = { value: 'result' };
      const result = render(template, context);
      expect(result).toBe('result');
    });

    it('should handle multiple variables with content', () => {
      const template = 'Hello {{first}} {{last}}! You are {{age}} years old.';
      const context = { first: 'John', last: 'Doe', age: 30 };
      const result = render(template, context);
      expect(result).toBe('Hello John Doe! You are 30 years old.');
    });
  });

  describe('C4-IT-T2: Nested Property Access', () => {
    it('should resolve nested property', () => {
      const template = '{{user.profile.name}}';
      const context = { user: { profile: { name: 'Alice' } } };
      const result = render(template, context);
      expect(result).toBe('Alice');
    });

    it('should resolve two-level nested property', () => {
      const template = '{{user.name}}';
      const context = { user: { name: 'Bob' } };
      const result = render(template, context);
      expect(result).toBe('Bob');
    });

    it('should handle missing intermediate property', () => {
      const template = '{{user.profile.name}}';
      const context = { user: {} };
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should handle null intermediate property', () => {
      const template = '{{user.profile.name}}';
      const context = { user: { profile: null } };
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should resolve multiple nested properties', () => {
      const template = '{{a.b}} and {{x.y.z}}';
      const context = { a: { b: 'first' }, x: { y: { z: 'second' } } };
      const result = render(template, context);
      expect(result).toBe('first and second');
    });

    it('should handle deeply nested properties', () => {
      const template = '{{a.b.c.d.e}}';
      const context = { a: { b: { c: { d: { e: 'deep' } } } } };
      const result = render(template, context);
      expect(result).toBe('deep');
    });
  });

  describe('C4-IT-T3: Array Index Access', () => {
    it('should access first array element', () => {
      const template = '{{items.0}}';
      const context = { items: ['first', 'second', 'third'] };
      const result = render(template, context);
      expect(result).toBe('first');
    });

    it('should access second array element', () => {
      const template = '{{items.1}}';
      const context = { items: ['first', 'second', 'third'] };
      const result = render(template, context);
      expect(result).toBe('second');
    });

    it('should access multiple array elements', () => {
      const template = '{{items.0}} and {{items.1}}';
      const context = { items: ['first', 'second'] };
      const result = render(template, context);
      expect(result).toBe('first and second');
    });

    it('should handle out-of-bounds array access', () => {
      const template = '{{items.99}}';
      const context = { items: ['first', 'second'] };
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should access property of array element', () => {
      const template = '{{users.0.name}}';
      const context = { users: [{ name: 'Alice' }, { name: 'Bob' }] };
      const result = render(template, context);
      expect(result).toBe('Alice');
    });

    it('should handle nested array access', () => {
      const template = '{{matrix.0.1}}';
      const context = {
        matrix: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      };
      const result = render(template, context);
      expect(result).toBe('b');
    });
  });

  describe('C4-IT-T4: Mixed Content and Variables', () => {
    it('should mix content and variables', () => {
      const template = 'Hello {{first}} {{last}}! You are {{age}} years old.';
      const context = { first: 'John', last: 'Doe', age: 30 };
      const result = render(template, context);
      expect(result).toBe('Hello John Doe! You are 30 years old.');
    });

    it('should handle newlines in content', () => {
      const template = 'Line 1\n{{value}}\nLine 3';
      const context = { value: 'Line 2' };
      const result = render(template, context);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle tabs in content', () => {
      const template = '\t{{value}}\t';
      const context = { value: 'text' };
      const result = render(template, context);
      expect(result).toBe('\ttext\t');
    });

    it('should handle many variables in sequence', () => {
      const template = '{{a}}{{b}}{{c}}{{d}}';
      const context = { a: '1', b: '2', c: '3', d: '4' };
      const result = render(template, context);
      expect(result).toBe('1234');
    });

    it('should preserve exact spacing', () => {
      const template = '{{a}}  {{b}}   {{c}}';
      const context = { a: 'x', b: 'y', c: 'z' };
      const result = render(template, context);
      expect(result).toBe('x  y   z');
    });
  });

  describe('C4-IT-T5: HTML Escaping', () => {
    it('should escape HTML by default', () => {
      const template = '{{html}}';
      const context = { html: '<script>' };
      const result = render(template, context);
      expect(result).toBe('&lt;script&gt;');
    });

    it('should not escape with triple mustache', () => {
      const template = '{{{html}}}';
      const context = { html: '<script>' };
      const result = render(template, context);
      expect(result).toBe('<script>');
    });

    it('should escape vs unescape in same template', () => {
      const template = '{{escaped}} vs {{{unescaped}}}';
      const context = { escaped: '<script>', unescaped: '<script>' };
      const result = render(template, context);
      expect(result).toBe('&lt;script&gt; vs <script>');
    });

    it('should escape all HTML special characters', () => {
      const template = '{{special}}';
      const context = { special: '<>&"\'\`=' };
      const result = render(template, context);
      expect(result).toBe('&lt;&gt;&amp;&quot;&#x27;&#x60;&#x3D;');
    });

    it('should escape ampersands', () => {
      const template = '{{text}}';
      const context = { text: 'Tom & Jerry' };
      const result = render(template, context);
      expect(result).toBe('Tom &amp; Jerry');
    });

    it('should not double-escape already escaped content', () => {
      const template = '{{text}}';
      const context = { text: '&lt;b&gt;' };
      const result = render(template, context);
      expect(result).toBe('&amp;lt;b&amp;gt;');
    });
  });

  describe('C4-IT-T6: Missing Variables', () => {
    it('should render missing variable as empty string', () => {
      const template = 'Hello {{missing}}!';
      const context = {};
      const result = render(template, context);
      expect(result).toBe('Hello !');
    });

    it('should handle all missing variables', () => {
      const template = '{{a}}{{b}}{{c}}';
      const context = {};
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should mix present and missing variables', () => {
      const template = '{{present}} {{missing}} {{alsoPresent}}';
      const context = { present: 'A', alsoPresent: 'B' };
      const result = render(template, context);
      expect(result).toBe('A  B');
    });
  });

  describe('C4-IT-T7: Null and Undefined Values', () => {
    it('should render null as empty string', () => {
      const template = '{{value}}';
      const context = { value: null };
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should render undefined as empty string', () => {
      const template = '{{value}}';
      const context = { value: undefined };
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should handle mix of null, undefined, and defined', () => {
      const template = '{{nullVal}}-{{undefinedVal}}-{{definedVal}}';
      const context = { nullVal: null, undefinedVal: undefined, definedVal: 'ok' };
      const result = render(template, context);
      expect(result).toBe('--ok');
    });

    it('should handle explicit undefined value', () => {
      const template = '{{a}} {{b}}';
      const context = { a: undefined, b: 'text' };
      const result = render(template, context);
      expect(result).toBe(' text');
    });
  });

  describe('Type Conversion', () => {
    it('should convert number to string', () => {
      const template = '{{value}}';
      const context = { value: 42 };
      const result = render(template, context);
      expect(result).toBe('42');
    });

    it('should convert boolean to string', () => {
      const template = '{{flag}}';
      const context = { flag: true };
      const result = render(template, context);
      expect(result).toBe('true');
    });

    it('should convert zero to string', () => {
      const template = '{{value}}';
      const context = { value: 0 };
      const result = render(template, context);
      expect(result).toBe('0');
    });

    it('should convert false to string', () => {
      const template = '{{value}}';
      const context = { value: false };
      const result = render(template, context);
      expect(result).toBe('false');
    });

    it('should handle empty string', () => {
      const template = '{{value}}';
      const context = { value: '' };
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should convert negative numbers', () => {
      const template = '{{value}}';
      const context = { value: -42 };
      const result = render(template, context);
      expect(result).toBe('-42');
    });

    it('should convert floating point numbers', () => {
      const template = '{{value}}';
      const context = { value: 3.14 };
      const result = render(template, context);
      expect(result).toBe('3.14');
    });
  });

  describe('Comments', () => {
    it('should ignore comment and produce no output', () => {
      const template = 'Before{{! This is a comment }}After';
      const context = {};
      const result = render(template, context);
      expect(result).toBe('BeforeAfter');
    });

    it('should ignore multi-line comment', () => {
      const template = 'Before{{!-- This is a\nmulti-line comment --}}After';
      const context = {};
      const result = render(template, context);
      expect(result).toBe('BeforeAfter');
    });

    it('should handle comment with variables around it', () => {
      const template = '{{a}}{{! comment }}{{b}}';
      const context = { a: 'first', b: 'second' };
      const result = render(template, context);
      expect(result).toBe('firstsecond');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty template', () => {
      const template = '';
      const context = { value: 'test' };
      const result = render(template, context);
      expect(result).toBe('');
    });

    it('should handle template with only whitespace', () => {
      const template = '   \n\t  ';
      const context = {};
      const result = render(template, context);
      expect(result).toBe('   \n\t  ');
    });

    it('should handle object with numeric keys', () => {
      const template = '{{obj.123}}';
      const context = { obj: { '123': 'value' } };
      const result = render(template, context);
      expect(result).toBe('value');
    });

    it('should handle this reference', () => {
      const template = '{{this}}';
      const context = 'string value';
      const result = render(template, context);
      expect(result).toBe('string value');
    });

    it('should handle object this reference', () => {
      const template = '{{this.name}}';
      const context = { name: 'value' };
      const result = render(template, context);
      expect(result).toBe('value');
    });
  });
});
