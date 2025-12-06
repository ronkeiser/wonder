import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - CONTENT Tokenization (C1-F1-T4)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  it('should tokenize plain text with no mustaches as single CONTENT token', () => {
    lexer.setInput('Hello World');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.CONTENT);
    expect(token?.value).toBe('Hello World');
    expect(token?.loc).not.toBeNull();
    expect(token?.loc?.start.line).toBe(1);
    expect(token?.loc?.start.column).toBe(0);
    expect(token?.loc?.start.index).toBe(0);
  });

  it('should tokenize text before mustache', () => {
    lexer.setInput('Hello {{name}}');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.CONTENT);
    expect(token?.value).toBe('Hello ');

    // Next token should be at the mustache position
    expect(lexer.peek()).toBe('{');
  });

  it('should update line tracking across multiple newlines in content', () => {
    lexer.setInput('Line 1\nLine 2\nLine 3');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.CONTENT);
    expect(token?.value).toBe('Line 1\nLine 2\nLine 3');
    expect(token?.loc?.start.line).toBe(1);
    expect(token?.loc?.end.line).toBe(3);
  });

  it('should handle empty content between adjacent mustaches gracefully', () => {
    lexer.setInput('{{}}{{}}');

    // First lex() should return OPEN (no content before first {{)
    const token1 = lexer.lex();
    expect(token1?.type).toBe(TokenType.OPEN);
  });
  it('should track position correctly in multi-line content', () => {
    lexer.setInput('First line\nSecond line');

    const token = lexer.lex();

    expect(token?.loc?.start.line).toBe(1);
    expect(token?.loc?.start.column).toBe(0);
    expect(token?.loc?.end.line).toBe(2);
  });

  it('should stop scanning at mustache opening', () => {
    lexer.setInput('text{{mustache');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.CONTENT);
    expect(token?.value).toBe('text');
    expect(lexer.peek()).toBe('{');
  });

  it('should handle text with single brace (not mustache)', () => {
    lexer.setInput('text { more text');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.CONTENT);
    expect(token?.value).toBe('text { more text');
  });

  it('should return null after consuming all content', () => {
    lexer.setInput('Hello');

    const token1 = lexer.lex();
    expect(token1?.value).toBe('Hello');

    const token2 = lexer.lex();
    expect(token2).toBeNull();
  });

  it('should handle content with special characters', () => {
    lexer.setInput('Special: !@#$%^&*()');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.CONTENT);
    expect(token?.value).toBe('Special: !@#$%^&*()');
  });

  it('should handle tabs and spaces in content', () => {
    lexer.setInput('\t  Indented text  \t');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.CONTENT);
    expect(token?.value).toBe('\t  Indented text  \t');
  });
});
