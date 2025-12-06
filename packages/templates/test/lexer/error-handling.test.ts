import { describe, expect, test } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { LexerError } from '../../src/lexer/lexer-error';

describe('Lexer Error Handling', () => {
  describe('Unclosed Comments', () => {
    test('throws LexerError for unclosed standard comment', () => {
      const lexer = new Lexer();
      lexer.setInput('{{! This comment is not closed');

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).toThrow(LexerError);
    });

    test('includes position information for unclosed comment', () => {
      const lexer = new Lexer();
      lexer.setInput('{{! This comment is not closed');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.line).toBe(1);
        expect(lexerError.column).toBe(0); // 0-indexed
        expect(lexerError.index).toBe(0);
      }
    });

    test('includes helpful message for unclosed comment', () => {
      const lexer = new Lexer();
      lexer.setInput('{{! This comment is not closed');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.message).toContain('Unclosed comment');
        expect(lexerError.message).toContain('}}');
        expect(lexerError.message).toContain('line 1');
        expect(lexerError.message).toContain('column 1'); // Message shows 1-indexed
      }
    });

    test('throws LexerError for unclosed block comment', () => {
      const lexer = new Lexer();
      lexer.setInput('{{!-- This block comment is not closed');

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).toThrow(LexerError);
    });

    test('includes correct position for unclosed block comment', () => {
      const lexer = new Lexer();
      lexer.setInput('{{!-- This block comment is not closed');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.line).toBe(1);
        expect(lexerError.column).toBe(0); // 0-indexed
        expect(lexerError.index).toBe(0);
      }
    });

    test('includes helpful message for unclosed block comment', () => {
      const lexer = new Lexer();
      lexer.setInput('{{!-- This block comment is not closed');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.message).toContain('Unclosed comment');
        expect(lexerError.message).toContain('--}}');
        expect(lexerError.message).toContain('line 1');
        expect(lexerError.message).toContain('column 1'); // Message shows 1-indexed
      }
    });

    test('reports correct position for unclosed comment on line 2', () => {
      const lexer = new Lexer();
      lexer.setInput('Some content\n{{! Unclosed comment');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.line).toBe(2);
        expect(lexerError.column).toBe(0); // 0-indexed
        expect(lexerError.index).toBe(13); // After "Some content\n"
      }
    });

    test('reports correct position for unclosed comment with offset', () => {
      const lexer = new Lexer();
      lexer.setInput('{{name}} {{! Unclosed comment');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.line).toBe(1);
        expect(lexerError.column).toBe(9); // 0-indexed, after "{{name}} "
        expect(lexerError.index).toBe(9);
      }
    });
  });

  describe('Unclosed Strings', () => {
    test('throws LexerError for unclosed double-quoted string', () => {
      const lexer = new Lexer();
      lexer.setInput('{{helper "unclosed string}}');

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).toThrow(LexerError);
    });

    test('includes position information for unclosed double-quoted string', () => {
      const lexer = new Lexer();
      lexer.setInput('{{helper "unclosed string}}');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.line).toBe(1);
        expect(lexerError.column).toBe(9); // 0-indexed, at the opening quote
        expect(lexerError.index).toBe(9);
      }
    });

    test('includes helpful message for unclosed double-quoted string', () => {
      const lexer = new Lexer();
      lexer.setInput('{{helper "unclosed string}}');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.message).toContain('Unclosed string');
        expect(lexerError.message).toContain('"');
        expect(lexerError.message).toContain('line 1');
        expect(lexerError.message).toContain('column 10'); // Message shows 1-indexed
      }
    });

    test('throws LexerError for unclosed single-quoted string', () => {
      const lexer = new Lexer();
      lexer.setInput("{{helper 'unclosed string}}");

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).toThrow(LexerError);
    });

    test('includes position information for unclosed single-quoted string', () => {
      const lexer = new Lexer();
      lexer.setInput("{{helper 'unclosed string}}");

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.line).toBe(1);
        expect(lexerError.column).toBe(9); // 0-indexed, at the opening quote
        expect(lexerError.index).toBe(9);
      }
    });

    test('includes helpful message for unclosed single-quoted string', () => {
      const lexer = new Lexer();
      lexer.setInput("{{helper 'unclosed string}}");

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.message).toContain('Unclosed string');
        expect(lexerError.message).toContain("'");
        expect(lexerError.message).toContain('line 1');
        expect(lexerError.message).toContain('column 10'); // Message shows 1-indexed
      }
    });

    test('reports correct position for unclosed string on line 2', () => {
      const lexer = new Lexer();
      lexer.setInput('{{name}}\n{{helper "unclosed}}');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.line).toBe(2);
        expect(lexerError.column).toBe(9); // 0-indexed
        expect(lexerError.index).toBe(18); // After "{{name}}\n{{helper "
      }
    });

    test('reports correct position for unclosed string with escaped quotes', () => {
      const lexer = new Lexer();
      lexer.setInput('{{helper "string with \\" escaped quote}}');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.line).toBe(1);
        expect(lexerError.column).toBe(9); // 0-indexed
        expect(lexerError.index).toBe(9);
      }
    });
  });

  describe('Error Object Properties', () => {
    test('LexerError is instanceof Error', () => {
      const lexer = new Lexer();
      lexer.setInput('{{! unclosed');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(LexerError);
      }
    });

    test('LexerError has correct name property', () => {
      const lexer = new Lexer();
      lexer.setInput('{{! unclosed');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.name).toBe('LexerError');
      }
    });

    test('LexerError has stack trace', () => {
      const lexer = new Lexer();
      lexer.setInput('{{! unclosed');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;
        expect(lexerError.stack).toBeDefined();
        expect(lexerError.stack).toContain('LexerError');
      }
    });

    test('LexerError position properties are defined', () => {
      const lexer = new Lexer();
      lexer.setInput('{{! unclosed');

      try {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
        expect.fail('Should have thrown LexerError');
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        const lexerError = error as LexerError;

        // TypeScript 'readonly' prevents modification at compile time
        // At runtime, the properties are just regular properties
        expect(typeof lexerError.line).toBe('number');
        expect(typeof lexerError.column).toBe('number');
        expect(typeof lexerError.index).toBe('number');
      }
    });
  });

  describe('Error Recovery', () => {
    test('lexer stops at first error encountered', () => {
      const lexer = new Lexer();
      // Unclosed comment - lexer will throw when it reaches EOF
      lexer.setInput('{{! unclosed comment');

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).toThrow(LexerError);
    });

    test('error is thrown immediately when detected', () => {
      const lexer = new Lexer();
      lexer.setInput('{{helper "unclosed string}}');

      let tokenCount = 0;
      try {
        while (!lexer.isEOF()) {
          lexer.lex();
          tokenCount++;
        }
      } catch (error) {
        expect(error).toBeInstanceOf(LexerError);
        // Should have gotten some tokens before the error
        expect(tokenCount).toBeGreaterThan(0);
      }
    });
  });

  describe('Valid Templates Do Not Throw', () => {
    test('properly closed comments do not throw', () => {
      const lexer = new Lexer();
      lexer.setInput('{{! This is a closed comment }}');

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).not.toThrow();
    });

    test('properly closed block comments do not throw', () => {
      const lexer = new Lexer();
      lexer.setInput('{{!-- This is a closed block comment --}}');

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).not.toThrow();
    });

    test('properly closed strings do not throw', () => {
      const lexer = new Lexer();
      lexer.setInput('{{helper "closed string"}}');

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).not.toThrow();
    });

    test('strings with escaped quotes do not throw when properly closed', () => {
      const lexer = new Lexer();
      lexer.setInput('{{helper "string with \\" escaped \\" quotes"}}');

      expect(() => {
        while (!lexer.isEOF()) {
          lexer.lex();
        }
      }).not.toThrow();
    });
  });
});
