import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - EOF Token (C1-F4-T1)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('EOF token generation', () => {
    it('should return EOF token for empty input', () => {
      lexer.setInput('');

      const token = lexer.lex();
      expect(token).toMatchObject({
        type: TokenType.EOF,
        value: '',
      });
      expect(token.loc).toBeDefined();
      expect(token.loc.start).toEqual({ line: 1, column: 0, index: 0 });
      expect(token.loc.end).toEqual({ line: 1, column: 0, index: 0 });
    });

    it('should return EOF token after consuming all content', () => {
      lexer.setInput('Hello World');

      const content = lexer.lex();
      expect(content.type).toBe(TokenType.CONTENT);

      const eof = lexer.lex();
      expect(eof).toMatchObject({
        type: TokenType.EOF,
        value: '',
      });
    });

    it('should return EOF token after consuming mustache', () => {
      lexer.setInput('{{foo}}');

      lexer.lex(); // OPEN
      lexer.lex(); // ID
      lexer.lex(); // CLOSE

      const eof = lexer.lex();
      expect(eof).toMatchObject({
        type: TokenType.EOF,
        value: '',
      });
    });

    it('should return EOF token after mixed content and mustaches', () => {
      lexer.setInput('Hello {{name}}!');

      lexer.lex(); // CONTENT: "Hello "
      lexer.lex(); // OPEN
      lexer.lex(); // ID
      lexer.lex(); // CLOSE
      lexer.lex(); // CONTENT: "!"

      const eof = lexer.lex();
      expect(eof).toMatchObject({
        type: TokenType.EOF,
        value: '',
      });
    });

    it('should return same EOF token on subsequent calls', () => {
      lexer.setInput('test');

      lexer.lex(); // CONTENT

      const eof1 = lexer.lex();
      const eof2 = lexer.lex();
      const eof3 = lexer.lex();

      expect(eof1.type).toBe(TokenType.EOF);
      expect(eof2.type).toBe(TokenType.EOF);
      expect(eof3.type).toBe(TokenType.EOF);
    });
  });

  describe('EOF position tracking', () => {
    it('should track EOF position correctly for single-line input', () => {
      lexer.setInput('abc');

      lexer.lex(); // CONTENT

      const eof = lexer.lex();
      expect(eof.loc.start).toEqual({ line: 1, column: 3, index: 3 });
      expect(eof.loc.end).toEqual({ line: 1, column: 3, index: 3 });
    });

    it('should track EOF position correctly for multi-line input', () => {
      lexer.setInput('line1\nline2');

      lexer.lex(); // CONTENT

      const eof = lexer.lex();
      expect(eof.loc.start.line).toBe(2);
      expect(eof.loc.start.column).toBe(5);
    });

    it('should track EOF position correctly after mustaches', () => {
      lexer.setInput('{{x}}');

      lexer.lex(); // OPEN
      lexer.lex(); // ID
      lexer.lex(); // CLOSE

      const eof = lexer.lex();
      expect(eof.loc.start).toEqual({ line: 1, column: 5, index: 5 });
    });
  });
});
