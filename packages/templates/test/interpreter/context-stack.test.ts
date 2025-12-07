/**
 * Tests for ContextStack
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ContextStack } from '../../src/interpreter/context-stack.js';

describe('ContextStack', () => {
  let stack: ContextStack;

  beforeEach(() => {
    stack = new ContextStack();
  });

  describe('push and pop', () => {
    it('should push contexts onto the stack', () => {
      stack.push({ level: 'root' });
      expect(stack.size()).toBe(1);

      stack.push({ level: 'child' });
      expect(stack.size()).toBe(2);
    });

    it('should pop contexts from the stack', () => {
      stack.push({ level: 'root' });
      stack.push({ level: 'child' });

      const popped = stack.pop();
      expect(popped).toEqual({ level: 'child' });
      expect(stack.size()).toBe(1);
    });

    it('should return undefined when popping from empty stack', () => {
      expect(stack.pop()).toBe(undefined);
    });

    it('should maintain LIFO order', () => {
      stack.push({ id: 1 });
      stack.push({ id: 2 });
      stack.push({ id: 3 });

      expect(stack.pop()).toEqual({ id: 3 });
      expect(stack.pop()).toEqual({ id: 2 });
      expect(stack.pop()).toEqual({ id: 1 });
    });
  });

  describe('getCurrent', () => {
    it('should return the last pushed context', () => {
      stack.push({ level: 'root' });
      stack.push({ level: 'child' });

      expect(stack.getCurrent()).toEqual({ level: 'child' });
    });

    it('should return undefined for empty stack', () => {
      expect(stack.getCurrent()).toBe(undefined);
    });

    it('should update after push', () => {
      stack.push({ id: 1 });
      expect(stack.getCurrent()).toEqual({ id: 1 });

      stack.push({ id: 2 });
      expect(stack.getCurrent()).toEqual({ id: 2 });
    });

    it('should update after pop', () => {
      stack.push({ id: 1 });
      stack.push({ id: 2 });
      stack.push({ id: 3 });

      expect(stack.getCurrent()).toEqual({ id: 3 });
      stack.pop();
      expect(stack.getCurrent()).toEqual({ id: 2 });
      stack.pop();
      expect(stack.getCurrent()).toEqual({ id: 1 });
    });
  });

  describe('getAtDepth', () => {
    beforeEach(() => {
      // Build a stack: root -> level1 -> level2 -> level3
      stack.push({ name: 'root' });
      stack.push({ name: 'level1' });
      stack.push({ name: 'level2' });
      stack.push({ name: 'level3' });
    });

    it('should return current context at depth 0', () => {
      expect(stack.getAtDepth(0)).toEqual({ name: 'level3' });
    });

    it('should return parent context at depth 1', () => {
      expect(stack.getAtDepth(1)).toEqual({ name: 'level2' });
    });

    it('should return grandparent context at depth 2', () => {
      expect(stack.getAtDepth(2)).toEqual({ name: 'level1' });
    });

    it('should return great-grandparent at depth 3', () => {
      expect(stack.getAtDepth(3)).toEqual({ name: 'root' });
    });

    it('should return root context for out-of-bounds depth', () => {
      expect(stack.getAtDepth(10)).toEqual({ name: 'root' });
      expect(stack.getAtDepth(100)).toEqual({ name: 'root' });
    });

    it('should return undefined for empty stack', () => {
      const emptyStack = new ContextStack();
      expect(emptyStack.getAtDepth(0)).toBe(undefined);
      expect(emptyStack.getAtDepth(1)).toBe(undefined);
    });

    it('should work with single context', () => {
      const singleStack = new ContextStack();
      singleStack.push({ only: true });

      expect(singleStack.getAtDepth(0)).toEqual({ only: true });
      expect(singleStack.getAtDepth(1)).toEqual({ only: true }); // Out of bounds -> root
    });
  });

  describe('getRoot', () => {
    it('should return first pushed context', () => {
      stack.push({ name: 'root' });
      stack.push({ name: 'child1' });
      stack.push({ name: 'child2' });

      expect(stack.getRoot()).toEqual({ name: 'root' });
    });

    it('should return undefined for empty stack', () => {
      expect(stack.getRoot()).toBe(undefined);
    });

    it('should remain constant regardless of current depth', () => {
      stack.push({ name: 'root' });
      expect(stack.getRoot()).toEqual({ name: 'root' });

      stack.push({ name: 'child1' });
      expect(stack.getRoot()).toEqual({ name: 'root' });

      stack.push({ name: 'child2' });
      expect(stack.getRoot()).toEqual({ name: 'root' });

      stack.pop();
      expect(stack.getRoot()).toEqual({ name: 'root' });
    });

    it('should work with single context', () => {
      stack.push({ only: true });
      expect(stack.getRoot()).toEqual({ only: true });
    });
  });

  describe('size', () => {
    it('should return 0 for empty stack', () => {
      expect(stack.size()).toBe(0);
    });

    it('should return correct size after pushes', () => {
      expect(stack.size()).toBe(0);

      stack.push({});
      expect(stack.size()).toBe(1);

      stack.push({});
      expect(stack.size()).toBe(2);

      stack.push({});
      expect(stack.size()).toBe(3);
    });

    it('should return correct size after pops', () => {
      stack.push({});
      stack.push({});
      stack.push({});
      expect(stack.size()).toBe(3);

      stack.pop();
      expect(stack.size()).toBe(2);

      stack.pop();
      expect(stack.size()).toBe(1);

      stack.pop();
      expect(stack.size()).toBe(0);
    });

    it('should not go below 0', () => {
      expect(stack.size()).toBe(0);
      stack.pop();
      expect(stack.size()).toBe(0);
    });
  });

  describe('edge cases with various context types', () => {
    it('should handle null contexts', () => {
      stack.push(null);
      expect(stack.getCurrent()).toBe(null);
      expect(stack.getAtDepth(0)).toBe(null);
    });

    it('should handle undefined contexts', () => {
      stack.push(undefined);
      expect(stack.getCurrent()).toBe(undefined);
      expect(stack.getAtDepth(0)).toBe(undefined);
    });

    it('should handle primitive contexts', () => {
      stack.push('string');
      stack.push(42);
      stack.push(true);

      expect(stack.getCurrent()).toBe(true);
      expect(stack.getAtDepth(1)).toBe(42);
      expect(stack.getAtDepth(2)).toBe('string');
    });

    it('should handle array contexts', () => {
      stack.push([1, 2, 3]);
      expect(stack.getCurrent()).toEqual([1, 2, 3]);
    });

    it('should handle function contexts', () => {
      const fn = () => {};
      stack.push(fn);
      expect(stack.getCurrent()).toBe(fn);
    });

    it('should handle objects with null prototype', () => {
      const obj = Object.create(null);
      obj.key = 'value';
      stack.push(obj);
      expect(stack.getCurrent()).toBe(obj);
    });
  });

  describe('complex nesting scenarios', () => {
    it('should handle deep nesting (10+ levels)', () => {
      for (let i = 0; i < 15; i++) {
        stack.push({ level: i });
      }

      expect(stack.size()).toBe(15);
      expect(stack.getCurrent()).toEqual({ level: 14 });
      expect(stack.getAtDepth(0)).toEqual({ level: 14 });
      expect(stack.getAtDepth(5)).toEqual({ level: 9 });
      expect(stack.getAtDepth(14)).toEqual({ level: 0 });
      expect(stack.getAtDepth(20)).toEqual({ level: 0 }); // Out of bounds
    });

    it('should handle push/pop cycles', () => {
      stack.push({ id: 1 });
      stack.push({ id: 2 });
      stack.pop();
      stack.push({ id: 3 });
      stack.push({ id: 4 });
      stack.pop();
      stack.pop();

      expect(stack.size()).toBe(1);
      expect(stack.getCurrent()).toEqual({ id: 1 });
    });

    it('should maintain correct depth relationships after pops', () => {
      stack.push({ name: 'root' });
      stack.push({ name: 'a' });
      stack.push({ name: 'b' });
      stack.push({ name: 'c' });

      stack.pop(); // Remove 'c'

      expect(stack.getAtDepth(0)).toEqual({ name: 'b' });
      expect(stack.getAtDepth(1)).toEqual({ name: 'a' });
      expect(stack.getAtDepth(2)).toEqual({ name: 'root' });
    });
  });
});
