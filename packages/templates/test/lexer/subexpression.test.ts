import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

describe('Lexer - Subexpression Tokenization', () => {
  const lexer = new Lexer();

  describe('Task C1-F5-T1: Parenthesis Tokenization', () => {
    it('should tokenize opening parenthesis inside mustache as OPEN_SEXPR', () => {
      const tokens = lexer.tokenize('{{(}}');
      expect(tokens).toHaveLength(4); // OPEN, OPEN_SEXPR, CLOSE, EOF
      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[1].value).toBe('(');
      expect(tokens[2].type).toBe(TokenType.CLOSE);
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    it('should tokenize closing parenthesis inside mustache as CLOSE_SEXPR', () => {
      const tokens = lexer.tokenize('{{)}}');
      expect(tokens).toHaveLength(4); // OPEN, CLOSE_SEXPR, CLOSE, EOF
      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.CLOSE_SEXPR);
      expect(tokens[1].value).toBe(')');
      expect(tokens[2].type).toBe(TokenType.CLOSE);
      expect(tokens[3].type).toBe(TokenType.EOF);
    });

    it('should NOT tokenize parentheses in CONTENT', () => {
      const tokens = lexer.tokenize('text (with parens)');
      expect(tokens).toHaveLength(2); // CONTENT, EOF
      expect(tokens[0].type).toBe(TokenType.CONTENT);
      expect(tokens[0].value).toBe('text (with parens)');
    });

    it('should tokenize nested parentheses separately', () => {
      const tokens = lexer.tokenize('{{((');
      expect(tokens).toHaveLength(4); // OPEN, OPEN_SEXPR, OPEN_SEXPR, EOF
      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
    });

    it('should track position correctly for parenthesis tokens', () => {
      const tokens = lexer.tokenize('{{(');
      const parenToken = tokens[1];
      expect(parenToken.type).toBe(TokenType.OPEN_SEXPR);
      expect(parenToken.loc).toBeDefined();
      expect(parenToken.loc!.start.index).toBe(2);
      expect(parenToken.loc!.end.index).toBe(3);
    });
  });

  describe('Task C1-F5-T2: Subexpression Token Sequences', () => {
    it('should tokenize simple subexpression in block helper', () => {
      const tokens = lexer.tokenize('{{#if (gt x 1)}}');

      expect(tokens[0].type).toBe(TokenType.OPEN_BLOCK);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value).toBe('if');
      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[3].type).toBe(TokenType.ID);
      expect(tokens[3].value).toBe('gt');
      expect(tokens[4].type).toBe(TokenType.ID);
      expect(tokens[4].value).toBe('x');
      expect(tokens[5].type).toBe(TokenType.NUMBER);
      expect(tokens[5].value).toBe('1');
      expect(tokens[6].type).toBe(TokenType.CLOSE_SEXPR);
      expect(tokens[7].type).toBe(TokenType.CLOSE);
    });

    it('should tokenize nested subexpressions', () => {
      const tokens = lexer.tokenize('{{#if (and (gt x 1) (lt x 10))}}');

      // Find all OPEN_SEXPR and CLOSE_SEXPR tokens
      const openSexprs = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexprs = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openSexprs).toHaveLength(3); // (and, (gt, (lt
      expect(closeSexprs).toHaveLength(3); // ), ), )
    });

    it('should tokenize subexpression in mustache statement', () => {
      const tokens = lexer.tokenize('{{uppercase (concat first last)}}');

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.ID);
      expect(tokens[1].value).toBe('uppercase');
      expect(tokens[2].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[3].type).toBe(TokenType.ID);
      expect(tokens[3].value).toBe('concat');
      expect(tokens[4].type).toBe(TokenType.ID);
      expect(tokens[4].value).toBe('first');
      expect(tokens[5].type).toBe(TokenType.ID);
      expect(tokens[5].value).toBe('last');
      expect(tokens[6].type).toBe(TokenType.CLOSE_SEXPR);
      expect(tokens[7].type).toBe(TokenType.CLOSE);
    });

    it('should tokenize subexpression with string literal', () => {
      const tokens = lexer.tokenize('{{(eq status "active")}}');

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[2].type).toBe(TokenType.ID);
      expect(tokens[2].value).toBe('eq');
      expect(tokens[3].type).toBe(TokenType.ID);
      expect(tokens[3].value).toBe('status');
      expect(tokens[4].type).toBe(TokenType.STRING);
      expect(tokens[4].value).toBe('active');
      expect(tokens[5].type).toBe(TokenType.CLOSE_SEXPR);
      expect(tokens[6].type).toBe(TokenType.CLOSE);
    });

    it('should handle whitespace inside subexpressions', () => {
      const tokens = lexer.tokenize('{{( gt  x  1 )}}');

      const significantTokens = tokens.filter((t) => t.type !== TokenType.EOF);

      expect(significantTokens[0].type).toBe(TokenType.OPEN);
      expect(significantTokens[1].type).toBe(TokenType.OPEN_SEXPR);
      expect(significantTokens[2].type).toBe(TokenType.ID);
      expect(significantTokens[2].value).toBe('gt');
      expect(significantTokens[3].type).toBe(TokenType.ID);
      expect(significantTokens[3].value).toBe('x');
      expect(significantTokens[4].type).toBe(TokenType.NUMBER);
      expect(significantTokens[5].type).toBe(TokenType.CLOSE_SEXPR);
      expect(significantTokens[6].type).toBe(TokenType.CLOSE);
    });

    it('should tokenize multiple subexpressions', () => {
      const tokens = lexer.tokenize('{{#if (or (eq a 1) (eq b 2))}}');

      const openSexprs = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexprs = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openSexprs).toHaveLength(3);
      expect(closeSexprs).toHaveLength(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle unmatched parentheses (parser will catch this)', () => {
      const tokens = lexer.tokenize('{{(gt x 1');

      // Lexer should tokenize it, even though it's invalid
      expect(tokens.some((t) => t.type === TokenType.OPEN_SEXPR)).toBe(true);
      expect(tokens.some((t) => t.type === TokenType.CLOSE_SEXPR)).toBe(false);
    });

    it('should handle empty subexpressions', () => {
      const tokens = lexer.tokenize('{{()}}');

      expect(tokens[0].type).toBe(TokenType.OPEN);
      expect(tokens[1].type).toBe(TokenType.OPEN_SEXPR);
      expect(tokens[2].type).toBe(TokenType.CLOSE_SEXPR);
      expect(tokens[3].type).toBe(TokenType.CLOSE);
    });

    it('should handle deeply nested subexpressions', () => {
      const tokens = lexer.tokenize('{{(a (b (c (d))))}}');

      const openSexprs = tokens.filter((t) => t.type === TokenType.OPEN_SEXPR);
      const closeSexprs = tokens.filter((t) => t.type === TokenType.CLOSE_SEXPR);

      expect(openSexprs).toHaveLength(4);
      expect(closeSexprs).toHaveLength(4);
    });
  });
});
