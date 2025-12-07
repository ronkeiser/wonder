/**
 * Helper Detection Tests
 *
 * Tests for Feature 6.5 Task 1: Helper Detection Logic
 * Verifies that isHelperCall() correctly distinguishes between helper calls
 * and variable lookups.
 */

import { describe, expect, test } from 'vitest';
import { Interpreter } from '../../src/interpreter/interpreter.js';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';

describe('Helper Detection (C6-F5-T1)', () => {
  /**
   * Helper function to get a MustacheStatement from a template
   */
  const getMustacheStatement = (template: string) => {
    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    return ast.body[0];
  };

  /**
   * Helper function to get a BlockStatement from a template
   */
  const getBlockStatement = (template: string) => {
    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    return ast.body[0];
  };

  describe('Rule 1: Statements with params are always helper calls', () => {
    test('block with single param is helper call', () => {
      const template = '{{#if condition}}yes{{/if}}';
      const node = getBlockStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      // Use reflection to test private method
      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(true);
    });

    test('block with multiple params is helper call', () => {
      const template = '{{#each items}}{{this}}{{/each}}';
      const node = getBlockStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(true);
    });

    test('block helper even without explicit params is helper call', () => {
      const template = '{{#unless value}}no{{/unless}}';
      const node = getBlockStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(true);
    });
  });

  describe('Rule 2: Scoped paths are never helper calls', () => {
    test('./ prefix always means variable lookup', () => {
      const template = '{{./helper}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast, {
        helpers: {
          helper: () => 'should-not-be-called',
        },
      });

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(false);
    });

    test('this. prefix always means variable lookup', () => {
      const template = '{{this.helper}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast, {
        helpers: {
          helper: () => 'should-not-be-called',
        },
      });

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(false);
    });

    test('scoped path with nested property is variable lookup', () => {
      const template = '{{./user.name}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(false);
    });
  });

  describe('Rule 3: Helper exists in registry means helper call', () => {
    test('no params but helper exists is helper call', () => {
      const template = '{{timestamp}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast, {
        helpers: {
          timestamp: () => '2024-01-01',
        },
      });

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(true);
    });

    test('built-in helper without params is helper call', () => {
      const template = '{{#if value}}yes{{/if}}';
      const node = getBlockStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(true);
    });

    test('user helper overriding variable name is helper call', () => {
      const template = '{{status}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast, {
        helpers: {
          status: () => 'active',
        },
      });

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(true);
    });
  });

  describe('Rule 4: No helper, no params means variable lookup', () => {
    test('simple variable is not helper call', () => {
      const template = '{{name}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(false);
    });

    test('nested property is not helper call', () => {
      const template = '{{user.name}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(false);
    });

    test('deeply nested property is not helper call', () => {
      const template = '{{user.address.city}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isHelperCall = (interpreter as any).isHelperCall(node);
      expect(isHelperCall).toBe(false);
    });
  });

  describe('isScopedPath helper method', () => {
    test('detects ./ prefix', () => {
      const template = '{{./name}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isScopedPath = (interpreter as any).isScopedPath((node as any).path);
      expect(isScopedPath).toBe(true);
    });

    test('detects this. prefix', () => {
      const template = '{{this.name}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isScopedPath = (interpreter as any).isScopedPath((node as any).path);
      expect(isScopedPath).toBe(true);
    });

    test('regular path is not scoped', () => {
      const template = '{{name}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isScopedPath = (interpreter as any).isScopedPath((node as any).path);
      expect(isScopedPath).toBe(false);
    });

    test('nested path is not scoped', () => {
      const template = '{{user.name}}';
      const node = getMustacheStatement(template);
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      parser.setInput(template);
      const ast = parser.parse();
      const interpreter = new Interpreter(ast);

      const isScopedPath = (interpreter as any).isScopedPath((node as any).path);
      expect(isScopedPath).toBe(false);
    });
  });
});
