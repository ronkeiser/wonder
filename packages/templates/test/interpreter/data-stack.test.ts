/**
 * Tests for DataStack
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DataStack } from '../../src/interpreter/data-stack.js';
import { createFrame } from '../../src/runtime/utils.js';

describe('DataStack', () => {
  let stack: DataStack;

  beforeEach(() => {
    stack = new DataStack();
  });

  describe('push and pop', () => {
    it('should push data frames onto the stack', () => {
      stack.push({ '@root': {} });
      expect(stack.size()).toBe(1);

      stack.push({ '@index': 0 });
      expect(stack.size()).toBe(2);
    });

    it('should pop data frames from the stack', () => {
      stack.push({ '@root': {} });
      stack.push({ '@index': 0 });

      const popped = stack.pop();
      expect(popped).toEqual({ '@index': 0 });
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
    it('should return the last pushed frame', () => {
      stack.push({ '@root': {} });
      stack.push({ '@index': 0 });

      expect(stack.getCurrent()).toEqual({ '@index': 0 });
    });

    it('should return undefined for empty stack', () => {
      expect(stack.getCurrent()).toBe(undefined);
    });

    it('should update after push', () => {
      stack.push({ '@index': 0 });
      expect(stack.getCurrent()).toEqual({ '@index': 0 });

      stack.push({ '@index': 1 });
      expect(stack.getCurrent()).toEqual({ '@index': 1 });
    });

    it('should update after pop', () => {
      stack.push({ '@index': 0 });
      stack.push({ '@index': 1 });
      stack.push({ '@index': 2 });

      expect(stack.getCurrent()).toEqual({ '@index': 2 });
      stack.pop();
      expect(stack.getCurrent()).toEqual({ '@index': 1 });
      stack.pop();
      expect(stack.getCurrent()).toEqual({ '@index': 0 });
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

    it('should return current frame at depth 0', () => {
      expect(stack.getAtDepth(0)).toEqual({ name: 'level3' });
    });

    it('should return parent frame at depth 1', () => {
      expect(stack.getAtDepth(1)).toEqual({ name: 'level2' });
    });

    it('should return grandparent frame at depth 2', () => {
      expect(stack.getAtDepth(2)).toEqual({ name: 'level1' });
    });

    it('should return great-grandparent at depth 3', () => {
      expect(stack.getAtDepth(3)).toEqual({ name: 'root' });
    });

    it('should return root frame for out-of-bounds depth', () => {
      expect(stack.getAtDepth(10)).toEqual({ name: 'root' });
      expect(stack.getAtDepth(100)).toEqual({ name: 'root' });
    });

    it('should return undefined for empty stack', () => {
      const emptyStack = new DataStack();
      expect(emptyStack.getAtDepth(0)).toBe(undefined);
      expect(emptyStack.getAtDepth(1)).toBe(undefined);
    });

    it('should work with single frame', () => {
      const singleStack = new DataStack();
      singleStack.push({ '@root': {} });

      expect(singleStack.getAtDepth(0)).toEqual({ '@root': {} });
      expect(singleStack.getAtDepth(1)).toEqual({ '@root': {} }); // Out of bounds -> root
    });
  });

  describe('getRoot', () => {
    it('should return first pushed frame', () => {
      stack.push({ '@root': {} });
      stack.push({ '@index': 0 });
      stack.push({ '@index': 1 });

      expect(stack.getRoot()).toEqual({ '@root': {} });
    });

    it('should return undefined for empty stack', () => {
      expect(stack.getRoot()).toBe(undefined);
    });

    it('should remain constant regardless of current depth', () => {
      stack.push({ '@root': {} });
      expect(stack.getRoot()).toEqual({ '@root': {} });

      stack.push({ '@index': 0 });
      expect(stack.getRoot()).toEqual({ '@root': {} });

      stack.push({ '@index': 1 });
      expect(stack.getRoot()).toEqual({ '@root': {} });

      stack.pop();
      expect(stack.getRoot()).toEqual({ '@root': {} });
    });

    it('should work with single frame', () => {
      stack.push({ '@root': {} });
      expect(stack.getRoot()).toEqual({ '@root': {} });
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

  describe('data frame inheritance with createFrame', () => {
    it('should support frames created with createFrame', () => {
      const rootData = { '@root': { value: 'root' } };
      stack.push(rootData);

      const childFrame = createFrame(rootData);
      childFrame['@index'] = 0;
      stack.push(childFrame);

      const current = stack.getCurrent();
      expect(current['@index']).toBe(0);
      expect(current._parent).toBe(rootData);
    });

    it('should maintain @root accessibility through inheritance', () => {
      const rootContext = { value: 'root' };
      const rootData = { '@root': rootContext };
      stack.push(rootData);

      const childFrame = createFrame(rootData);
      childFrame['@index'] = 0;
      stack.push(childFrame);

      const grandchildFrame = createFrame(childFrame);
      grandchildFrame['@index'] = 1;
      stack.push(grandchildFrame);

      // Access @root through inheritance chain
      const current = stack.getCurrent();
      expect(current['@root']).toBe(rootContext);
      expect(current._parent['@root']).toBe(rootContext);
    });

    it('should allow frames to override parent values', () => {
      const parentFrame = { '@index': 0, '@first': true };
      stack.push(parentFrame);

      const childFrame = createFrame(parentFrame);
      childFrame['@index'] = 1;
      childFrame['@first'] = false;
      stack.push(childFrame);

      const current = stack.getCurrent();
      expect(current['@index']).toBe(1);
      expect(current['@first']).toBe(false);
      expect(current._parent['@index']).toBe(0);
      expect(current._parent['@first']).toBe(true);
    });

    it('should support multiple nested frames with different metadata', () => {
      const rootData = { '@root': {} };
      stack.push(rootData);

      const outerLoop = createFrame(rootData);
      outerLoop['@index'] = 0;
      outerLoop['@first'] = true;
      outerLoop['@last'] = false;
      stack.push(outerLoop);

      const innerLoop = createFrame(outerLoop);
      innerLoop['@index'] = 5;
      innerLoop['@first'] = false;
      innerLoop['@last'] = true;
      stack.push(innerLoop);

      const current = stack.getCurrent();
      expect(current['@index']).toBe(5);
      expect(current['@first']).toBe(false);
      expect(current['@last']).toBe(true);

      // Parent has different values
      expect(current._parent['@index']).toBe(0);
      expect(current._parent['@first']).toBe(true);
      expect(current._parent['@last']).toBe(false);
    });
  });

  describe('data variable scenarios', () => {
    it('should handle loop metadata', () => {
      const rootData = { '@root': { items: ['a', 'b', 'c'] } };
      stack.push(rootData);

      const iteration1 = createFrame(rootData);
      iteration1['@index'] = 0;
      iteration1['@first'] = true;
      iteration1['@last'] = false;
      stack.push(iteration1);

      expect(stack.getCurrent()['@index']).toBe(0);
      expect(stack.getCurrent()['@first']).toBe(true);
      expect(stack.getCurrent()['@last']).toBe(false);
    });

    it('should handle object iteration with @key', () => {
      const rootData = { '@root': {} };
      stack.push(rootData);

      const objectIteration = createFrame(rootData);
      objectIteration['@key'] = 'username';
      objectIteration['@index'] = 0;
      stack.push(objectIteration);

      expect(stack.getCurrent()['@key']).toBe('username');
    });

    it('should preserve @root across multiple frames', () => {
      const rootContext = { value: 'original' };
      const rootData = { '@root': rootContext };
      stack.push(rootData);

      // Create 5 nested frames
      let current = rootData;
      for (let i = 0; i < 5; i++) {
        const frame = createFrame(current);
        frame['@index'] = i;
        stack.push(frame);
        current = frame;
      }

      // All frames should have access to same @root
      expect(stack.getCurrent()['@root']).toBe(rootContext);
      expect(stack.getAtDepth(1)['@root']).toBe(rootContext);
      expect(stack.getAtDepth(2)['@root']).toBe(rootContext);
      expect(stack.getRoot()['@root']).toBe(rootContext);
    });
  });

  describe('edge cases', () => {
    it('should handle frames with null values', () => {
      stack.push({ '@index': null });
      expect(stack.getCurrent()['@index']).toBe(null);
    });

    it('should handle frames with undefined values', () => {
      stack.push({ '@index': undefined });
      expect(stack.getCurrent()['@index']).toBe(undefined);
    });

    it('should handle deep nesting (10+ frames)', () => {
      const rootData = { '@root': {} };
      stack.push(rootData);

      for (let i = 0; i < 15; i++) {
        const frame = createFrame(stack.getCurrent());
        frame['@index'] = i;
        stack.push(frame);
      }

      expect(stack.size()).toBe(16);
      expect(stack.getCurrent()['@index']).toBe(14);
      expect(stack.getAtDepth(5)['@index']).toBe(9);
    });
  });
});
