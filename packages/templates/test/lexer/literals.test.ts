import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - Literal Tokenization (C1-F1-T8)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  describe('String Literals', () => {
    it('should tokenize "hello" as STRING', () => {
      lexer.setInput('"hello"');

      const token = lexer.lex();

      expect(token).not.toBeNull();
      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('hello');
    });

    it('should tokenize single-quoted string', () => {
      lexer.setInput("'hello'");

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('hello');
    });

    it('should handle escaped quote: "say \\"hi\\""', () => {
      lexer.setInput('"say \\"hi\\""');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('say "hi"');
    });

    it('should handle escaped single quote in single-quoted string', () => {
      lexer.setInput("'don\\'t'");

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe("don't");
    });

    it('should handle escaped backslash: "path\\\\file"', () => {
      lexer.setInput('"path\\\\file"');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('path\\file');
    });

    it('should throw error on unclosed string', () => {
      lexer.setInput('"hello');

      expect(() => lexer.lex()).toThrow(/Unclosed string/);
    });

    it('should handle empty string', () => {
      lexer.setInput('""');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('');
    });

    it('should handle string with spaces', () => {
      lexer.setInput('"hello world"');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('hello world');
    });
  });

  describe('Number Literals', () => {
    it('should tokenize integer: 123', () => {
      lexer.setInput('123');

      const token = lexer.lex();

      expect(token).not.toBeNull();
      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('123');
    });

    it('should tokenize negative integer: -42', () => {
      lexer.setInput('-42');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('-42');
    });

    it('should tokenize decimal: 1.5', () => {
      lexer.setInput('1.5');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('1.5');
    });

    it('should tokenize negative decimal: -0.5', () => {
      lexer.setInput('-0.5');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('-0.5');
    });

    it('should tokenize zero', () => {
      lexer.setInput('0');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('0');
    });

    it('should handle large numbers', () => {
      lexer.setInput('123456789');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('123456789');
    });
  });

  describe('Boolean Literals', () => {
    it('should tokenize true', () => {
      lexer.setInput('true');

      const token = lexer.lex();

      expect(token).not.toBeNull();
      expect(token?.type).toBe(TokenType.BOOLEAN);
      expect(token?.value).toBe('true');
    });

    it('should tokenize false', () => {
      lexer.setInput('false');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.BOOLEAN);
      expect(token?.value).toBe('false');
    });
  });

  describe('Special Values', () => {
    it('should tokenize null', () => {
      lexer.setInput('null');

      const token = lexer.lex();

      expect(token).not.toBeNull();
      expect(token?.type).toBe(TokenType.NULL);
      expect(token?.value).toBe('null');
    });

    it('should tokenize undefined', () => {
      lexer.setInput('undefined');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.UNDEFINED);
      expect(token?.value).toBe('undefined');
    });
  });

  describe('Literals in Context', () => {
    it('should handle string literal at start of input', () => {
      lexer.setInput('"bar"');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.STRING);
      expect(token?.value).toBe('bar');
    });

    it('should handle number literal at start of input', () => {
      lexer.setInput('123');

      const token = lexer.lex();

      expect(token?.type).toBe(TokenType.NUMBER);
      expect(token?.value).toBe('123');
    });

    it('should handle boolean literal at start of input', () => {
      lexer.setInput('true');

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
