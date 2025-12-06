import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - Delimiter Tokenization (C1-F1-T5)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  it('should tokenize {{ as OPEN', () => {
    lexer.setInput('{{');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.OPEN);
    expect(token?.value).toBe('{{');
    expect(token?.loc?.start.column).toBe(0);
    expect(token?.loc?.end.column).toBe(2);
  });

  it('should tokenize }} as CLOSE', () => {
    lexer.setInput('}}');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.CLOSE);
    expect(token?.value).toBe('}}');
  });

  it('should tokenize {{{ as OPEN_UNESCAPED (not OPEN)', () => {
    lexer.setInput('{{{');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.OPEN_UNESCAPED);
    expect(token?.value).toBe('{{{');
    expect(token?.type).not.toBe(TokenType.OPEN);
  });

  it('should tokenize }}} as CLOSE_UNESCAPED (not CLOSE)', () => {
    lexer.setInput('}}}');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.CLOSE_UNESCAPED);
    expect(token?.value).toBe('}}}');
    expect(token?.type).not.toBe(TokenType.CLOSE);
  });

  it('should track position accurately for delimiters', () => {
    lexer.setInput('  {{');

    // First token is content "  "
    const content = lexer.lex();
    expect(content?.type).toBe(TokenType.CONTENT);

    // Second token is OPEN at position 2
    const open = lexer.lex();
    expect(open?.type).toBe(TokenType.OPEN);
    expect(open?.loc?.start.column).toBe(2);
    expect(open?.loc?.end.column).toBe(4);
  });

  it('should handle sequence of delimiters', () => {
    lexer.setInput('{{}}');

    const token1 = lexer.lex();
    expect(token1?.type).toBe(TokenType.OPEN);
    expect(token1?.value).toBe('{{');

    const token2 = lexer.lex();
    expect(token2?.type).toBe(TokenType.CLOSE);
    expect(token2?.value).toBe('}}');
  });

  it('should prioritize triple braces over double braces', () => {
    lexer.setInput('{{{foo}}}');

    const token1 = lexer.lex();
    expect(token1?.type).toBe(TokenType.OPEN_UNESCAPED);
    expect(token1?.value).toBe('{{{');

    // Skip content
    lexer.lex();

    const token3 = lexer.lex();
    expect(token3?.type).toBe(TokenType.CLOSE_UNESCAPED);
    expect(token3?.value).toBe('}}}');
  });

  it('should handle four braces as triple + single', () => {
    lexer.setInput('{{{{');

    const token1 = lexer.lex();
    expect(token1?.type).toBe(TokenType.OPEN_UNESCAPED);
    expect(token1?.value).toBe('{{{');

    const token2 = lexer.lex();
    expect(token2?.type).toBe(TokenType.CONTENT);
    expect(token2?.value).toBe('{');
  });

  it('should handle mixed content and delimiters', () => {
    lexer.setInput('Hello {{name}}!');

    const tokens = [];
    let token;
    while ((token = lexer.lex()) !== null) {
      tokens.push(token);
    }

    expect(tokens).toHaveLength(5);
    expect(tokens[0].type).toBe(TokenType.CONTENT);
    expect(tokens[0].value).toBe('Hello ');
    expect(tokens[1].type).toBe(TokenType.OPEN);
    expect(tokens[2].type).toBe(TokenType.CONTENT);
    expect(tokens[2].value).toBe('name');
    expect(tokens[3].type).toBe(TokenType.CLOSE);
    expect(tokens[4].type).toBe(TokenType.CONTENT);
    expect(tokens[4].value).toBe('!');
  });

  it('should handle unescaped mustache with content', () => {
    lexer.setInput('{{{html}}}');

    const tokens = [];
    let token;
    while ((token = lexer.lex()) !== null) {
      tokens.push(token);
    }

    expect(tokens).toHaveLength(3);
    expect(tokens[0].type).toBe(TokenType.OPEN_UNESCAPED);
    expect(tokens[1].type).toBe(TokenType.CONTENT);
    expect(tokens[1].value).toBe('html');
    expect(tokens[2].type).toBe(TokenType.CLOSE_UNESCAPED);
  });
});
