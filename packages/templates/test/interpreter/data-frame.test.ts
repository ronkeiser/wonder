/**
 * Tests for Data Frame Management
 */

import { describe, expect, it } from 'vitest';
import {
  createDataFrame,
  getDataVariable,
  setDataVariable,
  type DataFrameMetadata,
} from '../../src/interpreter/data-frame.js';

describe('createDataFrame', () => {
  describe('basic frame creation', () => {
    it('should create frame with @index metadata', () => {
      const parentFrame = null;
      const frame = createDataFrame(parentFrame, { '@index': 0 });

      expect(frame['@index']).toBe(0);
      expect(frame._parent).toBe(null);
    });

    it('should create frame with @first and @last flags', () => {
      const parentFrame = null;
      const frame = createDataFrame(parentFrame, {
        '@first': true,
        '@last': false,
      });

      expect(frame['@first']).toBe(true);
      expect(frame['@last']).toBe(false);
    });

    it('should create frame with @key for object iteration', () => {
      const parentFrame = null;
      const frame = createDataFrame(parentFrame, { '@key': 'username' });

      expect(frame['@key']).toBe('username');
    });

    it('should create frame with multiple metadata properties', () => {
      const parentFrame = null;
      const frame = createDataFrame(parentFrame, {
        '@index': 2,
        '@first': false,
        '@last': true,
        '@key': 'email',
      });

      expect(frame['@index']).toBe(2);
      expect(frame['@first']).toBe(false);
      expect(frame['@last']).toBe(true);
      expect(frame['@key']).toBe('email');
    });
  });

  describe('parent frame inheritance', () => {
    it('should inherit @root from parent frame', () => {
      const rootContext = { name: 'Root Context' };
      const parentFrame = createDataFrame(null, { '@root': rootContext });
      const childFrame = createDataFrame(parentFrame, { '@index': 0 });

      // Child doesn't set @root, but inherits it via _parent chain
      expect(childFrame._parent['@root']).toBe(rootContext);
      // Direct access via spread from createFrame
      expect(childFrame['@root']).toBe(rootContext);
    });

    it('should allow child to override parent @index', () => {
      const parentFrame = createDataFrame(null, { '@index': 5 });
      const childFrame = createDataFrame(parentFrame, { '@index': 0 });

      expect(parentFrame['@index']).toBe(5);
      expect(childFrame['@index']).toBe(0);
      expect(childFrame._parent['@index']).toBe(5);
    });

    it('should maintain _parent reference chain', () => {
      const rootFrame = createDataFrame(null, { '@root': 'ROOT' });
      const level1Frame = createDataFrame(rootFrame, { '@index': 0 });
      const level2Frame = createDataFrame(level1Frame, { '@index': 1 });

      expect(level2Frame._parent).toBe(level1Frame);
      expect(level1Frame._parent).toBe(rootFrame);
      expect(rootFrame._parent).toBe(null);
    });
  });

  describe('multiple levels of frames', () => {
    it('should create deeply nested frames', () => {
      let currentFrame = createDataFrame(null, { '@root': 'ROOT' });

      // Create 5 levels of nested frames
      for (let i = 0; i < 5; i++) {
        currentFrame = createDataFrame(currentFrame, { '@index': i });
      }

      // Walk back up the chain
      let depth = 0;
      let frame = currentFrame;
      while (frame._parent !== null) {
        expect(frame['@index']).toBe(4 - depth);
        frame = frame._parent;
        depth++;
      }

      expect(depth).toBe(5);
    });

    it('should preserve @root at all levels', () => {
      const rootContext = { value: 'original' };
      const rootFrame = createDataFrame(null, { '@root': rootContext });
      const level1 = createDataFrame(rootFrame, { '@index': 0 });
      const level2 = createDataFrame(level1, { '@index': 1 });
      const level3 = createDataFrame(level2, { '@index': 2 });

      // All levels should have access to @root
      expect(rootFrame['@root']).toBe(rootContext);
      expect(level1['@root']).toBe(rootContext);
      expect(level2['@root']).toBe(rootContext);
      expect(level3['@root']).toBe(rootContext);
    });
  });

  describe('root frame initialization', () => {
    it('should create root frame with @root reference', () => {
      const rootContext = { name: 'Alice', age: 30 };
      const rootFrame = createDataFrame(null, { '@root': rootContext });

      expect(rootFrame['@root']).toBe(rootContext);
      expect(rootFrame._parent).toBe(null);
    });

    it('should handle root frame with no metadata', () => {
      const rootFrame = createDataFrame(null, {});

      expect(rootFrame._parent).toBe(null);
      expect(rootFrame['@root']).toBeUndefined();
    });

    it('should create root frame with multiple metadata properties', () => {
      const rootContext = { items: [1, 2, 3] };
      const rootFrame = createDataFrame(null, {
        '@root': rootContext,
        '@index': 0,
        '@first': true,
      });

      expect(rootFrame['@root']).toBe(rootContext);
      expect(rootFrame['@index']).toBe(0);
      expect(rootFrame['@first']).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined metadata values', () => {
      const frame = createDataFrame(null, {
        '@index': undefined,
        '@first': undefined,
      });

      expect(frame['@index']).toBeUndefined();
      expect(frame['@first']).toBeUndefined();
    });

    it('should handle zero as @index', () => {
      const frame = createDataFrame(null, { '@index': 0 });

      expect(frame['@index']).toBe(0);
    });

    it('should handle false boolean values', () => {
      const frame = createDataFrame(null, {
        '@first': false,
        '@last': false,
      });

      expect(frame['@first']).toBe(false);
      expect(frame['@last']).toBe(false);
    });

    it('should handle empty string as @key', () => {
      const frame = createDataFrame(null, { '@key': '' });

      expect(frame['@key']).toBe('');
    });

    it('should handle custom properties in addition to standard metadata', () => {
      const frame = createDataFrame(null, {
        '@index': 0,
        customProp: 'custom value',
        '@custom': 'data variable',
      });

      expect(frame['@index']).toBe(0);
      expect(frame['customProp']).toBe('custom value');
      expect(frame['@custom']).toBe('data variable');
    });
  });

  describe('realistic #each scenarios', () => {
    it('should create frames for array iteration', () => {
      const items = ['a', 'b', 'c'];
      const rootContext = { items };
      const rootFrame = createDataFrame(null, { '@root': rootContext });

      const frames: any[] = [];
      items.forEach((item, index) => {
        const frame = createDataFrame(rootFrame, {
          '@index': index,
          '@first': index === 0,
          '@last': index === items.length - 1,
        });
        frames.push(frame);
      });

      // Check first iteration
      expect(frames[0]['@index']).toBe(0);
      expect(frames[0]['@first']).toBe(true);
      expect(frames[0]['@last']).toBe(false);
      expect(frames[0]['@root']).toBe(rootContext);

      // Check middle iteration
      expect(frames[1]['@index']).toBe(1);
      expect(frames[1]['@first']).toBe(false);
      expect(frames[1]['@last']).toBe(false);

      // Check last iteration
      expect(frames[2]['@index']).toBe(2);
      expect(frames[2]['@first']).toBe(false);
      expect(frames[2]['@last']).toBe(true);
    });

    it('should create frames for object iteration', () => {
      const obj = { name: 'Alice', age: 30, city: 'NYC' };
      const rootContext = { user: obj };
      const rootFrame = createDataFrame(null, { '@root': rootContext });

      const frames: any[] = [];
      const keys = Object.keys(obj);
      keys.forEach((key, index) => {
        const frame = createDataFrame(rootFrame, {
          '@key': key,
          '@index': index,
          '@first': index === 0,
          '@last': index === keys.length - 1,
        });
        frames.push(frame);
      });

      expect(frames[0]['@key']).toBe('name');
      expect(frames[0]['@index']).toBe(0);
      expect(frames[1]['@key']).toBe('age');
      expect(frames[1]['@index']).toBe(1);
      expect(frames[2]['@key']).toBe('city');
      expect(frames[2]['@index']).toBe(2);
    });

    it('should create frames for nested loops', () => {
      const rootContext = {
        categories: [
          { name: 'Electronics', items: ['Phone', 'Laptop'] },
          { name: 'Clothing', items: ['Shirt', 'Pants'] },
        ],
      };

      const rootFrame = createDataFrame(null, { '@root': rootContext });

      // Outer loop
      const outerFrame = createDataFrame(rootFrame, {
        '@index': 0,
        '@first': true,
        '@last': false,
      });

      // Inner loop
      const innerFrame = createDataFrame(outerFrame, {
        '@index': 1,
        '@first': false,
        '@last': true,
      });

      // Inner frame should have its own @index
      expect(innerFrame['@index']).toBe(1);
      // But parent's @index is still 0
      expect(innerFrame._parent['@index']).toBe(0);
      // Both have access to @root
      expect(outerFrame['@root']).toBe(rootContext);
      expect(innerFrame['@root']).toBe(rootContext);
    });
  });
});

