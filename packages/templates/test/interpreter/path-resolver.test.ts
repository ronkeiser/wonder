/**
 * Tests for path resolution functions
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ContextStack } from '../../src/interpreter/context-stack.js';
import { DataStack } from '../../src/interpreter/data-stack.js';
import { resolvePath, resolvePathExpression } from '../../src/interpreter/path-resolver.js';
import type { PathExpression } from '../../src/parser/ast-nodes.js';
import { createFrame } from '../../src/runtime/utils.js';

describe('resolvePath', () => {
  describe('basic property access', () => {
    it('should resolve single property', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['foo'])).toBe('bar');
    });

    it('should resolve nested property', () => {
      const context = { a: { b: { c: 1 } } };
      expect(resolvePath(context, ['a', 'b', 'c'])).toBe(1);
    });

    it('should return undefined for missing property', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['baz'])).toBe(undefined);
    });

    it('should return undefined for missing intermediate', () => {
      const context = { foo: null };
      expect(resolvePath(context, ['foo', 'bar'])).toBe(undefined);
    });
  });

  describe('empty parts ({{this}})', () => {
    it('should return context as-is for empty parts', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, [])).toBe(context);
    });

    it('should return primitive context for empty parts', () => {
      expect(resolvePath('hello', [])).toBe('hello');
      expect(resolvePath(42, [])).toBe(42);
      expect(resolvePath(true, [])).toBe(true);
    });

    it('should return null context for empty parts', () => {
      expect(resolvePath(null, [])).toBe(null);
    });

    it('should return undefined context for empty parts', () => {
      expect(resolvePath(undefined, [])).toBe(undefined);
    });
  });

  describe('array index access', () => {
    it('should access array elements by string index', () => {
      const context = { items: ['a', 'b', 'c'] };
      expect(resolvePath(context, ['items', '0'])).toBe('a');
      expect(resolvePath(context, ['items', '1'])).toBe('b');
      expect(resolvePath(context, ['items', '2'])).toBe('c');
    });

    it('should return undefined for out of bounds index', () => {
      const context = { items: ['a', 'b'] };
      expect(resolvePath(context, ['items', '99'])).toBe(undefined);
    });

    it('should return undefined for negative index', () => {
      const context = { items: ['a', 'b'] };
      expect(resolvePath(context, ['items', '-1'])).toBe(undefined);
    });

    it('should access properties of array elements', () => {
      const context = { items: [{ name: 'Alice' }, { name: 'Bob' }] };
      expect(resolvePath(context, ['items', '0', 'name'])).toBe('Alice');
      expect(resolvePath(context, ['items', '1', 'name'])).toBe('Bob');
    });

    it('should handle sparse arrays', () => {
      const context = { items: [1, , 3] }; // eslint-disable-line no-sparse-arrays
      expect(resolvePath(context, ['items', '1'])).toBe(undefined);
    });

    it('should handle nested arrays', () => {
      const context = {
        matrix: [
          [1, 2],
          [3, 4],
        ],
      };
      expect(resolvePath(context, ['matrix', '0', '1'])).toBe(2);
      expect(resolvePath(context, ['matrix', '1', '0'])).toBe(3);
    });
  });

  describe('deep nesting', () => {
    it('should handle deep property chains', () => {
      const context = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep',
                },
              },
            },
          },
        },
      };
      expect(
        resolvePath(context, ['level1', 'level2', 'level3', 'level4', 'level5', 'value']),
      ).toBe('deep');
    });

    it('should return undefined if deep chain breaks', () => {
      const context = {
        level1: {
          level2: null,
        },
      };
      expect(resolvePath(context, ['level1', 'level2', 'level3', 'value'])).toBe(undefined);
    });
  });

  describe('null and undefined contexts', () => {
    it('should return undefined for null context', () => {
      expect(resolvePath(null, ['foo'])).toBe(undefined);
    });

    it('should return undefined for undefined context', () => {
      expect(resolvePath(undefined, ['foo'])).toBe(undefined);
    });

    it('should handle null intermediate values', () => {
      const context = { a: { b: null } };
      expect(resolvePath(context, ['a', 'b', 'c'])).toBe(undefined);
    });

    it('should handle undefined intermediate values', () => {
      const context = { a: { b: undefined } };
      expect(resolvePath(context, ['a', 'b', 'c'])).toBe(undefined);
    });
  });

  describe('edge cases with various value types', () => {
    it('should return property value when it is null', () => {
      const context = { foo: null };
      expect(resolvePath(context, ['foo'])).toBe(null);
    });

    it('should return property value when it is undefined', () => {
      const context = { foo: undefined };
      expect(resolvePath(context, ['foo'])).toBe(undefined);
    });

    it('should return property value when it is false', () => {
      const context = { foo: false };
      expect(resolvePath(context, ['foo'])).toBe(false);
    });

    it('should return property value when it is 0', () => {
      const context = { foo: 0 };
      expect(resolvePath(context, ['foo'])).toBe(0);
    });

    it('should return property value when it is empty string', () => {
      const context = { foo: '' };
      expect(resolvePath(context, ['foo'])).toBe('');
    });

    it('should return property value when it is empty array', () => {
      const context = { foo: [] };
      const result = resolvePath(context, ['foo']);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should return property value when it is empty object', () => {
      const context = { foo: {} };
      expect(resolvePath(context, ['foo'])).toEqual({});
    });
  });

  describe('security: prototype pollution prevention', () => {
    it('should return undefined for __proto__', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['__proto__'])).toBe(undefined);
    });

    it('should return undefined for constructor', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['constructor'])).toBe(undefined);
    });

    it('should return undefined for prototype', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['prototype'])).toBe(undefined);
    });

    it('should not access inherited properties', () => {
      const context = { foo: 'bar' };
      expect(resolvePath(context, ['toString'])).toBe(undefined);
      expect(resolvePath(context, ['hasOwnProperty'])).toBe(undefined);
      expect(resolvePath(context, ['valueOf'])).toBe(undefined);
    });
  });

  describe('special object types', () => {
    it('should work with objects with null prototype', () => {
      const context = Object.create(null);
      context.foo = 'bar';
      expect(resolvePath(context, ['foo'])).toBe('bar');
    });

    it('should work with objects with null prototype and nested access', () => {
      const obj = Object.create(null);
      obj.nested = { value: 42 };
      expect(resolvePath(obj, ['nested', 'value'])).toBe(42);
    });

    it('should return undefined for primitive string context', () => {
      expect(resolvePath('hello', ['length'])).toBe(undefined);
      expect(resolvePath('hello', ['charAt'])).toBe(undefined);
    });

    it('should return undefined for primitive number context', () => {
      expect(resolvePath(42, ['toString'])).toBe(undefined);
      expect(resolvePath(42, ['toFixed'])).toBe(undefined);
    });

    it('should return undefined for primitive boolean context', () => {
      expect(resolvePath(true, ['toString'])).toBe(undefined);
      expect(resolvePath(false, ['valueOf'])).toBe(undefined);
    });

    it('should work with functions that have own properties', () => {
      const fn: any = () => {};
      fn.customProp = 'value';
      expect(resolvePath(fn, ['customProp'])).toBe('value');
    });

    it('should return undefined for function without requested property', () => {
      const fn = () => {};
      expect(resolvePath(fn, ['missingProp'])).toBe(undefined);
    });
  });

  describe('property names with special characters', () => {
    it('should handle property names with spaces', () => {
      const context = { 'my key': 'value' };
      expect(resolvePath(context, ['my key'])).toBe('value');
    });

    it('should handle property names with dots', () => {
      const context = { 'key.with.dots': 'value' };
      expect(resolvePath(context, ['key.with.dots'])).toBe('value');
    });

    it('should handle numeric string keys', () => {
      const context = { '123': 'value' };
      expect(resolvePath(context, ['123'])).toBe('value');
    });

    it('should handle empty string as property name', () => {
      const context = { '': 'empty key' };
      expect(resolvePath(context, [''])).toBe('empty key');
    });

    it('should handle unicode property names', () => {
      const context = { 你好: 'hello', '🎉': 'party' };
      expect(resolvePath(context, ['你好'])).toBe('hello');
      expect(resolvePath(context, ['🎉'])).toBe('party');
    });
  });
});

describe('resolvePathExpression', () => {
  let contextStack: ContextStack;
  let dataStack: DataStack;

  beforeEach(() => {
    contextStack = new ContextStack();
    dataStack = new DataStack();
  });

  describe('simple variables (depth 0)', () => {
    it('should resolve simple variable from current context', () => {
      contextStack.push({ foo: 'bar' });
      dataStack.push({ '@root': {} });

      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo'],
        original: 'foo',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe('bar');
    });

    it('should resolve nested property from current context', () => {
      contextStack.push({ user: { name: 'Alice' } });
      dataStack.push({ '@root': {} });

      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['user', 'name'],
        original: 'user.name',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe('Alice');
    });

    it('should return undefined for missing property', () => {
      contextStack.push({ foo: 'bar' });
      dataStack.push({ '@root': {} });

      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['missing'],
        original: 'missing',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe(undefined);
    });
  });

  describe('parent scope access (depth > 0)', () => {
    beforeEach(() => {
      // Build context stack: root -> level1 -> level2
      contextStack.push({ name: 'root', value: 'rootValue' });
      contextStack.push({ name: 'level1', value: 'level1Value' });
      contextStack.push({ name: 'level2', value: 'level2Value' });

      // Build data stack
      const rootData = { '@root': { name: 'root' } };
      dataStack.push(rootData);
      dataStack.push(createFrame(rootData));
      dataStack.push(createFrame(dataStack.getCurrent()));
    });

    it('should resolve parent variable (../, depth 1)', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 1,
        parts: ['value'],
        original: '../value',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe('level1Value');
    });

    it('should resolve grandparent variable (../../, depth 2)', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 2,
        parts: ['value'],
        original: '../../value',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe('rootValue');
    });

    it('should resolve nested property from parent', () => {
      contextStack.pop();
      contextStack.pop();
      contextStack.pop();
      contextStack.push({ user: { name: 'Parent' } });
      contextStack.push({ value: 'current' });

      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 1,
        parts: ['user', 'name'],
        original: '../user.name',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe('Parent');
    });

    it('should return root context for out-of-bounds depth', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 99,
        parts: ['value'],
        original: '../../../../../value',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe('rootValue');
    });
  });

  describe('data variables (@-prefixed)', () => {
    beforeEach(() => {
      const rootContext = { items: ['a', 'b', 'c'] };
      contextStack.push(rootContext);

      const rootData = { '@root': rootContext };
      dataStack.push(rootData);

      // Simulate #each loop iteration
      const loopFrame = createFrame(rootData);
      loopFrame['@index'] = 0;
      loopFrame['@first'] = true;
      loopFrame['@last'] = false;
      dataStack.push(loopFrame);
    });

    it('should resolve @index from current data frame', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: true,
        depth: 0,
        parts: ['index'],
        original: '@index',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe(0);
    });

    it('should resolve @first from current data frame', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: true,
        depth: 0,
        parts: ['first'],
        original: '@first',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe(true);
    });

    it('should resolve @root from data frame', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: true,
        depth: 0,
        parts: ['root'],
        original: '@root',
        loc: null,
      };

      const result = resolvePathExpression(pathExpr, contextStack, dataStack);
      expect(result).toEqual({ items: ['a', 'b', 'c'] });
    });

    it('should resolve nested property via @root', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: true,
        depth: 0,
        parts: ['root', 'items', '0'],
        original: '@root.items.0',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe('a');
    });
  });

  describe('empty parts ({{this}} and {{..}})', () => {
    beforeEach(() => {
      contextStack.push({ name: 'root', value: 1 });
      contextStack.push({ name: 'child', value: 2 });

      const rootData = { '@root': {} };
      dataStack.push(rootData);
      dataStack.push(createFrame(rootData));
    });

    it('should return current context for {{this}} (empty parts, depth 0)', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: [],
        original: 'this',
        loc: null,
      };

      const result = resolvePathExpression(pathExpr, contextStack, dataStack);
      expect(result).toEqual({ name: 'child', value: 2 });
    });

    it('should return parent context for {{..}} (empty parts, depth 1)', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 1,
        parts: [],
        original: '..',
        loc: null,
      };

      const result = resolvePathExpression(pathExpr, contextStack, dataStack);
      expect(result).toEqual({ name: 'root', value: 1 });
    });

    it('should return current data frame for {{@}} (empty parts, depth 0)', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: true,
        depth: 0,
        parts: [],
        original: '@',
        loc: null,
      };

      const result = resolvePathExpression(pathExpr, contextStack, dataStack);
      expect(result).toHaveProperty('_parent');
      expect(result).toHaveProperty('@root');
    });
  });

  describe('empty stacks', () => {
    it('should return undefined when context stack is empty', () => {
      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: ['foo'],
        original: 'foo',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe(undefined);
    });

    it('should return undefined when data stack is empty', () => {
      contextStack.push({ foo: 'bar' });

      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: true,
        depth: 0,
        parts: ['index'],
        original: '@index',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe(undefined);
    });
  });

  describe('complex nesting scenarios', () => {
    it('should handle deeply nested contexts with depth', () => {
      // Build 5-level deep context stack
      for (let i = 0; i < 5; i++) {
        contextStack.push({ level: i, value: `level${i}` });
      }

      const rootData = { '@root': {} };
      dataStack.push(rootData);

      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: false,
        depth: 3,
        parts: ['value'],
        original: '../../../value',
        loc: null,
      };

      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe('level1');
    });

    it('should handle data variables in nested loops', () => {
      contextStack.push({
        items: [
          [1, 2],
          [3, 4],
        ],
      });

      const rootContext = contextStack.getCurrent();
      const rootData = { '@root': rootContext };
      dataStack.push(rootData);

      // Outer loop
      const outerFrame = createFrame(rootData);
      outerFrame['@index'] = 0;
      dataStack.push(outerFrame);

      // Inner loop
      const innerFrame = createFrame(outerFrame);
      innerFrame['@index'] = 1;
      dataStack.push(innerFrame);

      const pathExpr: PathExpression = {
        type: 'PathExpression',
        data: true,
        depth: 0,
        parts: ['index'],
        original: '@index',
        loc: null,
      };

      // Should get inner loop's @index
      expect(resolvePathExpression(pathExpr, contextStack, dataStack)).toBe(1);
    });
  });
});
