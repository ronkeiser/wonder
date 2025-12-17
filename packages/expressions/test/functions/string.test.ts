import { describe, expect, it } from 'vitest';
import {
  endsWith,
  join,
  lower,
  replace,
  replaceAll,
  split,
  startsWith,
  substring,
  trim,
  upper,
} from '../../src/functions/string';

describe('String Functions', () => {
  describe('upper', () => {
    it('converts to uppercase', () => {
      expect(upper('hello')).toBe('HELLO');
    });

    it('handles empty string', () => {
      expect(upper('')).toBe('');
    });

    it('handles mixed case', () => {
      expect(upper('HeLLo WoRLd')).toBe('HELLO WORLD');
    });

    it('handles unicode', () => {
      expect(upper('café')).toBe('CAFÉ');
    });

    it('throws for non-string', () => {
      expect(() => upper(123)).toThrow('upper() requires a string');
      expect(() => upper(null)).toThrow('upper() requires a string');
    });
  });

  describe('lower', () => {
    it('converts to lowercase', () => {
      expect(lower('HELLO')).toBe('hello');
    });

    it('handles empty string', () => {
      expect(lower('')).toBe('');
    });

    it('handles mixed case', () => {
      expect(lower('HeLLo WoRLd')).toBe('hello world');
    });

    it('handles unicode', () => {
      expect(lower('CAFÉ')).toBe('café');
    });

    it('throws for non-string', () => {
      expect(() => lower(123)).toThrow('lower() requires a string');
      expect(() => lower(null)).toThrow('lower() requires a string');
    });
  });

  describe('trim', () => {
    it('trims whitespace from both ends', () => {
      expect(trim('  hello  ')).toBe('hello');
    });

    it('trims only leading whitespace', () => {
      expect(trim('  hello')).toBe('hello');
    });

    it('trims only trailing whitespace', () => {
      expect(trim('hello  ')).toBe('hello');
    });

    it('handles empty string', () => {
      expect(trim('')).toBe('');
    });

    it('handles string with only whitespace', () => {
      expect(trim('   ')).toBe('');
    });

    it('trims tabs and newlines', () => {
      expect(trim('\t\nhello\n\t')).toBe('hello');
    });

    it('preserves inner whitespace', () => {
      expect(trim('  hello world  ')).toBe('hello world');
    });

    it('throws for non-string', () => {
      expect(() => trim(123)).toThrow('trim() requires a string');
      expect(() => trim(null)).toThrow('trim() requires a string');
    });
  });

  describe('split', () => {
    it('splits by delimiter', () => {
      expect(split('a,b,c', ',')).toEqual(['a', 'b', 'c']);
    });

    it('splits by space', () => {
      expect(split('hello world', ' ')).toEqual(['hello', 'world']);
    });

    it('handles empty string', () => {
      expect(split('', ',')).toEqual(['']);
    });

    it('handles no matches', () => {
      expect(split('hello', ',')).toEqual(['hello']);
    });

    it('handles empty delimiter', () => {
      expect(split('abc', '')).toEqual(['a', 'b', 'c']);
    });

    it('handles multi-char delimiter', () => {
      expect(split('a::b::c', '::')).toEqual(['a', 'b', 'c']);
    });

    it('throws for non-string first argument', () => {
      expect(() => split(123, ',')).toThrow('split() requires a string as first argument');
    });

    it('throws for non-string delimiter', () => {
      expect(() => split('hello', 123)).toThrow('split() requires a string delimiter as second argument');
    });
  });

  describe('join', () => {
    it('joins with delimiter', () => {
      expect(join(['a', 'b', 'c'], ',')).toBe('a,b,c');
    });

    it('joins with space', () => {
      expect(join(['hello', 'world'], ' ')).toBe('hello world');
    });

    it('handles empty array', () => {
      expect(join([], ',')).toBe('');
    });

    it('handles single element', () => {
      expect(join(['only'], ',')).toBe('only');
    });

    it('handles empty delimiter', () => {
      expect(join(['a', 'b', 'c'], '')).toBe('abc');
    });

    it('converts non-strings to strings', () => {
      expect(join([1, 2, 3], '-')).toBe('1-2-3');
      expect(join([true, false], ',')).toBe('true,false');
      expect(join([null, undefined], ',')).toBe('null,undefined');
    });

    it('throws for non-array first argument', () => {
      expect(() => join('hello', ',')).toThrow('join() requires an array as first argument');
    });

    it('throws for non-string delimiter', () => {
      expect(() => join(['a', 'b'], 123)).toThrow('join() requires a string delimiter as second argument');
    });
  });

  describe('startsWith', () => {
    it('returns true for matching prefix', () => {
      expect(startsWith('hello world', 'hello')).toBe(true);
    });

    it('returns false for non-matching prefix', () => {
      expect(startsWith('hello world', 'world')).toBe(false);
    });

    it('handles empty prefix', () => {
      expect(startsWith('hello', '')).toBe(true);
    });

    it('handles empty string', () => {
      expect(startsWith('', 'hello')).toBe(false);
      expect(startsWith('', '')).toBe(true);
    });

    it('is case-sensitive', () => {
      expect(startsWith('Hello', 'hello')).toBe(false);
    });

    it('throws for non-string first argument', () => {
      expect(() => startsWith(123, 'hello')).toThrow('startsWith() requires a string as first argument');
    });

    it('throws for non-string prefix', () => {
      expect(() => startsWith('hello', 123)).toThrow('startsWith() requires a string prefix as second argument');
    });
  });

  describe('endsWith', () => {
    it('returns true for matching suffix', () => {
      expect(endsWith('hello world', 'world')).toBe(true);
    });

    it('returns false for non-matching suffix', () => {
      expect(endsWith('hello world', 'hello')).toBe(false);
    });

    it('handles empty suffix', () => {
      expect(endsWith('hello', '')).toBe(true);
    });

    it('handles empty string', () => {
      expect(endsWith('', 'hello')).toBe(false);
      expect(endsWith('', '')).toBe(true);
    });

    it('is case-sensitive', () => {
      expect(endsWith('World', 'world')).toBe(false);
    });

    it('throws for non-string first argument', () => {
      expect(() => endsWith(123, 'hello')).toThrow('endsWith() requires a string as first argument');
    });

    it('throws for non-string suffix', () => {
      expect(() => endsWith('hello', 123)).toThrow('endsWith() requires a string suffix as second argument');
    });
  });

  describe('replace', () => {
    it('replaces first occurrence', () => {
      expect(replace('hello hello', 'hello', 'hi')).toBe('hi hello');
    });

    it('handles no match', () => {
      expect(replace('hello', 'world', 'hi')).toBe('hello');
    });

    it('handles empty search', () => {
      expect(replace('hello', '', 'X')).toBe('Xhello');
    });

    it('handles empty replacement', () => {
      expect(replace('hello', 'l', '')).toBe('helo');
    });

    it('is case-sensitive', () => {
      expect(replace('Hello', 'hello', 'hi')).toBe('Hello');
    });

    it('throws for non-string first argument', () => {
      expect(() => replace(123, 'a', 'b')).toThrow('replace() requires a string as first argument');
    });

    it('throws for non-string search', () => {
      expect(() => replace('hello', 123, 'b')).toThrow('replace() requires a string as second argument');
    });

    it('throws for non-string replacement', () => {
      expect(() => replace('hello', 'a', 123)).toThrow('replace() requires a string as third argument');
    });
  });

  describe('replaceAll', () => {
    it('replaces all occurrences', () => {
      expect(replaceAll('hello hello hello', 'hello', 'hi')).toBe('hi hi hi');
    });

    it('handles no match', () => {
      expect(replaceAll('hello', 'world', 'hi')).toBe('hello');
    });

    it('handles empty search', () => {
      // split('').join('X') inserts X between each character
      expect(replaceAll('ab', '', 'X')).toBe('aXb');
    });

    it('handles empty replacement', () => {
      expect(replaceAll('hello', 'l', '')).toBe('heo');
    });

    it('is case-sensitive', () => {
      expect(replaceAll('Hello hello', 'hello', 'hi')).toBe('Hello hi');
    });

    it('handles overlapping matches', () => {
      expect(replaceAll('aaa', 'aa', 'b')).toBe('ba');
    });

    it('throws for non-string first argument', () => {
      expect(() => replaceAll(123, 'a', 'b')).toThrow('replaceAll() requires a string as first argument');
    });

    it('throws for non-string search', () => {
      expect(() => replaceAll('hello', 123, 'b')).toThrow('replaceAll() requires a string as second argument');
    });

    it('throws for non-string replacement', () => {
      expect(() => replaceAll('hello', 'a', 123)).toThrow('replaceAll() requires a string as third argument');
    });
  });

  describe('substring', () => {
    it('extracts from start index', () => {
      expect(substring('hello', 1)).toBe('ello');
    });

    it('extracts with start and end', () => {
      expect(substring('hello', 1, 4)).toBe('ell');
    });

    it('handles negative start index', () => {
      expect(substring('hello', -2)).toBe('lo');
    });

    it('handles negative end index', () => {
      expect(substring('hello', 0, -1)).toBe('hell');
    });

    it('handles both negative indices', () => {
      expect(substring('hello', -3, -1)).toBe('ll');
    });

    it('handles out of bounds indices', () => {
      expect(substring('hello', 10)).toBe('');
      expect(substring('hello', 0, 100)).toBe('hello');
    });

    it('handles empty string', () => {
      expect(substring('', 0)).toBe('');
    });

    it('throws for non-string first argument', () => {
      expect(() => substring(123, 0)).toThrow('substring() requires a string as first argument');
    });

    it('throws for non-number start', () => {
      expect(() => substring('hello', 'a')).toThrow('substring() requires a number as second argument');
    });

    it('throws for non-number end', () => {
      expect(() => substring('hello', 0, 'b')).toThrow('substring() requires a number as third argument if provided');
    });
  });
});
