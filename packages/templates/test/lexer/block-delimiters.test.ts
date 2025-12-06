import { beforeEach, describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - Block Delimiter Tokenization (C1-F1-T6)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  it('should tokenize {{# as OPEN_BLOCK', () => {
    lexer.setInput('{{#');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.OPEN_BLOCK);
    expect(token?.value).toBe('{{#');
  });

  it('should tokenize {{/ as OPEN_ENDBLOCK', () => {
    lexer.setInput('{{/');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.OPEN_ENDBLOCK);
    expect(token?.value).toBe('{{/');
  });

  it('should tokenize {{^ as OPEN_INVERSE', () => {
    lexer.setInput('{{^');

    const token = lexer.lex();

    expect(token).not.toBeNull();
    expect(token?.type).toBe(TokenType.OPEN_INVERSE);
    expect(token?.value).toBe('{{^');
  });

  it('should handle {{ # with space as OPEN then ID("#") (not OPEN_BLOCK)', () => {
    lexer.setInput('{{ #');

    const token = lexer.lex();

    // Should be OPEN, not OPEN_BLOCK
    expect(token?.type).toBe(TokenType.OPEN);
    expect(token?.value).toBe('{{');
  });

  it('should track position correctly for block delimiters', () => {
    lexer.setInput('{{#if}}');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.OPEN_BLOCK);
    expect(token?.loc?.start.column).toBe(0);
    expect(token?.loc?.end.column).toBe(3);
  });

  it('should handle complete block structure', () => {
    lexer.setInput('{{#if condition}}content{{/if}}');

    const tokens = [];
    let token;
    while ((token = lexer.lex()) !== null) {
      tokens.push(token);
    }

    // Expected token sequence:
    // 0: OPEN_BLOCK ({{#)
    // 1: CONTENT (if condition)
    // 2: CLOSE (}})
    // 3: CONTENT (content)
    // 4: OPEN_ENDBLOCK ({{/)
    // 5: CONTENT (if)
    // 6: CLOSE (}})

    expect(tokens).toHaveLength(7);
    expect(tokens[0].type).toBe(TokenType.OPEN_BLOCK);
    expect(tokens[0].value).toBe('{{#');
    expect(tokens[1].type).toBe(TokenType.CONTENT);
    expect(tokens[1].value).toBe('if condition');
    expect(tokens[2].type).toBe(TokenType.CLOSE);
    expect(tokens[3].type).toBe(TokenType.CONTENT);
    expect(tokens[3].value).toBe('content');
    expect(tokens[4].type).toBe(TokenType.OPEN_ENDBLOCK);
    expect(tokens[4].value).toBe('{{/');
    expect(tokens[5].type).toBe(TokenType.CONTENT);
    expect(tokens[5].value).toBe('if');
    expect(tokens[6].type).toBe(TokenType.CLOSE);
  });

  it('should handle inverse blocks', () => {
    lexer.setInput('{{^if condition}}content{{/if}}');

    const token = lexer.lex();

    expect(token?.type).toBe(TokenType.OPEN_INVERSE);
    expect(token?.value).toBe('{{^');
  });

  it('should handle nested blocks', () => {
    lexer.setInput('{{#outer}}{{#inner}}{{/inner}}{{/outer}}');

    const tokens = [];
    let token;
    while ((token = lexer.lex()) !== null) {
      tokens.push(token);
    }

    const blockTokens = tokens.filter(
      (t) => t.type === TokenType.OPEN_BLOCK || t.type === TokenType.OPEN_ENDBLOCK,
    );

    expect(blockTokens).toHaveLength(4);
    expect(blockTokens[0].type).toBe(TokenType.OPEN_BLOCK);
    expect(blockTokens[1].type).toBe(TokenType.OPEN_BLOCK);
    expect(blockTokens[2].type).toBe(TokenType.OPEN_ENDBLOCK);
    expect(blockTokens[3].type).toBe(TokenType.OPEN_ENDBLOCK);
  });

  it('should handle each block', () => {
    lexer.setInput('{{#each items}}{{this}}{{/each}}');

    const tokens = [];
    let token;
    while ((token = lexer.lex()) !== null) {
      tokens.push(token);
    }

    expect(tokens[0].type).toBe(TokenType.OPEN_BLOCK);
    expect(tokens[0].value).toBe('{{#');
  });

  it('should distinguish between {{# and {{', () => {
    lexer.setInput('{{variable}}{{#block}}');

    const token1 = lexer.lex();
    expect(token1?.type).toBe(TokenType.OPEN);

    // Skip content
    lexer.lex();
    lexer.lex();

    const token2 = lexer.lex();
    expect(token2?.type).toBe(TokenType.OPEN_BLOCK);
  });

  it('should handle position tracking across multiple block delimiters', () => {
    lexer.setInput('{{#}}{{/}}{{^}}');

    const tokens = [];
    let token;
    while ((token = lexer.lex()) !== null) {
      tokens.push(token);
    }

    // Expected token sequence:
    // 0: OPEN_BLOCK ({{#) at column 0-3
    // 1: CLOSE (}}) at column 3-5
    // 2: OPEN_ENDBLOCK ({{/) at column 5-8
    // 3: CLOSE (}}) at column 8-10
    // 4: OPEN_INVERSE ({{^) at column 10-13
    // 5: CLOSE (}}) at column 13-15

    expect(tokens).toHaveLength(6);

    expect(tokens[0].type).toBe(TokenType.OPEN_BLOCK);
    expect(tokens[0].loc?.start.column).toBe(0);
    expect(tokens[0].loc?.end.column).toBe(3);

    expect(tokens[2].type).toBe(TokenType.OPEN_ENDBLOCK);
    expect(tokens[2].loc?.start.column).toBe(5);
    expect(tokens[2].loc?.end.column).toBe(8);

    expect(tokens[4].type).toBe(TokenType.OPEN_INVERSE);
    expect(tokens[4].loc?.start.column).toBe(10);
    expect(tokens[4].loc?.end.column).toBe(13);
  });
});
