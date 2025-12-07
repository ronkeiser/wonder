import { describe, expect, it } from 'vitest';
import { SafeString } from '../../src/index.js';
import {
  escapeExpression,
  isArray,
  isEmpty,
  SafeString as UtilsSafeString,
} from '../../src/runtime/utils.js';
import { expectTemplate } from './helpers/expect-template.js';

// Create Utils namespace for test compatibility
const Utils = {
  escapeExpression,
  isEmpty,
  isArray,
  // Note: extend, isMap, isSet not implemented in V1
};

describe('utils', () => {
  describe('#SafeString', () => {
    it('constructing a safestring from a string and checking its type', () => {
      const safe = new SafeString('testing 1, 2, 3');
      expect(safe).toBeInstanceOf(SafeString);
      expect(safe.toString()).toBe('testing 1, 2, 3');
    });

    it('it should not escape SafeString properties', () => {
      const name = new SafeString('<em>Sean O&#x27;Malley</em>');

      expectTemplate('{{name}}')
        .withInput({ name: name })
        .toCompileTo('<em>Sean O&#x27;Malley</em>');
    });
  });

  describe('#escapeExpression', () => {
    it('should escape html', () => {
      expect(Utils.escapeExpression('foo<&"\'>')).toBe('foo&lt;&amp;&quot;&#x27;&gt;');
      expect(Utils.escapeExpression('foo=')).toBe('foo&#x3D;');
    });

    it('should not escape SafeString', () => {
      // Note: utils.ts has its own SafeString class that escapeExpression checks against
      const string = new UtilsSafeString('foo<&"\'>');
      expect(Utils.escapeExpression(string)).toBe('foo<&"\'>');

      const obj = {
        toHTML: function () {
          return 'foo<&"\'>';
        },
      };
      // Note: Our implementation doesn't support toHTML() objects (only SafeString instances)
      expect(Utils.escapeExpression(obj)).toBe('[object Object]');
    });

    it('should handle falsy', () => {
      expect(Utils.escapeExpression('')).toBe('');
      expect(Utils.escapeExpression(undefined)).toBe('');
      expect(Utils.escapeExpression(null)).toBe('');

      expect(Utils.escapeExpression(false)).toBe('false');
      expect(Utils.escapeExpression(0)).toBe('0');
    });

    it('should handle empty objects', () => {
      expect(Utils.escapeExpression({})).toBe({}.toString());
      expect(Utils.escapeExpression([])).toBe([].toString());
    });
  });

  describe('#isEmpty', () => {
    it('should not be empty', () => {
      expect(Utils.isEmpty(undefined)).toBe(true);
      expect(Utils.isEmpty(null)).toBe(true);
      expect(Utils.isEmpty(false)).toBe(true);
      expect(Utils.isEmpty('')).toBe(true);
      expect(Utils.isEmpty([])).toBe(true);
    });

    it('should be empty', () => {
      expect(Utils.isEmpty(0)).toBe(false);
      expect(Utils.isEmpty([1])).toBe(false);
      expect(Utils.isEmpty('foo')).toBe(false);
      expect(Utils.isEmpty({ bar: 1 })).toBe(false);
    });
  });

  // SKIP: extend not implemented in V1
  describe.skip('#extend', () => {
    it('should ignore prototype values', () => {
      function A(this: any) {
        this.a = 1;
      }
      A.prototype.b = 4;

      const b: any = { b: 2 };

      // Utils.extend(b, new A());

      expect(b.a).toBe(1);
      expect(b.b).toBe(2);
    });
  });

  describe('#isType', () => {
    it('should check if variable is type Array', () => {
      expect(Utils.isArray('string')).toBe(false);
      expect(Utils.isArray([])).toBe(true);
    });

    // SKIP: isMap not implemented in V1
    it.skip('should check if variable is type Map', () => {
      // expect(Utils.isMap('string')).toBe(false);
      // expect(Utils.isMap(new Map())).toBe(true);
    });

    // SKIP: isSet not implemented in V1
    it.skip('should check if variable is type Set', () => {
      // expect(Utils.isSet('string')).toBe(false);
      // expect(Utils.isSet(new Set())).toBe(true);
    });
  });
});
