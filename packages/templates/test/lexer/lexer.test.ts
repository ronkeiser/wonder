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
