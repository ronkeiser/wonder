import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - Comment Tokenization (C1-F1-T7)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  it('should tokenize {{! comment }} as COMMENT token', () => {
    lexer.setInput('{{! comment }}');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.COMMENT);
    expect(token?.value).toBe(' comment ');
  });

  it('should tokenize {{!-- block comment --}} as COMMENT token', () => {
    lexer.setInput('{{!-- block comment --}}');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.COMMENT);
    expect(token?.value).toBe(' block comment ');
  });

  it('should throw error on unclosed {{! comment', () => {
    lexer.setInput('{{! unclosed comment');

    expect(() => lexer.lex()).toThrow(/Unclosed comment/);
  });

  it('should throw error on unclosed {{!-- comment', () => {
    lexer.setInput('{{!-- unclosed block comment');

    expect(() => lexer.lex()).toThrow(/Unclosed comment/);
  });

  it('should handle nested braces in comment: {{! has }} in it }}', () => {
    lexer.setInput('{{! has }} in it }}');

    const token = lexer.lex();

    // Should consume at first }}
    expect(token?.type).toBe(TokenType.COMMENT);
    expect(token?.value).toBe(' has ');

    // Remaining " in it }}" should be content
    const remaining = lexer.lex();
    expect(remaining?.type).toBe(TokenType.CONTENT);
    expect(remaining?.value).toBe(' in it ');
  });

  it('should handle block comment with }} inside: {{!-- has }} inside --}}', () => {
    lexer.setInput('{{!-- has }} inside --}}');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.COMMENT);
    expect(token?.value).toBe(' has }} inside ');
  });

  it('should track position correctly for comments', () => {
    lexer.setInput('{{! comment }}');

    const token = lexer.lex();

    expect(token?.loc?.start.line).toBe(1);
    expect(token?.loc?.start.column).toBe(0);
    expect(token?.loc?.end.column).toBe(14);
  });

  it('should handle comments with content before and after', () => {
    lexer.setInput('Hello {{! ignore me }}World');

    const tokens = [];
    let token;
    while ((token = lexer.lex()).type !== TokenType.EOF) {
      tokens.push(token);
    }

    expect(tokens).toHaveLength(3);
    expect(tokens[0].type).toBe(TokenType.CONTENT);
    expect(tokens[0].value).toBe('Hello ');
    expect(tokens[1].type).toBe(TokenType.COMMENT);
    expect(tokens[1].value).toBe(' ignore me ');
    expect(tokens[2].type).toBe(TokenType.CONTENT);
    expect(tokens[2].value).toBe('World');
  });

  it('should handle empty comment: {{!}}', () => {
    lexer.setInput('{{!}}');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.COMMENT);
    expect(token?.value).toBe('');
  });

  it('should handle empty block comment: {{!----}}', () => {
    lexer.setInput('{{!----}}');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.COMMENT);
    expect(token?.value).toBe('');
  });

  it('should handle multi-line comments', () => {
    lexer.setInput('{{!\nLine 1\nLine 2\n}}');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.COMMENT);
    expect(token?.value).toBe('\nLine 1\nLine 2\n');
  });

  it('should handle comment in template with variables', () => {
    lexer.setInput('{{foo}}{{! comment }}{{bar}}');

    const tokens = [];
    let token;
    while ((token = lexer.lex()).type !== TokenType.EOF) {
      tokens.push(token);
    }

    // OPEN, CONTENT(foo), CLOSE, COMMENT, OPEN, CONTENT(bar), CLOSE
    expect(tokens).toHaveLength(7);
    expect(tokens[0].type).toBe(TokenType.OPEN);
    expect(tokens[1].value).toBe('foo');
    expect(tokens[3].type).toBe(TokenType.COMMENT);
    expect(tokens[4].type).toBe(TokenType.OPEN);
    expect(tokens[5].value).toBe('bar');
  });

  it('should provide position info in unclosed comment error', () => {
    lexer.setInput('{{! unclosed');

    try {
      lexer.lex();
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/line \d+, column \d+/);
    }
  });
});
