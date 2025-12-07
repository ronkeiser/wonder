import { describe, expect, it } from 'vitest';
import {
  SafeString,
  createFrame,
  escapeExpression,
  isArray,
  isEmpty,
  isFunction,
  isObject,
  lookupProperty,
} from '../../src/runtime/utils';

/**
 * Runtime Utilities Tests
 *
 * Tests for core utility functions that provide secure property access,
 * HTML escaping, scope management, and value checking.
 */
describe('Runtime Utilities', () => {
  describe('lookupProperty (Feature 3.1 - Task C3-F1-T1)', () => {
    describe('Basic Property Lookup', () => {
      it('returns value for existing own property', () => {
        const obj = { foo: 'bar', num: 42, bool: true };

        expect(lookupProperty(obj, 'foo')).toBe('bar');
        expect(lookupProperty(obj, 'num')).toBe(42);
        expect(lookupProperty(obj, 'bool')).toBe(true);
      });

      it('returns undefined for non-existent property', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'baz')).toBeUndefined();
        expect(lookupProperty(obj, 'nonExistent')).toBeUndefined();
      });

      it('returns undefined for null parent', () => {
        expect(lookupProperty(null, 'foo')).toBeUndefined();
        expect(lookupProperty(null, 'anyProp')).toBeUndefined();
      });

      it('returns undefined for undefined parent', () => {
        expect(lookupProperty(undefined, 'foo')).toBeUndefined();
        expect(lookupProperty(undefined, 'anyProp')).toBeUndefined();
      });

      it('returns null for own property with null value', () => {
        const obj = { foo: null };

        expect(lookupProperty(obj, 'foo')).toBeNull();
      });

      it('returns undefined for own property with undefined value', () => {
        const obj = { foo: undefined };

        expect(lookupProperty(obj, 'foo')).toBeUndefined();
      });
    });

    describe('Security - Inherited Properties', () => {
      it('returns undefined for inherited property', () => {
        const obj = Object.create({ inherited: 'value' });
        obj.own = 'ownValue';

        expect(lookupProperty(obj, 'own')).toBe('ownValue');
        expect(lookupProperty(obj, 'inherited')).toBeUndefined();
      });

      it('blocks access to __proto__', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, '__proto__')).toBeUndefined();
      });

      it('blocks access to constructor', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'constructor')).toBeUndefined();
      });

      it('blocks access to prototype', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'prototype')).toBeUndefined();
      });

      it('blocks access to toString (inherited from Object.prototype)', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'toString')).toBeUndefined();
      });

      it('blocks access to hasOwnProperty (inherited)', () => {
        const obj = { foo: 'bar' };

        expect(lookupProperty(obj, 'hasOwnProperty')).toBeUndefined();
      });

      it('allows access to own property named "__proto__" when set via Object.defineProperty', () => {
        const obj: any = { foo: 'bar' };
        // Using defineProperty is the only way to create an own property named "__proto__"
        Object.defineProperty(obj, '__proto__', {
          value: 'ownProtoValue',
          enumerable: true,
          writable: true,
          configurable: true,
        });

        // This is an own property, not the inherited __proto__
        expect(lookupProperty(obj, '__proto__')).toBe('ownProtoValue');
      });
    });

    describe('Data Types', () => {
      it('works with nested objects', () => {
        const obj = {
          user: { name: 'Alice', age: 30 },
          items: [1, 2, 3],
        };

        expect(lookupProperty(obj, 'user')).toEqual({ name: 'Alice', age: 30 });
        expect(lookupProperty(obj, 'items')).toEqual([1, 2, 3]);
      });

      it('works with arrays', () => {
        const arr = ['a', 'b', 'c'];

        expect(lookupProperty(arr, '0')).toBe('a');
        expect(lookupProperty(arr, '1')).toBe('b');
        expect(lookupProperty(arr, '2')).toBe('c');
        expect(lookupProperty(arr, 'length')).toBe(3);
      });

      it('works with array numeric string indices', () => {
        const arr = [10, 20, 30];

        expect(lookupProperty(arr, '0')).toBe(10);
        expect(lookupProperty(arr, '1')).toBe(20);
        expect(lookupProperty(arr, '2')).toBe(30);
      });

      it('works with objects with numeric keys', () => {
        const obj = { '0': 'zero', '1': 'one', '10': 'ten' };

        expect(lookupProperty(obj, '0')).toBe('zero');
        expect(lookupProperty(obj, '1')).toBe('one');
        expect(lookupProperty(obj, '10')).toBe('ten');
      });

      it('returns undefined for out-of-bounds array index', () => {
        const arr = ['a', 'b', 'c'];

        expect(lookupProperty(arr, '3')).toBeUndefined();
        expect(lookupProperty(arr, '100')).toBeUndefined();
      });
    });

    describe('Edge Cases', () => {
      it('handles empty string property name', () => {
        const obj = { '': 'empty' };

        expect(lookupProperty(obj, '')).toBe('empty');
      });

      it('handles property name with spaces', () => {
        const obj = { 'foo bar': 'value' };

        expect(lookupProperty(obj, 'foo bar')).toBe('value');
      });

      it('handles property name with special characters', () => {
        const obj = { 'foo-bar': 'dash', 'foo.bar': 'dot', 'foo/bar': 'slash' };

        expect(lookupProperty(obj, 'foo-bar')).toBe('dash');
        expect(lookupProperty(obj, 'foo.bar')).toBe('dot');
        expect(lookupProperty(obj, 'foo/bar')).toBe('slash');
      });

      it('returns undefined for primitive parents', () => {
        expect(lookupProperty('string', 'length')).toBeUndefined();
        expect(lookupProperty(42, 'toString')).toBeUndefined();
        expect(lookupProperty(true, 'valueOf')).toBeUndefined();
      });

      it('works with functions', () => {
        const fn = () => {};
        (fn as any).customProp = 'value';

        expect(lookupProperty(fn, 'customProp')).toBe('value');
        expect(lookupProperty(fn, 'call')).toBeUndefined(); // inherited
      });

      it('handles object with null prototype', () => {
        const obj = Object.create(null);
        obj.foo = 'bar';

        expect(lookupProperty(obj, 'foo')).toBe('bar');
        expect(lookupProperty(obj, 'toString')).toBeUndefined();
      });
    });

    describe('Complex Scenarios', () => {
      it('handles deeply nested property values', () => {
        const obj = {
          level1: {
            level2: {
              level3: {
                value: 'deep',
              },
            },
          },
        };

        const level1 = lookupProperty(obj, 'level1');
        expect(level1).toBeDefined();

        const level2 = lookupProperty(level1, 'level2');
        expect(level2).toBeDefined();

        const level3 = lookupProperty(level2, 'level3');
        expect(level3).toBeDefined();

        const value = lookupProperty(level3, 'value');
        expect(value).toBe('deep');
      });

      it('handles property shadowing', () => {
        const parent = { prop: 'parent' };
        const child = Object.create(parent);
        child.prop = 'child';

        expect(lookupProperty(child, 'prop')).toBe('child');
      });

      it('distinguishes between missing and undefined properties', () => {
        const obj = { explicitUndefined: undefined };

        // Both return undefined, but one is an own property
        expect(lookupProperty(obj, 'explicitUndefined')).toBeUndefined();
        expect(lookupProperty(obj, 'missing')).toBeUndefined();

        // Verify using hasOwnProperty
        expect(Object.prototype.hasOwnProperty.call(obj, 'explicitUndefined')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(obj, 'missing')).toBe(false);
      });

      it('handles objects with many properties', () => {
        const obj: any = {};
        for (let i = 0; i < 100; i++) {
          obj[`prop${i}`] = i;
        }

        expect(lookupProperty(obj, 'prop0')).toBe(0);
        expect(lookupProperty(obj, 'prop50')).toBe(50);
        expect(lookupProperty(obj, 'prop99')).toBe(99);
        expect(lookupProperty(obj, 'prop100')).toBeUndefined();
      });
    });
  });

  describe('escapeExpression (Feature 3.2 - Task C3-F2-T1)', () => {
    describe('Basic Escaping', () => {
      it('escapes ampersand', () => {
        expect(escapeExpression('foo & bar')).toBe('foo &amp; bar');
        expect(escapeExpression('&')).toBe('&amp;');
        expect(escapeExpression('&&')).toBe('&amp;&amp;');
      });

      it('escapes less than', () => {
        expect(escapeExpression('foo < bar')).toBe('foo &lt; bar');
        expect(escapeExpression('<')).toBe('&lt;');
        expect(escapeExpression('<<')).toBe('&lt;&lt;');
      });

      it('escapes greater than', () => {
        expect(escapeExpression('foo > bar')).toBe('foo &gt; bar');
        expect(escapeExpression('>')).toBe('&gt;');
        expect(escapeExpression('>>')).toBe('&gt;&gt;');
      });

      it('escapes double quote', () => {
        expect(escapeExpression('foo "bar" baz')).toBe('foo &quot;bar&quot; baz');
        expect(escapeExpression('"')).toBe('&quot;');
        expect(escapeExpression('""')).toBe('&quot;&quot;');
      });

      it('escapes single quote', () => {
        expect(escapeExpression("foo 'bar' baz")).toBe('foo &#x27;bar&#x27; baz');
        expect(escapeExpression("'")).toBe('&#x27;');
        expect(escapeExpression("''")).toBe('&#x27;&#x27;');
      });

      it('escapes backtick', () => {
        expect(escapeExpression('foo `bar` baz')).toBe('foo &#x60;bar&#x60; baz');
        expect(escapeExpression('`')).toBe('&#x60;');
        expect(escapeExpression('``')).toBe('&#x60;&#x60;');
      });

      it('escapes equals sign', () => {
        expect(escapeExpression('foo = bar')).toBe('foo &#x3D; bar');
        expect(escapeExpression('=')).toBe('&#x3D;');
        expect(escapeExpression('==')).toBe('&#x3D;&#x3D;');
      });

      it('escapes all 7 special characters together', () => {
        const input = `&<>"'\`=`;
        const expected = '&amp;&lt;&gt;&quot;&#x27;&#x60;&#x3D;';
        expect(escapeExpression(input)).toBe(expected);
      });
    });

    describe('HTML Tag Escaping', () => {
      it('escapes script tags', () => {
        const input = '<script>alert("xss")</script>';
        const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
        expect(escapeExpression(input)).toBe(expected);
      });

      it('escapes HTML with attributes', () => {
        const input = '<div class="danger" id=\'test\'>';
        const expected = '&lt;div class&#x3D;&quot;danger&quot; id&#x3D;&#x27;test&#x27;&gt;';
        expect(escapeExpression(input)).toBe(expected);
      });

      it('escapes img tags with onerror', () => {
        const input = '<img src=x onerror="alert(1)">';
        const expected = '&lt;img src&#x3D;x onerror&#x3D;&quot;alert(1)&quot;&gt;';
        expect(escapeExpression(input)).toBe(expected);
      });

      it('escapes anchor tags', () => {
        const input = '<a href="javascript:alert(\'xss\')">Click</a>';
        const expected =
          '&lt;a href&#x3D;&quot;javascript:alert(&#x27;xss&#x27;)&quot;&gt;Click&lt;/a&gt;';
        expect(escapeExpression(input)).toBe(expected);
      });
    });

    describe('Null and Undefined Handling', () => {
      it('returns empty string for null', () => {
        expect(escapeExpression(null)).toBe('');
      });

      it('returns empty string for undefined', () => {
        expect(escapeExpression(undefined)).toBe('');
      });
    });

    describe('Type Coercion', () => {
      it('converts false to string', () => {
        expect(escapeExpression(false)).toBe('false');
      });

      it('converts true to string', () => {
        expect(escapeExpression(true)).toBe('true');
      });

      it('converts zero to string', () => {
        expect(escapeExpression(0)).toBe('0');
      });

      it('converts numbers to string', () => {
        expect(escapeExpression(42)).toBe('42');
        expect(escapeExpression(-1)).toBe('-1');
        expect(escapeExpression(3.14)).toBe('3.14');
      });

      it('converts objects to string', () => {
        expect(escapeExpression({})).toBe('[object Object]');
      });

      it('converts arrays to string', () => {
        expect(escapeExpression([1, 2, 3])).toBe('1,2,3');
        expect(escapeExpression(['a', 'b'])).toBe('a,b');
      });
    });

    describe('Fast Path (No Special Characters)', () => {
      it('returns unchanged string with no special chars', () => {
        const input = 'Hello World';
        expect(escapeExpression(input)).toBe(input);
      });

      it('returns unchanged alphanumeric string', () => {
        const input = 'abc123';
        expect(escapeExpression(input)).toBe(input);
      });

      it('returns unchanged string with spaces', () => {
        const input = 'foo bar baz';
        expect(escapeExpression(input)).toBe(input);
      });

      it('returns unchanged string with punctuation', () => {
        const input = 'Hello, World! How are you?';
        expect(escapeExpression(input)).toBe(input);
      });

      it('returns unchanged empty string', () => {
        expect(escapeExpression('')).toBe('');
      });
    });

    describe('Mixed Content', () => {
      it('escapes only special characters in mixed text', () => {
        const input = 'Safe text & <dangerous> content';
        const expected = 'Safe text &amp; &lt;dangerous&gt; content';
        expect(escapeExpression(input)).toBe(expected);
      });

      it('preserves safe punctuation', () => {
        const input = "Hello! How are you? I'm fine.";
        const expected = 'Hello! How are you? I&#x27;m fine.';
        expect(escapeExpression(input)).toBe(expected);
      });

      it('handles URLs with special characters', () => {
        const input = 'http://example.com?foo=bar&baz=qux';
        const expected = 'http://example.com?foo&#x3D;bar&amp;baz&#x3D;qux';
        expect(escapeExpression(input)).toBe(expected);
      });
    });

    describe('Edge Cases', () => {
      it('handles very long strings', () => {
        const input = '<script>'.repeat(1000);
        const expected = '&lt;script&gt;'.repeat(1000);
        expect(escapeExpression(input)).toBe(expected);
      });

      it('handles strings with only special characters', () => {
        expect(escapeExpression('&&&')).toBe('&amp;&amp;&amp;');
        expect(escapeExpression('<<<')).toBe('&lt;&lt;&lt;');
      });

      it('handles unicode characters', () => {
        expect(escapeExpression('Hello 世界')).toBe('Hello 世界');
        expect(escapeExpression('Emoji 😀')).toBe('Emoji 😀');
      });

      it('handles newlines and tabs', () => {
        expect(escapeExpression('line1\nline2')).toBe('line1\nline2');
        expect(escapeExpression('col1\tcol2')).toBe('col1\tcol2');
      });

      it('handles strings with multiple spaces', () => {
        expect(escapeExpression('foo  bar   baz')).toBe('foo  bar   baz');
      });
    });

    describe('Real-world XSS Scenarios', () => {
      it('prevents XSS via script injection', () => {
        const malicious = '<script>document.cookie</script>';
        const escaped = escapeExpression(malicious);
        expect(escaped).not.toContain('<script>');
        expect(escaped).toContain('&lt;script&gt;');
      });

      it('prevents XSS via event handler', () => {
        const malicious = 'Click <span onmouseover="alert(1)">here</span>';
        const escaped = escapeExpression(malicious);
        expect(escaped).not.toContain('onmouseover=');
        expect(escaped).toContain('onmouseover&#x3D;');
      });

      it('prevents XSS via javascript: protocol', () => {
        const malicious = '<a href="javascript:alert(\'XSS\')">Click</a>';
        const escaped = escapeExpression(malicious);
        expect(escaped).not.toContain('<a href');
        expect(escaped).toContain('&lt;a href&#x3D;');
      });

      it('prevents XSS via data: URL', () => {
        const malicious = '<img src="data:text/html,<script>alert(1)</script>">';
        const escaped = escapeExpression(malicious);
        expect(escaped).not.toContain('<img');
        expect(escaped).toContain('&lt;img');
      });
    });
  });

  describe('SafeString (Feature 3.2 - Task C3-F2-T3)', () => {
    describe('SafeString Class', () => {
      it('creates SafeString instance', () => {
        const safe = new SafeString('<b>Bold</b>');
        expect(safe).toBeInstanceOf(SafeString);
      });

      it('toString() returns string', () => {
        const safe = new SafeString('<b>Bold</b>');
        expect(safe.toString()).toBe('<b>Bold</b>');
      });

      it('toHTML() returns string', () => {
        const safe = new SafeString('<b>Bold</b>');
        expect(safe.toHTML()).toBe('<b>Bold</b>');
      });

      it('preserves HTML content', () => {
        const html = '<div class="alert">Warning!</div>';
        const safe = new SafeString(html);
        expect(safe.toString()).toBe(html);
        expect(safe.toHTML()).toBe(html);
      });

      it('handles empty string', () => {
        const safe = new SafeString('');
        expect(safe.toString()).toBe('');
        expect(safe.toHTML()).toBe('');
      });
    });

    describe('SafeString Integration with escapeExpression', () => {
      it('bypasses escaping for SafeString instances', () => {
        const html = '<b>Bold</b>';
        const safe = new SafeString(html);
        expect(escapeExpression(safe)).toBe(html);
      });

      it('preserves HTML entities in SafeString', () => {
        const html = '&lt;&gt;&amp;&quot;';
        const safe = new SafeString(html);
        expect(escapeExpression(safe)).toBe(html);
      });

      it('preserves dangerous HTML in SafeString', () => {
        const html = '<script>alert("XSS")</script>';
        const safe = new SafeString(html);
        expect(escapeExpression(safe)).toBe(html);
      });

      it('still escapes regular strings', () => {
        const regular = '<b>Bold</b>';
        expect(escapeExpression(regular)).toBe('&lt;b&gt;Bold&lt;/b&gt;');
      });

      it('handles mixed usage', () => {
        const safe = new SafeString('<b>Safe HTML</b>');
        const unsafe = '<i>Unsafe HTML</i>';

        expect(escapeExpression(safe)).toBe('<b>Safe HTML</b>');
        expect(escapeExpression(unsafe)).toBe('&lt;i&gt;Unsafe HTML&lt;/i&gt;');
      });

      it('SafeString takes precedence over null check', () => {
        const safe = new SafeString('');
        // Empty string should be returned, not converted to ''
        expect(escapeExpression(safe)).toBe('');
      });

      it('SafeString with special characters bypasses escaping', () => {
        const html = '&<>"\'`=';
        const safe = new SafeString(html);
        expect(escapeExpression(safe)).toBe(html);
        // Regular string would be escaped
        expect(escapeExpression(html)).toBe('&amp;&lt;&gt;&quot;&#x27;&#x60;&#x3D;');
      });
    });
  });

  describe('createFrame (Feature 3.3 - Task C3-F3-T1 & T2)', () => {
    describe('Basic Frame Creation', () => {
      it('creates new object (not same reference)', () => {
        const data = { name: 'Alice', age: 30 };
        const frame = createFrame(data);
        expect(frame).not.toBe(data);
      });

      it('copies all properties from input', () => {
        const data = { name: 'Alice', age: 30, city: 'NYC' };
        const frame = createFrame(data);
        expect(frame.name).toBe('Alice');
        expect(frame.age).toBe(30);
        expect(frame.city).toBe('NYC');
      });

      it('adds _parent property referencing input', () => {
        const data = { name: 'Alice', age: 30 };
        const frame = createFrame(data);
        expect(frame._parent).toBe(data);
      });

      it('changes to frame do not affect parent', () => {
        const data = { name: 'Alice', age: 30 };
        const frame = createFrame(data);
        frame.name = 'Bob';
        frame.age = 25;
        expect(data.name).toBe('Alice');
        expect(data.age).toBe(30);
      });

      it('parent properties accessible via _parent', () => {
        const data = { name: 'Alice', age: 30 };
        const frame = createFrame(data);
        expect(frame._parent.name).toBe('Alice');
        expect(frame._parent.age).toBe(30);
      });

      it('works with empty object input', () => {
        const data = {};
        const frame = createFrame(data);
        expect(frame).not.toBe(data);
        expect(frame._parent).toBe(data);
      });

      it('works with object containing data variables', () => {
        const data = { root: { name: 'Root' }, key: 'value', index: 0 };
        const frame = createFrame(data);
        expect(frame.root).toBe(data.root);
        expect(frame.key).toBe('value');
        expect(frame.index).toBe(0);
        expect(frame._parent).toBe(data);
      });
    });

    describe('Edge Cases', () => {
      it('createFrame(null) returns frame with _parent: null', () => {
        const frame = createFrame(null);
        expect(frame).toEqual({ _parent: null });
        expect(frame._parent).toBeNull();
      });

      it('createFrame(undefined) returns frame with _parent: undefined', () => {
        const frame = createFrame(undefined);
        expect(frame).toEqual({ _parent: undefined });
        expect(frame._parent).toBeUndefined();
      });

      it('nested frames maintain _parent chain', () => {
        const data1 = { level: 1 };
        const frame1 = createFrame(data1);
        const frame2 = createFrame(frame1);
        const frame3 = createFrame(frame2);

        expect(frame3._parent).toBe(frame2);
        expect(frame3._parent._parent).toBe(frame1);
        expect(frame3._parent._parent._parent).toBe(data1);
      });

      it('input with _parent property handled correctly', () => {
        const grandparent = { level: 0 };
        const parent = { level: 1, _parent: grandparent };
        const frame = createFrame(parent);

        // New _parent always references immediate parent
        expect(frame._parent).toBe(parent);
        // Can still access grandparent through parent
        expect(frame._parent._parent).toBe(grandparent);
      });

      it('multiple levels of nesting work correctly', () => {
        const root = { name: 'root', value: 0 };
        const level1 = createFrame(root);
        level1.value = 1;
        const level2 = createFrame(level1);
        level2.value = 2;
        const level3 = createFrame(level2);
        level3.value = 3;

        expect(level3.value).toBe(3);
        expect(level3._parent.value).toBe(2);
        expect(level3._parent._parent.value).toBe(1);
        expect(level3._parent._parent._parent.value).toBe(0);

        // Changes don't propagate up
        expect(root.value).toBe(0);
        expect(level1.value).toBe(1);
        expect(level2.value).toBe(2);
      });
    });
  });

  describe('isEmpty (Feature 3.4 - Task C3-F4-T1 & T2)', () => {
    describe('Empty Values (return true)', () => {
      it('returns true for null', () => {
        expect(isEmpty(null)).toBe(true);
      });

      it('returns true for undefined', () => {
        expect(isEmpty(undefined)).toBe(true);
      });

      it('returns true for false', () => {
        expect(isEmpty(false)).toBe(true);
      });

      it('returns true for empty string', () => {
        expect(isEmpty('')).toBe(true);
      });

      it('returns true for empty array', () => {
        expect(isEmpty([])).toBe(true);
      });
    });

    describe('Non-Empty Values (return false)', () => {
      it('returns false for zero (truthy in Handlebars!)', () => {
        expect(isEmpty(0)).toBe(false);
      });

      it('returns false for empty object (truthy in Handlebars!)', () => {
        expect(isEmpty({})).toBe(false);
      });

      it('returns false for true', () => {
        expect(isEmpty(true)).toBe(false);
      });

      it('returns false for non-empty string', () => {
        expect(isEmpty('text')).toBe(false);
        expect(isEmpty('hello world')).toBe(false);
      });

      it('returns false for non-empty array', () => {
        expect(isEmpty([1])).toBe(false);
        expect(isEmpty([1, 2, 3])).toBe(false);
      });

      it('returns false for positive numbers', () => {
        expect(isEmpty(1)).toBe(false);
        expect(isEmpty(42)).toBe(false);
        expect(isEmpty(3.14)).toBe(false);
      });

      it('returns false for negative numbers', () => {
        expect(isEmpty(-1)).toBe(false);
        expect(isEmpty(-42)).toBe(false);
      });

      it('returns false for non-empty objects', () => {
        expect(isEmpty({ key: 'value' })).toBe(false);
        expect(isEmpty({ a: 1, b: 2 })).toBe(false);
      });
    });

    describe('Array Detection (Task C3-F4-T2)', () => {
      it('returns true for empty array', () => {
        expect(isEmpty([])).toBe(true);
      });

      it('returns false for non-empty array', () => {
        expect(isEmpty([1, 2, 3])).toBe(false);
      });

      it('returns false for array-like object with length property', () => {
        const arrayLike = { length: 0 };
        expect(isEmpty(arrayLike)).toBe(false);
      });

      it('returns false for object with length property', () => {
        const obj = { length: 10, foo: 'bar' };
        expect(isEmpty(obj)).toBe(false);
      });

      it('returns false for sparse arrays with length > 0', () => {
        const sparse = new Array(5); // [empty × 5], length = 5
        expect(isEmpty(sparse)).toBe(false);
      });

      it('returns false for array with undefined elements', () => {
        expect(isEmpty([undefined])).toBe(false);
        expect(isEmpty([undefined, undefined])).toBe(false);
      });

      it('returns false for array with null elements', () => {
        expect(isEmpty([null])).toBe(false);
        expect(isEmpty([null, null])).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('returns false for functions', () => {
        expect(isEmpty(() => {})).toBe(false);
        expect(isEmpty(function () {})).toBe(false);
      });

      it('returns false for Date objects', () => {
        expect(isEmpty(new Date())).toBe(false);
      });

      it('returns false for RegExp objects', () => {
        expect(isEmpty(/test/)).toBe(false);
      });

      it('returns false for Error objects', () => {
        expect(isEmpty(new Error('test'))).toBe(false);
      });

      it('returns false for whitespace strings', () => {
        expect(isEmpty(' ')).toBe(false);
        expect(isEmpty('\n')).toBe(false);
        expect(isEmpty('\t')).toBe(false);
      });

      it('returns false for string "0"', () => {
        expect(isEmpty('0')).toBe(false);
      });

      it('returns false for string "false"', () => {
        expect(isEmpty('false')).toBe(false);
      });

      it('returns false for NaN', () => {
        expect(isEmpty(NaN)).toBe(false);
      });

      it('returns false for Infinity', () => {
        expect(isEmpty(Infinity)).toBe(false);
        expect(isEmpty(-Infinity)).toBe(false);
      });
    });
  });

  describe('Type Checking Utilities (Feature 3.5)', () => {
    describe('isArray (Task C3-F5-T1)', () => {
      it('returns true for empty array', () => {
        expect(isArray([])).toBe(true);
      });

      it('returns true for non-empty array', () => {
        expect(isArray([1, 2, 3])).toBe(true);
      });

      it('returns false for empty object', () => {
        expect(isArray({})).toBe(false);
      });

      it('returns false for array-like object with length property', () => {
        expect(isArray({ length: 0 })).toBe(false);
      });

      it('returns false for null', () => {
        expect(isArray(null)).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(isArray(undefined)).toBe(false);
      });

      it('returns false for string', () => {
        expect(isArray('string')).toBe(false);
      });

      it('returns false for number', () => {
        expect(isArray(42)).toBe(false);
      });

      it('returns false for boolean', () => {
        expect(isArray(true)).toBe(false);
      });

      it('returns false for function', () => {
        expect(isArray(() => {})).toBe(false);
      });

      it('returns true for sparse array', () => {
        const sparse = new Array(5);
        expect(isArray(sparse)).toBe(true);
      });

      it('returns true for typed arrays', () => {
        expect(isArray(new Int8Array())).toBe(false); // Typed arrays are not true arrays
        expect(isArray(new Uint8Array())).toBe(false);
      });
    });

    describe('isFunction (Task C3-F5-T2)', () => {
      it('returns true for regular function', () => {
        expect(isFunction(function() {})).toBe(true);
      });

      it('returns true for arrow function', () => {
        expect(isFunction(() => {})).toBe(true);
      });

      it('returns true for async function', () => {
        expect(isFunction(async () => {})).toBe(true);
      });

      it('returns true for generator function', () => {
        expect(isFunction(function*() {})).toBe(true);
      });

      it('returns true for class constructor', () => {
        class MyClass {}
        expect(isFunction(MyClass)).toBe(true);
      });

      it('returns true for built-in constructors', () => {
        expect(isFunction(Array)).toBe(true);
        expect(isFunction(Object)).toBe(true);
        expect(isFunction(Date)).toBe(true);
      });

      it('returns false for object', () => {
        expect(isFunction({})).toBe(false);
      });

      it('returns false for null', () => {
        expect(isFunction(null)).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(isFunction(undefined)).toBe(false);
      });

      it('returns false for string', () => {
        expect(isFunction('function')).toBe(false);
      });

      it('returns false for number', () => {
        expect(isFunction(42)).toBe(false);
      });

      it('returns false for array', () => {
        expect(isFunction([])).toBe(false);
      });
    });

    describe('isObject (Task C3-F5-T3)', () => {
      it('returns true for empty object', () => {
        expect(isObject({})).toBe(true);
      });

      it('returns true for non-empty object', () => {
        expect(isObject({ key: 'value' })).toBe(true);
      });

      it('returns true for array', () => {
        expect(isObject([])).toBe(true);
      });

      it('returns true for function', () => {
        expect(isObject(() => {})).toBe(false); // Functions are typeof 'function', not 'object'
      });

      it('returns true for Date object', () => {
        expect(isObject(new Date())).toBe(true);
      });

      it('returns true for RegExp object', () => {
        expect(isObject(/regex/)).toBe(true);
      });

      it('returns true for Error object', () => {
        expect(isObject(new Error('test'))).toBe(true);
      });

      it('returns false for null (special case)', () => {
        expect(isObject(null)).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(isObject(undefined)).toBe(false);
      });

      it('returns false for string', () => {
        expect(isObject('string')).toBe(false);
      });

      it('returns false for number', () => {
        expect(isObject(42)).toBe(false);
      });

      it('returns false for boolean', () => {
        expect(isObject(true)).toBe(false);
        expect(isObject(false)).toBe(false);
      });

      it('returns true for object created with Object.create(null)', () => {
        const obj = Object.create(null);
        expect(isObject(obj)).toBe(true);
      });

      it('returns true for class instances', () => {
        class MyClass {}
        const instance = new MyClass();
        expect(isObject(instance)).toBe(true);
      });
    });
  });
});
