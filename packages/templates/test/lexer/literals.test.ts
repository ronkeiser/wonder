import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - Literal Tokenization (C1-F1-T8)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('String Literals', () => {
    it('should tokenize "hello" as STRING inside mustache', () => {
      lexer.setInput('{{"hello"}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).not.toBeNull();
      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('hello');
    });

    it('should tokenize single-quoted string inside mustache', () => {
      lexer.setInput("{{'hello'}}");

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('hello');
    });

    it('should handle escaped quote: "say \\"hi\\"" inside mustache', () => {
      lexer.setInput('{{"say \\"hi\\""}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('say "hi"');
    });

    it('should handle escaped single quote in single-quoted string inside mustache', () => {
      lexer.setInput("{{'don\\'t'}}");

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe("don't");
    });

    it('should handle escaped backslash: "path\\\\file" inside mustache', () => {
      lexer.setInput('{{"path\\\\file"}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('path\\file');
    });

    it('should throw error on unclosed string inside mustache', () => {
      lexer.setInput('{{"hello');

      lexer.lex(); // OPEN
      expect(() => lexer.lex()).toThrow(/Unclosed string/);
    });

    it('should handle empty string inside mustache', () => {
      lexer.setInput('{{""}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('');
    });

    it('should handle string with spaces inside mustache', () => {
      lexer.setInput('{{"hello world"}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('hello world');
    });
  });

  describe('Number Literals', () => {
    it('should tokenize integer: 123 inside mustache', () => {
      lexer.setInput('{{123}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).not.toBeNull();
      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('123');
    });

    it('should tokenize negative integer: -42 inside mustache', () => {
      lexer.setInput('{{-42}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('-42');
    });

    it('should tokenize decimal: 1.5 inside mustache', () => {
      lexer.setInput('{{1.5}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('1.5');
    });

    it('should tokenize negative decimal: -0.5 inside mustache', () => {
      lexer.setInput('{{-0.5}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('-0.5');
    });

    it('should tokenize zero inside mustache', () => {
      lexer.setInput('{{0}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('0');
    });

    it('should handle large numbers inside mustache', () => {
      lexer.setInput('{{123456789}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('123456789');
    });
  });

  describe('Boolean Literals', () => {
    it('should tokenize true inside mustache', () => {
      lexer.setInput('{{true}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).not.toBeNull();
      expect(token?.type).toBe(TokenType.BOOLEAN);
      expect(token?.value).toBe('true');
    });

    it('should tokenize false inside mustache', () => {
      lexer.setInput('{{false}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.BOOLEAN);
      expect(token?.value).toBe('false');
    });
  });

  describe('Special Values', () => {
    it('should tokenize null inside mustache', () => {
      lexer.setInput('{{null}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token).not.toBeNull();
      expect(token?.type).toBe(TokenType.NULL);
      expect(token?.value).toBe('null');
    });

    it('should tokenize undefined inside mustache', () => {
      lexer.setInput('{{undefined}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.UNDEFINED);
      expect(token?.value).toBe('undefined');
    });
  });

  describe('Literals in Context', () => {
    it('should handle string literal inside mustache', () => {
      lexer.setInput('{{"bar"}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('bar');
    });

    it('should handle number literal inside mustache', () => {
      lexer.setInput('{{123}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('123');
    });

    it('should handle boolean literal inside mustache', () => {
      lexer.setInput('{{true}}');

      lexer.lex(); // OPEN
      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.BOOLEAN);
      expect(token?.value).toBe('true');
    });

    it('should not confuse "trueish" with true', () => {
      lexer.setInput('trueish');

      const token = lexer.lex();

      // Should be CONTENT, not BOOLEAN
      expect(token?.type).toBe(TokenType.CONTENT);
      expect(token?.value).toBe('trueish');
    });
  });
});
