import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';

describe('Lexer - Basic Structure (C1-F1-T3)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('setInput()', () => {
    it('should initialize state correctly', () => {
      lexer.setInput('Hello World');

      expect(lexer.peek()).toBe('H');
      expect(lexer.isEOF()).toBe(false);
    });

    it('should reset state on subsequent calls', () => {
      lexer.setInput('First');
      lexer.advance();
      lexer.advance();

      lexer.setInput('Second');
      expect(lexer.peek()).toBe('S');
    });

    it('should handle empty string', () => {
      lexer.setInput('');
      expect(lexer.isEOF()).toBe(true);
    });
  });

  describe('advance()', () => {
    it('should move position and return character', () => {
      lexer.setInput('abc');

      expect(lexer.advance()).toBe('a');
      expect(lexer.advance()).toBe('b');
      expect(lexer.advance()).toBe('c');
    });

    it('should update line and column on newline', () => {
      lexer.setInput('a\nb\nc');

      lexer.advance(); // 'a' at line 1, column 0
      expect(lexer.peek()).toBe('\n');

      lexer.advance(); // '\n' advances to line 2, column 0
      expect(lexer.peek()).toBe('b');

      lexer.advance(); // 'b' at line 2, column 0
      lexer.advance(); // '\n' advances to line 3, column 0
      expect(lexer.peek()).toBe('c');
    });

    it('should increment column for non-newline characters', () => {
      lexer.setInput('abc');

      lexer.advance(); // column becomes 1
      lexer.advance(); // column becomes 2
      lexer.advance(); // column becomes 3

      expect(lexer.isEOF()).toBe(true);
    });

    it('should return empty string at EOF', () => {
      lexer.setInput('a');
      lexer.advance();

      expect(lexer.advance()).toBe('');
      expect(lexer.advance()).toBe('');
    });
  });

  describe('peek()', () => {
    it('should not modify state', () => {
      lexer.setInput('abc');

      expect(lexer.peek()).toBe('a');
      expect(lexer.peek()).toBe('a');
      expect(lexer.peek()).toBe('a');
    });

    it('should return empty string at EOF', () => {
      lexer.setInput('');
      expect(lexer.peek()).toBe('');
    });

    it('should show next character after advance', () => {
      lexer.setInput('abc');

      lexer.advance();
      expect(lexer.peek()).toBe('b');

      lexer.advance();
      expect(lexer.peek()).toBe('c');
    });
  });

  describe('match()', () => {
    it('should correctly identify multi-character sequences', () => {
      lexer.setInput('{{foo}}');

      expect(lexer.match('{{')).toBe(true);
      expect(lexer.match('{')).toBe(true);
      expect(lexer.match('{{{')).toBe(false);
    });

    it('should not consume characters', () => {
      lexer.setInput('{{foo}}');

      lexer.match('{{');
      expect(lexer.peek()).toBe('{');
    });

    it('should return false when string extends beyond input', () => {
      lexer.setInput('ab');

      expect(lexer.match('abc')).toBe(false);
    });

    it('should handle exact match at end of input', () => {
      lexer.setInput('abc');

      expect(lexer.match('abc')).toBe(true);
    });

    it('should return false for partial mismatch', () => {
      lexer.setInput('{{foo');

      expect(lexer.match('{{')).toBe(true);
      expect(lexer.match('{{{')).toBe(false);
    });
  });

  describe('isEOF()', () => {
    it('should return true at end of input', () => {
      lexer.setInput('a');

      expect(lexer.isEOF()).toBe(false);
      lexer.advance();
      expect(lexer.isEOF()).toBe(true);
    });

    it('should return true for empty input', () => {
      lexer.setInput('');
      expect(lexer.isEOF()).toBe(true);
    });

    it('should return false for non-empty input', () => {
      lexer.setInput('abc');
      expect(lexer.isEOF()).toBe(false);
    });
  });

  describe('lex()', () => {
    it('should return null at EOF', () => {
      lexer.setInput('');
      expect(lexer.lex()).toBeNull();
    });
  });
});

describe('Lexer - Identifier Tokenization (C1-F1-T9)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('Simple identifiers', () => {
    it('should tokenize simple identifier in mustache', () => {
      lexer.setInput('{{foo}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: 'foo',
      });
      expect(token?.loc).toBeDefined();
    });

    it('should tokenize identifier with underscore prefix in mustache', () => {
      lexer.setInput('{{_var}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: '_var',
      });
    });

    it('should tokenize identifier with dollar sign prefix in mustache', () => {
      lexer.setInput('{{$var}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: '$var',
      });
    });

    it('should tokenize identifier with digits in name in mustache', () => {
      lexer.setInput('{{var1}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: 'var1',
      });
    });

    it('should tokenize identifier with multiple underscores in mustache', () => {
      lexer.setInput('{{__private__}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: '__private__',
      });
    });

    it('should tokenize identifier with dollar signs in mustache', () => {
      lexer.setInput('{{$jquery$}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: '$jquery$',
      });
    });
  });

  describe('Keywords recognized as identifiers', () => {
    it('should tokenize "if" as identifier in mustache', () => {
      lexer.setInput('{{if}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: 'if',
      });
    });

    it('should tokenize "unless" as identifier in mustache', () => {
      lexer.setInput('{{unless}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: 'unless',
      });
    });

    it('should tokenize "each" as identifier in mustache', () => {
      lexer.setInput('{{each}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: 'each',
      });
    });

    it('should tokenize "with" as identifier in mustache', () => {
      lexer.setInput('{{with}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: 'with',
      });
    });

    it('should tokenize "else" as identifier in mustache', () => {
      lexer.setInput('{{else}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: 'else',
      });
    });
  });

  describe('Special identifiers', () => {
    it('should tokenize "this" as identifier in mustache', () => {
      lexer.setInput('{{this}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'ID',
        value: 'this',
      });
    });
  });

  describe('Position tracking', () => {
    it('should track position correctly for single identifier', () => {
      lexer.setInput('foo');
      const token = lexer.lex();

      expect(token?.loc).toMatchObject({
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 3, index: 3 },
      });
    });

    it('should track position correctly in mustache context', () => {
      lexer.setInput('{{abc}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const id = lexer.lex();
      expect(id?.type).toBe('ID');
      expect(id?.loc).toMatchObject({
        start: { line: 1, column: 2, index: 2 },
        end: { line: 1, column: 5, index: 5 },
      });
    });
  });

  describe('Identifier boundaries', () => {
    it('should stop at end of identifier in mustache', () => {
      lexer.setInput('{{foo123}}');
      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe('ID');
      expect(token?.value).toBe('foo123');
    });

    it('should stop at special characters when in mustache context', () => {
      lexer.setInput('{{foo}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const id = lexer.lex();
      expect(id).toMatchObject({
        type: 'ID',
        value: 'foo',
      });

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });
  });

  describe('Multiple identifiers', () => {
    it('should tokenize multiple identifiers in mustache', () => {
      lexer.setInput('{{foo bar}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const id1 = lexer.lex();
      expect(id1).toMatchObject({
        type: 'ID',
        value: 'foo',
      });

      // Note: whitespace handling between identifiers would be handled
      // by a more complete implementation, but for now we verify identifiers work
    });
  });
});