describe('getDataVariable', () => {
  describe('basic access', () => {
    it('should get existing data variable', () => {
      const frame = createDataFrame(null, { '@index': 5 });
      expect(getDataVariable(frame, '@index')).toBe(5);
    });

    it('should get multiple data variables', () => {
      const frame = createDataFrame(null, {
        '@index': 0,
        '@first': true,
        '@last': false,
        '@key': 'name',
      });

      expect(getDataVariable(frame, '@index')).toBe(0);
      expect(getDataVariable(frame, '@first')).toBe(true);
      expect(getDataVariable(frame, '@last')).toBe(false);
      expect(getDataVariable(frame, '@key')).toBe('name');
    });

    it('should return undefined for missing variable', () => {
      const frame = createDataFrame(null, { '@index': 0 });
      expect(getDataVariable(frame, '@missing')).toBeUndefined();
    });

    it('should return undefined for null frame', () => {
      expect(getDataVariable(null, '@index')).toBeUndefined();
    });

    it('should return undefined for undefined frame', () => {
      expect(getDataVariable(undefined, '@index')).toBeUndefined();
    });
  });

  describe('@root access', () => {
    it('should access @root from root frame', () => {
      const rootContext = { name: 'Root' };
      const frame = createDataFrame(null, { '@root': rootContext });
      expect(getDataVariable(frame, '@root')).toBe(rootContext);
    });

    it('should access @root from child frame', () => {
      const rootContext = { name: 'Root' };
      const rootFrame = createDataFrame(null, { '@root': rootContext });
      const childFrame = createDataFrame(rootFrame, { '@index': 0 });

      // @root is inherited via createFrame's spread
      expect(getDataVariable(childFrame, '@root')).toBe(rootContext);
    });

    it('should access @root from deeply nested frame', () => {
      const rootContext = { name: 'Root' };
      let frame = createDataFrame(null, { '@root': rootContext });

      // Create 5 levels of nesting
      for (let i = 0; i < 5; i++) {
        frame = createDataFrame(frame, { '@index': i });
      }

      // @root still accessible at any depth
      expect(getDataVariable(frame, '@root')).toBe(rootContext);
    });
  });

  describe('custom data variables', () => {
    it('should get custom data variable', () => {
      const frame = createDataFrame(null, { '@custom': 'value' });
      expect(getDataVariable(frame, '@custom')).toBe('value');
    });

    it('should get non-prefixed property', () => {
      const frame = createDataFrame(null, { customProp: 42 });
      expect(getDataVariable(frame, 'customProp')).toBe(42);
    });
  });

  describe('security', () => {
    it('should return undefined for __proto__', () => {
      const frame = createDataFrame(null, { '@index': 0 });
      expect(getDataVariable(frame, '__proto__')).toBeUndefined();
    });

    it('should return undefined for constructor', () => {
      const frame = createDataFrame(null, { '@index': 0 });
      expect(getDataVariable(frame, 'constructor')).toBeUndefined();
    });

    it('should return undefined for prototype', () => {
      const frame = createDataFrame(null, { '@index': 0 });
      expect(getDataVariable(frame, 'prototype')).toBeUndefined();
    });

    it('should not access inherited properties', () => {
      const frame = createDataFrame(null, { '@index': 0 });
      // toString is inherited, should return undefined
      expect(getDataVariable(frame, 'toString')).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined value', () => {
      const frame = createDataFrame(null, { '@value': undefined });
      expect(getDataVariable(frame, '@value')).toBeUndefined();
    });

    it('should handle null value', () => {
      const frame = createDataFrame(null, { '@value': null });
      expect(getDataVariable(frame, '@value')).toBe(null);
    });

    it('should handle zero value', () => {
      const frame = createDataFrame(null, { '@index': 0 });
      expect(getDataVariable(frame, '@index')).toBe(0);
    });

    it('should handle false value', () => {
      const frame = createDataFrame(null, { '@first': false });
      expect(getDataVariable(frame, '@first')).toBe(false);
    });

    it('should handle empty string value', () => {
      const frame = createDataFrame(null, { '@key': '' });
      expect(getDataVariable(frame, '@key')).toBe('');
    });
  });
});

