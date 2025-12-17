import type { SourcePosition } from './token';

/**
 * Error thrown during lexical analysis
 */
export class LexerError extends Error {
  /** The expression that failed to tokenize */
  readonly expression: string;
  /** Position where the error occurred */
  readonly position: SourcePosition;

  constructor(message: string, expression: string, position: SourcePosition) {
    const fullMessage = `${message} at line ${position.line}, column ${position.column}`;
    super(fullMessage);
    this.name = 'LexerError';
    this.expression = expression;
    this.position = position;
  }
}
