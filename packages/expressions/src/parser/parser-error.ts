import type { SourcePosition } from '../lexer/token';

/**
 * Error thrown during parsing
 */
export class ParserError extends Error {
  /** The expression that failed to parse */
  readonly expression: string;
  /** Position where the error occurred */
  readonly position: SourcePosition | null;

  constructor(message: string, expression: string, position: SourcePosition | null) {
    const fullMessage = position
      ? `${message} at line ${position.line}, column ${position.column}`
      : message;
    super(fullMessage);
    this.name = 'ParserError';
    this.expression = expression;
    this.position = position;
  }
}
