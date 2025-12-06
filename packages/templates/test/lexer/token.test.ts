import { describe, expect, it } from 'vitest';
import type { Position, SourceLocation, Token } from '../../src/lexer/token';
import { TokenType } from '../../src/lexer/token-types';

describe('Token Interface', () => {
  it('should include all required fields', () => {
    const pos: Position = {
      line: 1,
      column: 0,
      index: 0,
    };

    const loc: SourceLocation = {
      start: pos,
      end: { line: 1, column: 5, index: 5 },
    };

    const token: Token = {
      type: TokenType.OPEN,
      value: '{{',
      loc: loc,
    };

    expect(token.type).toBe(TokenType.OPEN);
    expect(token.value).toBe('{{');
    expect(token.loc).toBe(loc);
  });

  it('should allow null location', () => {
    const token: Token = {
      type: TokenType.CONTENT,
      value: 'hello',
      loc: null,
    };

    expect(token.loc).toBeNull();
  });
});

describe('SourceLocation', () => {
  it('should be properly typed', () => {
    const loc: SourceLocation = {
      start: { line: 1, column: 0, index: 0 },
      end: { line: 1, column: 10, index: 10 },
    };

    expect(loc.start.line).toBe(1);
    expect(loc.start.column).toBe(0);
    expect(loc.start.index).toBe(0);
    expect(loc.end.line).toBe(1);
    expect(loc.end.column).toBe(10);
    expect(loc.end.index).toBe(10);
  });

  it('should handle multi-line locations', () => {
    const loc: SourceLocation = {
      start: { line: 1, column: 5, index: 5 },
      end: { line: 3, column: 2, index: 42 },
    };

    expect(loc.start.line).toBe(1);
    expect(loc.end.line).toBe(3);
  });
});

describe('Position', () => {
  it('should be properly typed', () => {
    const pos: Position = {
      line: 5,
      column: 10,
      index: 50,
    };

    expect(pos.line).toBe(5);
    expect(pos.column).toBe(10);
    expect(pos.index).toBe(50);
  });

  it('should use 1-based line numbers', () => {
    const pos: Position = {
      line: 1, // First line is 1
      column: 0,
      index: 0,
    };

    expect(pos.line).toBeGreaterThanOrEqual(1);
  });

  it('should use 0-based column numbers', () => {
    const pos: Position = {
      line: 1,
      column: 0, // First column is 0
      index: 0,
    };

    expect(pos.column).toBeGreaterThanOrEqual(0);
  });

  it('should use 0-based character index', () => {
    const pos: Position = {
      line: 1,
      column: 0,
      index: 0, // First character is 0
    };

    expect(pos.index).toBeGreaterThanOrEqual(0);
  });
});