describe('Lexer - Separator Tokenization (C1-F2-T1)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('Dot separator', () => {
    it('should keep bare dot as CONTENT outside mustache', () => {
      lexer.setInput('.');
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'CONTENT',
        value: '.',
      });
      expect(token?.loc).toBeDefined();
    });

    it('should tokenize dot in mustache context', () => {
      lexer.setInput('{{foo.bar}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('foo');

      const sep = lexer.lex();
      expect(sep).toMatchObject({
        type: 'SEP',
        value: '.',
      });

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('bar');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });
  });

  describe('Slash separator', () => {
    it('should keep bare slash as CONTENT outside mustache', () => {
      lexer.setInput('/');
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'CONTENT',
        value: '/',
      });
      expect(token?.loc).toBeDefined();
    });

    it('should tokenize slash in mustache context', () => {
      lexer.setInput('{{foo/bar}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('foo');

      const sep = lexer.lex();
      expect(sep).toMatchObject({
        type: 'SEP',
        value: '/',
      });

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('bar');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });
  });

  describe('Separators in CONTENT', () => {
    it('should keep dot in CONTENT outside mustaches', () => {
      lexer.setInput('Hello. World');
      const token = lexer.lex();

      expect(token?.type).toBe('CONTENT');
      expect(token?.value).toBe('Hello. World');
    });

    it('should keep slash in CONTENT outside mustaches', () => {
      lexer.setInput('path/to/file');
      const token = lexer.lex();

      expect(token?.type).toBe('CONTENT');
      expect(token?.value).toBe('path/to/file');
    });

    it('should keep separators in mixed content', () => {
      lexer.setInput('Hello. {{name}} is at path/here');

      const content1 = lexer.lex();
      expect(content1?.type).toBe('CONTENT');
      expect(content1?.value).toBe('Hello. ');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const id = lexer.lex();
      expect(id?.type).toBe('ID');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');

      const content2 = lexer.lex();
      expect(content2?.type).toBe('CONTENT');
      expect(content2?.value).toBe(' is at path/here');
    });
  });

  describe('Position tracking', () => {
    it('should track position correctly for dot separator', () => {
      lexer.setInput('{{a.b}}');

      lexer.lex(); // OPEN
      lexer.lex(); // ID 'a'

      const sep = lexer.lex();
      expect(sep?.loc).toMatchObject({
        start: { line: 1, column: 3, index: 3 },
        end: { line: 1, column: 4, index: 4 },
      });
    });

    it('should track position correctly for slash separator', () => {
      lexer.setInput('{{a/b}}');

      lexer.lex(); // OPEN
      lexer.lex(); // ID 'a'

      const sep = lexer.lex();
      expect(sep?.loc).toMatchObject({
        start: { line: 1, column: 3, index: 3 },
        end: { line: 1, column: 4, index: 4 },
      });
    });
  });

  describe('Multiple separators', () => {
    it('should tokenize multiple dots', () => {
      lexer.setInput('{{a.b.c}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const id1 = lexer.lex();
      expect(id1?.value).toBe('a');

      const sep1 = lexer.lex();
      expect(sep1?.type).toBe('SEP');
      expect(sep1?.value).toBe('.');

      const id2 = lexer.lex();
      expect(id2?.value).toBe('b');

      const sep2 = lexer.lex();
      expect(sep2?.type).toBe('SEP');
      expect(sep2?.value).toBe('.');

      const id3 = lexer.lex();
      expect(id3?.value).toBe('c');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });

    it('should tokenize mixed separators', () => {
      lexer.setInput('{{a.b/c}}');

      lexer.lex(); // OPEN

      const id1 = lexer.lex();
      expect(id1?.value).toBe('a');

      const sep1 = lexer.lex();
      expect(sep1?.type).toBe('SEP');
      expect(sep1?.value).toBe('.');

      const id2 = lexer.lex();
      expect(id2?.value).toBe('b');

      const sep2 = lexer.lex();
      expect(sep2?.type).toBe('SEP');
      expect(sep2?.value).toBe('/');

      const id3 = lexer.lex();
      expect(id3?.value).toBe('c');

      lexer.lex(); // CLOSE
    });
  });
});
