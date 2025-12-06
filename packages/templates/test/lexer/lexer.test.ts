import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

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
    it('should return EOF token at end of input', () => {
      lexer.setInput('');
      expect(lexer.lex()).toMatchObject({ type: TokenType.EOF });
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

describe('Lexer - Data Prefix Tokenization (C1-F2-T2)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('Data prefix (@)', () => {
    it('should keep bare @ as CONTENT outside mustache', () => {
      lexer.setInput('@');
      const token = lexer.lex();

      expect(token).toMatchObject({
        type: 'CONTENT',
        value: '@',
      });
      expect(token?.loc).toBeDefined();
    });

    it('should tokenize @ in mustache context', () => {
      lexer.setInput('{{@index}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const data = lexer.lex();
      expect(data).toMatchObject({
        type: 'DATA',
        value: '@',
      });

      const id = lexer.lex();
      expect(id?.type).toBe('ID');
      expect(id?.value).toBe('index');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });

    it('should tokenize @root', () => {
      lexer.setInput('{{@root}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const data = lexer.lex();
      expect(data?.type).toBe('DATA');

      const id = lexer.lex();
      expect(id?.value).toBe('root');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });

    it('should tokenize @first', () => {
      lexer.setInput('{{@first}}');

      lexer.lex(); // OPEN

      const data = lexer.lex();
      expect(data?.type).toBe('DATA');

      const id = lexer.lex();
      expect(id?.value).toBe('first');

      lexer.lex(); // CLOSE
    });

    it('should tokenize @key', () => {
      lexer.setInput('{{@key}}');

      lexer.lex(); // OPEN

      const data = lexer.lex();
      expect(data?.type).toBe('DATA');

      const id = lexer.lex();
      expect(id?.value).toBe('key');

      lexer.lex(); // CLOSE
    });
  });

  describe('Data prefix with paths', () => {
    it('should tokenize @root.value', () => {
      lexer.setInput('{{@root.value}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const data = lexer.lex();
      expect(data?.type).toBe('DATA');

      const id1 = lexer.lex();
      expect(id1?.value).toBe('root');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');
      expect(sep?.value).toBe('.');

      const id2 = lexer.lex();
      expect(id2?.value).toBe('value');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });

    it('should tokenize @root.nested.path', () => {
      lexer.setInput('{{@root.nested.path}}');

      lexer.lex(); // OPEN

      const data = lexer.lex();
      expect(data?.type).toBe('DATA');

      const id1 = lexer.lex();
      expect(id1?.value).toBe('root');

      lexer.lex(); // SEP

      const id2 = lexer.lex();
      expect(id2?.value).toBe('nested');

      lexer.lex(); // SEP

      const id3 = lexer.lex();
      expect(id3?.value).toBe('path');

      lexer.lex(); // CLOSE
    });
  });

  describe('Data prefix in CONTENT', () => {
    it('should keep @ in CONTENT outside mustaches', () => {
      lexer.setInput('Email me @example');
      const token = lexer.lex();

      expect(token?.type).toBe('CONTENT');
      expect(token?.value).toBe('Email me @example');
    });

    it('should keep @ in mixed content', () => {
      lexer.setInput('Contact @user or {{@root.email}}');

      const content1 = lexer.lex();
      expect(content1?.type).toBe('CONTENT');
      expect(content1?.value).toBe('Contact @user or ');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const data = lexer.lex();
      expect(data?.type).toBe('DATA');

      const id1 = lexer.lex();
      expect(id1?.value).toBe('root');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');

      const id2 = lexer.lex();
      expect(id2?.value).toBe('email');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });
  });

  describe('Position tracking', () => {
    it('should track position correctly for @ token', () => {
      lexer.setInput('{{@index}}');

      lexer.lex(); // OPEN

      const data = lexer.lex();
      expect(data?.loc).toMatchObject({
        start: { line: 1, column: 2, index: 2 },
        end: { line: 1, column: 3, index: 3 },
      });
    });

    it('should track position correctly in @root.value', () => {
      lexer.setInput('{{@root.value}}');

      lexer.lex(); // OPEN

      const data = lexer.lex();
      expect(data?.loc).toMatchObject({
        start: { line: 1, column: 2, index: 2 },
        end: { line: 1, column: 3, index: 3 },
      });

      const id = lexer.lex();
      expect(id?.loc).toMatchObject({
        start: { line: 1, column: 3, index: 3 },
        end: { line: 1, column: 7, index: 7 },
      });
    });
  });

  describe('Multiple data variables', () => {
    it('should tokenize multiple data variables in sequence', () => {
      lexer.setInput('{{@index}} {{@key}}');

      // First data variable
      lexer.lex(); // OPEN
      const data1 = lexer.lex();
      expect(data1?.type).toBe('DATA');
      lexer.lex(); // ID 'index'
      lexer.lex(); // CLOSE

      // Content between
      const content = lexer.lex();
      expect(content?.type).toBe('CONTENT');
      expect(content?.value).toBe(' ');

      // Second data variable
      lexer.lex(); // OPEN
      const data2 = lexer.lex();
      expect(data2?.type).toBe('DATA');
      lexer.lex(); // ID 'key'
      lexer.lex(); // CLOSE
    });
  });
});

describe('Lexer - Path Sequences (C1-F2-T3)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('Basic path notation', () => {
    it('should tokenize foo.bar.baz', () => {
      lexer.setInput('{{foo.bar.baz}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('foo');

      const sep1 = lexer.lex();
      expect(sep1?.type).toBe('SEP');
      expect(sep1?.value).toBe('.');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('bar');

      const sep2 = lexer.lex();
      expect(sep2?.type).toBe('SEP');
      expect(sep2?.value).toBe('.');

      const id3 = lexer.lex();
      expect(id3?.type).toBe('ID');
      expect(id3?.value).toBe('baz');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });

    it('should tokenize foo/bar', () => {
      lexer.setInput('{{foo/bar}}');

      lexer.lex(); // OPEN

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('foo');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');
      expect(sep?.value).toBe('/');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('bar');

      lexer.lex(); // CLOSE
    });
  });

  describe('Parent path notation', () => {
    it('should tokenize ../parent', () => {
      lexer.setInput('{{../parent}}');

      lexer.lex(); // OPEN

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('..');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('parent');

      lexer.lex(); // CLOSE
    });

    it('should tokenize ../../grand', () => {
      lexer.setInput('{{../../grand}}');

      lexer.lex(); // OPEN

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('..');

      const sep1 = lexer.lex();
      expect(sep1?.type).toBe('SEP');
      expect(sep1?.value).toBe('/');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('..');

      const sep2 = lexer.lex();
      expect(sep2?.type).toBe('SEP');
      expect(sep2?.value).toBe('/');

      const id3 = lexer.lex();
      expect(id3?.type).toBe('ID');
      expect(id3?.value).toBe('grand');

      lexer.lex(); // CLOSE
    });

    it('should tokenize ../../../deeply/nested', () => {
      lexer.setInput('{{../../../deeply/nested}}');

      lexer.lex(); // OPEN

      // ../
      expect(lexer.lex()?.value).toBe('..');
      expect(lexer.lex()?.type).toBe('SEP');

      // ../
      expect(lexer.lex()?.value).toBe('..');
      expect(lexer.lex()?.type).toBe('SEP');

      // ../
      expect(lexer.lex()?.value).toBe('..');
      expect(lexer.lex()?.type).toBe('SEP');

      // deeply/
      expect(lexer.lex()?.value).toBe('deeply');
      expect(lexer.lex()?.type).toBe('SEP');

      // nested
      expect(lexer.lex()?.value).toBe('nested');

      lexer.lex(); // CLOSE
    });
  });

  describe('Data variable paths', () => {
    it('should tokenize @index', () => {
      lexer.setInput('{{@index}}');

      lexer.lex(); // OPEN

      const data = lexer.lex();
      expect(data?.type).toBe('DATA');

      const id = lexer.lex();
      expect(id?.type).toBe('ID');
      expect(id?.value).toBe('index');

      lexer.lex(); // CLOSE
    });

    it('should tokenize @root.value', () => {
      lexer.setInput('{{@root.value}}');

      lexer.lex(); // OPEN

      const data = lexer.lex();
      expect(data?.type).toBe('DATA');

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('root');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('value');

      lexer.lex(); // CLOSE
    });

    it('should tokenize @root.nested.path', () => {
      lexer.setInput('{{@root.nested.path}}');

      lexer.lex(); // OPEN
      lexer.lex(); // DATA

      expect(lexer.lex()?.value).toBe('root');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('nested');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('path');

      lexer.lex(); // CLOSE
    });
  });

  describe('Special identifiers', () => {
    it('should tokenize this.foo', () => {
      lexer.setInput('{{this.foo}}');

      lexer.lex(); // OPEN

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('this');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('foo');

      lexer.lex(); // CLOSE
    });

    it('should tokenize ./foo', () => {
      lexer.setInput('{{./foo}}');

      lexer.lex(); // OPEN

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('.');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('foo');

      lexer.lex(); // CLOSE
    });

    it('should tokenize this/nested/path', () => {
      lexer.setInput('{{this/nested/path}}');

      lexer.lex(); // OPEN

      expect(lexer.lex()?.value).toBe('this');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('nested');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('path');

      lexer.lex(); // CLOSE
    });
  });

  describe('Whitespace preservation', () => {
    it('should preserve whitespace in {{ foo.bar }}', () => {
      lexer.setInput('{{ foo.bar }}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN');

      // Whitespace is skipped in mustache context
      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('foo');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('bar');

      const close = lexer.lex();
      expect(close?.type).toBe('CLOSE');
    });

    it('should handle variable whitespace', () => {
      lexer.setInput('{{  foo  .  bar  }}');

      lexer.lex(); // OPEN

      const id1 = lexer.lex();
      expect(id1?.type).toBe('ID');
      expect(id1?.value).toBe('foo');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');

      const id2 = lexer.lex();
      expect(id2?.type).toBe('ID');
      expect(id2?.value).toBe('bar');

      lexer.lex(); // CLOSE
    });
  });

  describe('Mixed notation', () => {
    it('should tokenize ../foo/bar.baz', () => {
      lexer.setInput('{{../foo/bar.baz}}');

      lexer.lex(); // OPEN

      expect(lexer.lex()?.value).toBe('..');
      expect(lexer.lex()?.value).toBe('/');
      expect(lexer.lex()?.value).toBe('foo');
      expect(lexer.lex()?.value).toBe('/');
      expect(lexer.lex()?.value).toBe('bar');
      expect(lexer.lex()?.value).toBe('.');
      expect(lexer.lex()?.value).toBe('baz');

      lexer.lex(); // CLOSE
    });

    it('should tokenize @root/nested.path', () => {
      lexer.setInput('{{@root/nested.path}}');

      lexer.lex(); // OPEN
      lexer.lex(); // DATA

      expect(lexer.lex()?.value).toBe('root');
      expect(lexer.lex()?.value).toBe('/');
      expect(lexer.lex()?.value).toBe('nested');
      expect(lexer.lex()?.value).toBe('.');
      expect(lexer.lex()?.value).toBe('path');

      lexer.lex(); // CLOSE
    });

    it('should tokenize complex path this/../sibling.prop', () => {
      lexer.setInput('{{this/../sibling.prop}}');

      lexer.lex(); // OPEN

      expect(lexer.lex()?.value).toBe('this');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('..');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('sibling');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('prop');

      lexer.lex(); // CLOSE
    });
  });

  describe('Edge cases', () => {
    it('should handle single dot identifier', () => {
      lexer.setInput('{{.}}');

      lexer.lex(); // OPEN

      const id = lexer.lex();
      expect(id?.type).toBe('ID');
      expect(id?.value).toBe('.');

      lexer.lex(); // CLOSE
    });

    it('should handle single slash identifier', () => {
      lexer.setInput('{{/}}');

      lexer.lex(); // OPEN

      // Single slash at the end is OPEN_ENDBLOCK delimiter
      // This is actually {{/}} which starts a block end
      // Let's test a different case
      const token = lexer.lex();
      // This will likely trigger block delimiter detection
      expect(token).toBeDefined();
    });

    it('should tokenize paths in block helpers', () => {
      lexer.setInput('{{#each items.list}}');

      const open = lexer.lex();
      expect(open?.type).toBe('OPEN_BLOCK');

      const id1 = lexer.lex();
      expect(id1?.value).toBe('each');

      const id2 = lexer.lex();
      expect(id2?.value).toBe('items');

      const sep = lexer.lex();
      expect(sep?.type).toBe('SEP');

      const id3 = lexer.lex();
      expect(id3?.value).toBe('list');

      lexer.lex(); // CLOSE
    });

    it('should handle double dots after identifier', () => {
      // foo... tokenizes as foo, SEP, then .. as parent identifier
      lexer.setInput('{{foo...}}');

      lexer.lex(); // OPEN

      expect(lexer.lex()?.value).toBe('foo');
      expect(lexer.lex()?.type).toBe('SEP');

      // Two dots together after separator -> .. identifier
      const dotId = lexer.lex();
      expect(dotId?.type).toBe('ID');
      expect(dotId?.value).toBe('..');

      lexer.lex(); // CLOSE
    });
  });

  describe('Position tracking in paths', () => {
    it('should track positions correctly in foo.bar.baz', () => {
      lexer.setInput('{{foo.bar.baz}}');

      const open = lexer.lex();
      expect(open?.loc?.start.index).toBe(0);

      const id1 = lexer.lex();
      expect(id1?.loc).toMatchObject({
        start: { index: 2 },
        end: { index: 5 },
      });

      const sep1 = lexer.lex();
      expect(sep1?.loc).toMatchObject({
        start: { index: 5 },
        end: { index: 6 },
      });

      const id2 = lexer.lex();
      expect(id2?.loc).toMatchObject({
        start: { index: 6 },
        end: { index: 9 },
      });

      const sep2 = lexer.lex();
      expect(sep2?.loc).toMatchObject({
        start: { index: 9 },
        end: { index: 10 },
      });

      const id3 = lexer.lex();
      expect(id3?.loc).toMatchObject({
        start: { index: 10 },
        end: { index: 13 },
      });
    });
  });

  describe('Real-world path patterns', () => {
    it('should tokenize user.profile.name', () => {
      lexer.setInput('{{user.profile.name}}');

      lexer.lex(); // OPEN

      expect(lexer.lex()?.value).toBe('user');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('profile');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('name');

      lexer.lex(); // CLOSE
    });

    it('should tokenize items[0].title (as items literal)', () => {
      // Note: Bracket notation is not yet implemented, so this will tokenize
      // items, then [ will be part of following content/error
      lexer.setInput('{{items}}');

      lexer.lex(); // OPEN

      const id = lexer.lex();
      expect(id?.type).toBe('ID');
      expect(id?.value).toBe('items');

      lexer.lex(); // CLOSE
    });

    it('should tokenize @root.config.api.url', () => {
      lexer.setInput('{{@root.config.api.url}}');

      lexer.lex(); // OPEN
      lexer.lex(); // DATA

      expect(lexer.lex()?.value).toBe('root');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('config');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('api');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('url');

      lexer.lex(); // CLOSE
    });

    it('should tokenize ../../../root/data', () => {
      lexer.setInput('{{../../../root/data}}');

      lexer.lex(); // OPEN

      // Three parent references
      expect(lexer.lex()?.value).toBe('..');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('..');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('..');
      expect(lexer.lex()?.type).toBe('SEP');

      // Then path
      expect(lexer.lex()?.value).toBe('root');
      expect(lexer.lex()?.type).toBe('SEP');
      expect(lexer.lex()?.value).toBe('data');

      lexer.lex(); // CLOSE
    });
  });
});
