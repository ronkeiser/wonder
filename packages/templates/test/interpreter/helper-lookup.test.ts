/**
 * Helper Lookup Tests
 *
 * Tests for Feature 6.4 Task 2: Implement Helper Lookup
 * Verifies that the lookupHelper() method correctly retrieves helpers
 * from the merged registry (built-in + user helpers).
 */

import { describe, expect, test } from 'vitest';
import { Interpreter } from '../../src/interpreter/interpreter.js';
import { Lexer } from '../../src/lexer/lexer.js';
import type { Program } from '../../src/parser/ast-nodes.js';
import { Parser } from '../../src/parser/parser.js';

// Helper to create a minimal AST for testing
function createMinimalAST(): Program {
  return {
    type: 'Program',
    body: [],
    loc: { start: { line: 1, column: 1, index: 0 }, end: { line: 1, column: 1, index: 0 } },
  };
}

describe('Helper Lookup (C6-F4-T2)', () => {
  test('finds built-in comparison helper', () => {
    const ast = createMinimalAST();
    const interpreter = new Interpreter(ast);

    // Use reflection to access private method for testing
    const helper = (interpreter as any).lookupHelper('eq');

    expect(helper).toBeDefined();
    expect(typeof helper).toBe('function');
  });

  test('finds built-in logical helper', () => {
    const ast = createMinimalAST();
    const interpreter = new Interpreter(ast);

    const helper = (interpreter as any).lookupHelper('and');

    expect(helper).toBeDefined();
    expect(typeof helper).toBe('function');
  });

  test('finds all built-in comparison helpers', () => {
    const ast = createMinimalAST();
    const interpreter = new Interpreter(ast);

    const helpers = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'];

    for (const name of helpers) {
      const helper = (interpreter as any).lookupHelper(name);
      expect(helper).toBeDefined();
      expect(typeof helper).toBe('function');
    }
  });

  test('finds all built-in logical helpers', () => {
    const ast = createMinimalAST();
    const interpreter = new Interpreter(ast);

    const helpers = ['and', 'or', 'not'];

    for (const name of helpers) {
      const helper = (interpreter as any).lookupHelper(name);
      expect(helper).toBeDefined();
      expect(typeof helper).toBe('function');
    }
  });

  test('finds user-provided helper', () => {
    const ast = createMinimalAST();
    const customHelper = () => 'test result';
    const interpreter = new Interpreter(ast, {
      helpers: { custom: customHelper },
    });

    const helper = (interpreter as any).lookupHelper('custom');

    expect(helper).toBeDefined();
    expect(helper).toBe(customHelper);
  });

  test('returns undefined for unknown helper', () => {
    const ast = createMinimalAST();
    const interpreter = new Interpreter(ast);

    const helper = (interpreter as any).lookupHelper('unknownHelper');

    expect(helper).toBeUndefined();
  });

  test('user helper overrides built-in helper', () => {
    const ast = createMinimalAST();
    const customEq = () => true;
    const interpreter = new Interpreter(ast, {
      helpers: { eq: customEq },
    });

    const helper = (interpreter as any).lookupHelper('eq');

    expect(helper).toBe(customEq);
    expect(helper).not.toBe((interpreter as any).lookupHelper('ne'));
  });

  test('multiple user helpers are all accessible', () => {
    const ast = createMinimalAST();
    const helper1 = () => 'one';
    const helper2 = () => 'two';
    const helper3 = () => 'three';

    const interpreter = new Interpreter(ast, {
      helpers: {
        custom1: helper1,
        custom2: helper2,
        custom3: helper3,
      },
    });

    expect((interpreter as any).lookupHelper('custom1')).toBe(helper1);
    expect((interpreter as any).lookupHelper('custom2')).toBe(helper2);
    expect((interpreter as any).lookupHelper('custom3')).toBe(helper3);
  });
});
