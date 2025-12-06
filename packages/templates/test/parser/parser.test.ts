import { describe, expect, test } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';
import { Parser } from '../../src/parser/parser';

describe('Parser', () => {
  describe('constructor', () => {
    test('can instantiate parser with lexer', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser).toBeInstanceOf(Parser);
    });

    test('throws error if lexer is not provided', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid input
        new Parser(null);
      }).toThrow('Parser requires a lexer instance');

      expect(() => {
        // @ts-expect-error - Testing invalid input
        new Parser(undefined);
      }).toThrow('Parser requires a lexer instance');
    });

    test('maintains lexer reference', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser.getLexer()).toBe(lexer);
    });
  });

  describe('initial state', () => {
    test('current token is null initially', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser.getCurrentToken()).toBeNull();
    });

    test('position is 0 initially', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser.getPosition()).toBe(0);
    });

    test('lexer is accessible after construction', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      const retrievedLexer = parser.getLexer();
      expect(retrievedLexer).toBe(lexer);

      // Verify lexer still works
      const tokens = retrievedLexer.tokenize('Hello {{name}}');
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe('setInput', () => {
    test('initializes tokens and sets first token as current', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');

      expect(parser.getCurrentToken()).not.toBeNull();
      expect(parser.getCurrentToken()?.type).toBe(TokenType.CONTENT);
      expect(parser.getPosition()).toBe(0);
    });

    test('handles empty input', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('');

      expect(parser.getCurrentToken()).not.toBeNull();
      expect(parser.getCurrentToken()?.type).toBe(TokenType.EOF);
    });
  });

  describe('advance', () => {
    test('moves to next token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello {{name}}');
      const firstToken = parser.getCurrentToken();

      parser.advance();
      const secondToken = parser.getCurrentToken();

      expect(secondToken).not.toBe(firstToken);
      expect(parser.getPosition()).toBe(1);
    });

    test('returns new current token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{x}}');
      parser.advance(); // Move past OPEN

      const result = parser.advance();
      expect(result).toBe(parser.getCurrentToken());
    });

    test('returns null at end of stream', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('x');
      // Advance to EOF
      while (parser.getCurrentToken()?.type !== TokenType.EOF) {
        parser.advance();
      }

      const result = parser.advance();
      expect(result).toBeNull();
    });
  });

  describe('peek', () => {
    test('looks ahead without consuming token', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello {{name}}');
      const current = parser.getCurrentToken();
      const next = parser.peek();

      expect(parser.getCurrentToken()).toBe(current);
      expect(parser.getPosition()).toBe(0);
      expect(next).not.toBeNull();
      expect(next).not.toBe(current);
    });

    test('works with custom offsets', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('{{x}}');
      const current = parser.getCurrentToken();
      const peek2 = parser.peek(2);

      expect(parser.getCurrentToken()).toBe(current);
      expect(peek2).not.toBeNull();
      expect(peek2).not.toBe(current);
    });

    test('returns null for out of bounds offset', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('x');
      const result = parser.peek(100);

      expect(result).toBeNull();
    });
  });

  describe('match', () => {
    test('returns true for matching token type', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');
      expect(parser.match(TokenType.CONTENT)).toBe(true);
    });

    test('returns false for non-matching token type', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');
      expect(parser.match(TokenType.OPEN)).toBe(false);
    });

    test('returns false when current token is null', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(parser.match(TokenType.CONTENT)).toBe(false);
    });
  });

  describe('expect', () => {
    test('returns token for matching type', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');
      const token = parser.expect(TokenType.CONTENT);

      expect(token).toBe(parser.getCurrentToken());
      expect(token.type).toBe(TokenType.CONTENT);
    });

    test('throws error for non-matching type', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');

      expect(() => {
        parser.expect(TokenType.OPEN);
      }).toThrow('Expected token of type OPEN');
    });

    test('throws error when current token is null', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      expect(() => {
        parser.expect(TokenType.CONTENT);
      }).toThrow('but reached end of input');
    });

    test('uses custom error message', () => {
      const lexer = new Lexer();
      const parser = new Parser(lexer);

      parser.setInput('Hello');

      expect(() => {
        parser.expect(TokenType.OPEN, 'Custom error message');
      }).toThrow('Custom error message');
    });
  });
});
