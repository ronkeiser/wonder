import type { TokenType } from './token-types';

/**
 * Source position for error reporting
 */
export interface SourcePosition {
  /** 1-based line number */
  line: number;
  /** 0-based column number */
  column: number;
  /** 0-based character offset from start of input */
  offset: number;
}

/**
 * Source location spanning start to end positions
 */
export interface SourceLocation {
  start: SourcePosition;
  end: SourcePosition;
}

/**
 * A token produced by the lexer
 */
export interface Token {
  /** The type of token */
  type: TokenType;
  /** The raw string value from the source */
  value: string;
  /** Source location for error reporting */
  loc: SourceLocation;
}
