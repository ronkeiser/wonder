/**
 * Helper Context Binding Tests
 *
 * Tests for Feature 6.4 Task 3: Call Helpers with Context Binding
 * Verifies that helpers receive the current context as `this` when called.
 */

import { describe, expect, test } from 'vitest';
import { Interpreter } from '../../src/interpreter/interpreter.js';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';

describe('Helper Context Binding (C6-F4-T3)', () => {
  test('helper receives context as this', () => {
    let receivedContext: any;
    const template = '{{#if (check)}}checked{{/if}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        check: function (this: any) {
          receivedContext = this;
          return true;
        },
      },
    });

    interpreter.evaluate({ name: 'Alice', age: 30 });
    expect(receivedContext).toEqual({ name: 'Alice', age: 30 });
  });

  test('helper can access context properties via this', () => {
    const template = '{{#if (hasName)}}Has name{{else}}No name{{/if}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        hasName: function (this: any) {
          return this.name !== undefined && this.name !== '';
        },
      },
    });

    const result1 = interpreter.evaluate({ name: 'Bob' });
    expect(result1).toBe('Has name');
  });

  test('helper with arguments still receives context', () => {
    const template = '{{#if (isOlderThan 18)}}Adult{{else}}Minor{{/if}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        isOlderThan: function (this: any, threshold: number) {
          return this.age > threshold;
        },
      },
    });

    const result1 = interpreter.evaluate({ age: 25 });
    expect(result1).toBe('Adult');

    const lexer2 = new Lexer();
    const parser2 = new Parser(lexer2);
    parser2.setInput(template);
    const ast2 = parser2.parse();
    const interpreter2 = new Interpreter(ast2, {
      helpers: {
        isOlderThan: function (this: any, threshold: number) {
          return this.age > threshold;
        },
      },
    });

    const result2 = interpreter2.evaluate({ age: 15 });
    expect(result2).toBe('Minor');
  });

  test('helper accesses nested context properties', () => {
    const template = '{{#if (hasAddress)}}Yes{{else}}No{{/if}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        hasAddress: function (this: any) {
          return this.user && this.user.address && this.user.address.city;
        },
      },
    });

    const result = interpreter.evaluate({
      user: { address: { city: 'New York' } },
    });
    expect(result).toBe('Yes');
  });

  test('context changes with #each iterations', () => {
    const template = '{{#each items}}{{#if (isEven)}}even,{{/if}}{{/each}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        isEven: function (this: any) {
          return this % 2 === 0;
        },
      },
    });

    const result = interpreter.evaluate({ items: [1, 2, 3, 4] });
    expect(result).toBe('even,even,');
  });

  test('context changes with #with block', () => {
    const template = '{{#with person}}{{#if (isAdmin)}}Admin{{/if}}{{/with}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        isAdmin: function (this: any) {
          return this.role === 'admin';
        },
      },
    });

    const result = interpreter.evaluate({
      person: { role: 'admin', name: 'Alice' },
    });
    expect(result).toBe('Admin');
  });

  test('helper with multiple args and context access', () => {
    const template = '{{#if (inRange min max)}}In range{{else}}Out of range{{/if}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        inRange: function (this: any, min: number, max: number) {
          return this.value >= min && this.value <= max;
        },
      },
    });

    const result1 = interpreter.evaluate({ value: 50, min: 0, max: 100 });
    expect(result1).toBe('In range');

    const lexer2 = new Lexer();
    const parser2 = new Parser(lexer2);
    parser2.setInput(template);
    const ast2 = parser2.parse();
    const interpreter2 = new Interpreter(ast2, {
      helpers: {
        inRange: function (this: any, min: number, max: number) {
          return this.value >= min && this.value <= max;
        },
      },
    });

    const result2 = interpreter2.evaluate({ value: 150, min: 0, max: 100 });
    expect(result2).toBe('Out of range');
  });

  test('arrow function does not receive context (by design)', () => {
    // Arrow functions don't bind `this`, so they should use parameters instead
    const template = '{{#if (gt score 80)}}Pass{{else}}Fail{{/if}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        gt: (a: number, b: number) => a > b, // Arrow function
      },
    });

    const result = interpreter.evaluate({ score: 90 });
    expect(result).toBe('Pass');
  });

  test('nested subexpressions maintain correct context', () => {
    const template = '{{#if (and (hasName) (isAdult))}}Valid{{else}}Invalid{{/if}}';

    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        hasName: function (this: any) {
          return !!this.name;
        },
        isAdult: function (this: any) {
          return this.age >= 18;
        },
      },
    });

    const result1 = interpreter.evaluate({ name: 'Alice', age: 25 });
    expect(result1).toBe('Valid');

    const lexer2 = new Lexer();
    const parser2 = new Parser(lexer2);
    parser2.setInput(template);
    const ast2 = parser2.parse();
    const interpreter2 = new Interpreter(ast2, {
      helpers: {
        hasName: function (this: any) {
          return !!this.name;
        },
        isAdult: function (this: any) {
          return this.age >= 18;
        },
      },
    });

    const result2 = interpreter2.evaluate({ name: 'Bob', age: 15 });
    expect(result2).toBe('Invalid');
  });

  test('helper can modify and return context value', () => {
    const template = '{{#if (double)}}{{/if}}';

    let contextValue: number | undefined;
    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    const ast = parser.parse();
    const interpreter = new Interpreter(ast, {
      helpers: {
        double: function (this: any) {
          contextValue = this.value * 2;
          return true;
        },
      },
    });

    interpreter.evaluate({ value: 5 });
    expect(contextValue).toBe(10);
  });
});
