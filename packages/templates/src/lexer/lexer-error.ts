import type { Position } from './token';

/**
 * Error thrown by the lexer when encountering invalid syntax
 * Includes position information for debugging
 */
export class LexerError extends Error {
  readonly line: number;
  readonly column: number;
  readonly index: number;

  constructor(message: string, position: Position) {
    // Display 1-indexed column for user-facing error messages (editors show 1-indexed)
    super(`Error at line ${position.line}, column ${position.column + 1}: ${message}`);
    this.name = 'LexerError';
    this.line = position.line;
    this.column = position.column;
    this.index = position.index;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LexerError);
    }
  }
}
