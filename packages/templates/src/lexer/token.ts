/**
 * Position in source code
 */
export interface Position {
  line: number; // Line number (1-based)
  column: number; // Column number (0-based)
  index: number; // Character index (0-based)
}

/**
 * Source location with start and end positions
 */
export interface SourceLocation {
  start: Position; // Starting position
  end: Position; // Ending position
}

/**
 * Token produced by lexer
 */
export interface Token {
  type: TokenType; // The token type
  value: string; // The lexeme (raw text)
  loc: SourceLocation | null; // Position info (line, column, index)
}

import type { TokenType } from './token-types';