describe('setDataVariable', () => {
  describe('basic setting', () => {
    it('should set data variable on frame', () => {
      const frame = createDataFrame(null, {});
      setDataVariable(frame, '@index', 5);
      expect(frame['@index']).toBe(5);
    });

    it('should set multiple data variables', () => {
      const frame = createDataFrame(null, {});
      setDataVariable(frame, '@index', 0);
      setDataVariable(frame, '@first', true);
      setDataVariable(frame, '@key', 'name');

      expect(frame['@index']).toBe(0);
      expect(frame['@first']).toBe(true);
      expect(frame['@key']).toBe('name');
    });

    it('should override existing value', () => {
      const frame = createDataFrame(null, { '@index': 0 });
      setDataVariable(frame, '@index', 5);
      expect(frame['@index']).toBe(5);
    });
  });

  describe('set and get roundtrip', () => {
    it('should set and get data variable', () => {
      const frame = createDataFrame(null, {});
      setDataVariable(frame, '@custom', 'test');
      expect(getDataVariable(frame, '@custom')).toBe('test');
    });

    it('should handle multiple set/get operations', () => {
      const frame = createDataFrame(null, {});

      setDataVariable(frame, '@index', 0);
      expect(getDataVariable(frame, '@index')).toBe(0);

      setDataVariable(frame, '@index', 1);
      expect(getDataVariable(frame, '@index')).toBe(1);

      setDataVariable(frame, '@first', false);
      expect(getDataVariable(frame, '@first')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle null frame gracefully', () => {
      expect(() => setDataVariable(null, '@index', 0)).not.toThrow();
    });

    it('should handle undefined frame gracefully', () => {
      expect(() => setDataVariable(undefined, '@index', 0)).not.toThrow();
    });

    it('should set undefined value', () => {
      const frame = createDataFrame(null, {});
      setDataVariable(frame, '@value', undefined);
      expect(frame['@value']).toBeUndefined();
    });

    it('should set null value', () => {
      const frame = createDataFrame(null, {});
      setDataVariable(frame, '@value', null);
      expect(frame['@value']).toBe(null);
    });

    it('should set zero value', () => {
      const frame = createDataFrame(null, {});
      setDataVariable(frame, '@index', 0);
      expect(frame['@index']).toBe(0);
    });

    it('should set false value', () => {
      const frame = createDataFrame(null, {});
      setDataVariable(frame, '@first', false);
      expect(frame['@first']).toBe(false);
    });

    it('should set empty string value', () => {
      const frame = createDataFrame(null, {});
      setDataVariable(frame, '@key', '');
      expect(frame['@key']).toBe('');
    });
  });

  describe('frame isolation', () => {
    it('should not affect parent frame', () => {
      const parentFrame = createDataFrame(null, { '@index': 0 });
      const childFrame = createDataFrame(parentFrame, {});

      setDataVariable(childFrame, '@index', 5);

      expect(childFrame['@index']).toBe(5);
      expect(parentFrame['@index']).toBe(0);
    });

    it('should set as own property, not inherited', () => {
      const parentFrame = createDataFrame(null, { '@root': 'ROOT' });
      const childFrame = createDataFrame(parentFrame, {});

      setDataVariable(childFrame, '@custom', 'child-value');

      expect(childFrame['@custom']).toBe('child-value');
      expect(getDataVariable(parentFrame, '@custom')).toBeUndefined();
    });
  });
});
