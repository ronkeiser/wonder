import { describe, expect, test } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type { Token } from '../../src/lexer/token';
import { TokenType } from '../../src/lexer/token-types';
import { ParserError } from '../../src/parser/parser-error';

describe('ParserError', () => {
  describe('constructor', () => {
    test('creates error with message and position', () => {
      const token: Token = {
        type: TokenType.ID,
        value: 'foo',
        loc: {
          start: { line: 1, column: 5, index: 5 },
          end: { line: 1, column: 8, index: 8 },
        },
      };

      const error = new ParserError('Test error message', token);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ParserError);
      expect(error.name).toBe('ParserError');
      expect(error.message).toContain('Test error message');
      expect(error.message).toContain('line 1');
      expect(error.message).toContain('column 6'); // 1-indexed for display
    });

    test('includes position information', () => {
      const token: Token = {
        type: TokenType.ID,
        value: 'bar',
        loc: {
          start: { line: 3, column: 10, index: 42 },
          end: { line: 3, column: 13, index: 45 },
        },
      };

      const error = new ParserError('Position test', token);

      expect(error.line).toBe(3);
      expect(error.column).toBe(10); // 0-indexed internally
      expect(error.index).toBe(42);
    });

    test('handles null token', () => {
      const error = new ParserError('Error with no token', null);

      expect(error.message).toBe('Error with no token');
      expect(error.line).toBe(0);
      expect(error.column).toBe(0);
      expect(error.index).toBe(0);
      expect(error.context).toBeNull();
    });

    test('includes optional context', () => {
      const token: Token = {
        type: TokenType.ID,
        value: 'test',
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 4, index: 4 },
        },
      };

      const error = new ParserError('Context test', token, 'surrounding code');

      expect(error.context).toBe('surrounding code');
    });

    test('has null context when not provided', () => {
      const token: Token = {
        type: TokenType.ID,
        value: 'test',
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 4, index: 4 },
        },
      };

      const error = new ParserError('No context', token);

      expect(error.context).toBeNull();
    });
  });

  describe('fromToken', () => {
    test('creates error with automatic context from token', () => {
      const token: Token = {
        type: TokenType.ID,
        value: 'identifier',
        loc: {
          start: { line: 2, column: 3, index: 15 },
          end: { line: 2, column: 13, index: 25 },
        },
      };

      const error = ParserError.fromToken('Automatic context', token);

      expect(error.message).toContain('Automatic context');
      expect(error.context).toBe('identifier');
    });

    test('creates error with context from multiple tokens', () => {
      const tokens: Token[] = [
        {
          type: TokenType.OPEN,
          value: '{{',
          loc: {
            start: { line: 1, column: 0, index: 0 },
            end: { line: 1, column: 2, index: 2 },
          },
        },
        {
          type: TokenType.ID,
          value: 'name',
          loc: {
            start: { line: 1, column: 2, index: 2 },
            end: { line: 1, column: 6, index: 6 },
          },
        },
        {
          type: TokenType.CLOSE,
          value: '}}',
          loc: {
            start: { line: 1, column: 6, index: 6 },
            end: { line: 1, column: 8, index: 8 },
          },
        },
      ];

      const error = ParserError.fromToken('Multi token context', tokens[1], tokens);

      expect(error.context).toBe('{{ name }}');
    });

    test('limits context length to 50 characters', () => {
      const longValue = 'a'.repeat(100);
      const token: Token = {
        type: TokenType.STRING,
        value: longValue,
        loc: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 100, index: 100 },
        },
      };

      const error = ParserError.fromToken('Long context', token);

      expect(error.context).toHaveLength(53); // 50 + '...'
      expect(error.context?.endsWith('...')).toBe(true);
    });

    test('handles token without value', () => {
      const token: Token = {
        type: TokenType.EOF,
        value: '',
        loc: {
          start: { line: 1, column: 10, index: 10 },
          end: { line: 1, column: 10, index: 10 },
        },
      };

      const error = ParserError.fromToken('No value token', token);

      expect(error.context).toBeNull();
    });

    test('handles null token', () => {
      const error = ParserError.fromToken('Null token', null);

      expect(error.context).toBeNull();
    });
  });

  describe('integration with Parser', () => {
    test('parser throws ParserError on expect() failure', () => {
      const lexer = new Lexer();
      lexer.setInput('Hello {{name}}');
      const tokens = lexer.tokenize('Hello {{name}}');

      const token = tokens[0];
      const error = new ParserError('Expected different token', token);

      expect(error).toBeInstanceOf(ParserError);
      expect(error.message).toContain('Expected different token');
    });

    test('error includes line and column information', () => {
      const token: Token = {
        type: TokenType.ID,
        value: 'test',
        loc: {
          start: { line: 5, column: 12, index: 100 },
          end: { line: 5, column: 16, index: 104 },
        },
      };

      const error = new ParserError('Syntax error', token);

      expect(error.message).toMatch(/line 5/);
      expect(error.message).toMatch(/column 13/); // 1-indexed
    });
  });
});
