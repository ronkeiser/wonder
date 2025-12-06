import { describe, expect, it } from 'vitest';
import { TokenType } from '../../src/lexer/token-types';

describe('TokenType', () => {
  it('should have all required token types', () => {
    // Delimiters
    expect(TokenType.OPEN).toBe('OPEN');
    expect(TokenType.CLOSE).toBe('CLOSE');
    expect(TokenType.OPEN_UNESCAPED).toBe('OPEN_UNESCAPED');
    expect(TokenType.CLOSE_UNESCAPED).toBe('CLOSE_UNESCAPED');

    // Block tokens
    expect(TokenType.OPEN_BLOCK).toBe('OPEN_BLOCK');
    expect(TokenType.OPEN_ENDBLOCK).toBe('OPEN_ENDBLOCK');
    expect(TokenType.OPEN_INVERSE).toBe('OPEN_INVERSE');

    // Special tokens
    expect(TokenType.INVERSE).toBe('INVERSE');
    expect(TokenType.COMMENT).toBe('COMMENT');

    // Content
    expect(TokenType.CONTENT).toBe('CONTENT');

    // Literals
    expect(TokenType.STRING).toBe('STRING');
    expect(TokenType.NUMBER).toBe('NUMBER');
    expect(TokenType.BOOLEAN).toBe('BOOLEAN');
    expect(TokenType.UNDEFINED).toBe('UNDEFINED');
    expect(TokenType.NULL).toBe('NULL');

    // Identifiers and paths
    expect(TokenType.ID).toBe('ID');
    expect(TokenType.SEP).toBe('SEP');
    expect(TokenType.DATA).toBe('DATA');

    // End of input
    expect(TokenType.EOF).toBe('EOF');
  });

  it('should allow token types to be compared for equality', () => {
    const type1 = TokenType.OPEN;
    const type2 = TokenType.OPEN;
    const type3 = TokenType.CLOSE;

    expect(type1).toBe(type2);
    expect(type1).not.toBe(type3);
  });

  it('should be exportable for use in parser', () => {
    // Type check - this will fail at compile time if not properly exported
    const myTokenType: TokenType = TokenType.OPEN;
    expect(myTokenType).toBe('OPEN');
  });

  it('should have string literal types', () => {
    // Verify TypeScript infers the correct type
    const checkType = (type: TokenType) => type;

    expect(checkType(TokenType.OPEN)).toBe('OPEN');
    expect(checkType(TokenType.CONTENT)).toBe('CONTENT');
    expect(checkType(TokenType.EOF)).toBe('EOF');
  });
});
