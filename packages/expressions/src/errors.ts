/**
 * Error types for expressions
 *
 * All errors include the expression string and optional position information.
 */

import type { SourcePosition } from './lexer/token';

/**
 * Base class for expression errors
 */
export abstract class ExpressionError extends Error {
  /** The expression that caused the error */
  readonly expression: string;
  /** Position where the error occurred (if available) */
  readonly position: SourcePosition | null;

  constructor(message: string, expression: string, position: SourcePosition | null = null) {
    const fullMessage = position
      ? `${message} at line ${position.line}, column ${position.column}`
      : message;
    super(fullMessage);
    this.name = this.constructor.name;
    this.expression = expression;
    this.position = position;
  }
}

/**
 * Thrown when expression syntax is invalid
 */
export class ExpressionSyntaxError extends ExpressionError {
  constructor(message: string, expression: string, position: SourcePosition | null = null) {
    super(message, expression, position);
  }
}

/**
 * Thrown when referencing unknown function
 */
export class ExpressionReferenceError extends ExpressionError {
  constructor(message: string, expression: string, position: SourcePosition | null = null) {
    super(message, expression, position);
  }
}

/**
 * Thrown for type errors during evaluation (e.g., spread on non-iterable)
 */
export class ExpressionTypeError extends ExpressionError {
  constructor(message: string, expression: string, position: SourcePosition | null = null) {
    super(message, expression, position);
  }
}

/**
 * Thrown when limits are exceeded (expression length, recursion depth, etc.)
 */
export class ExpressionRangeError extends ExpressionError {
  constructor(message: string, expression: string, position: SourcePosition | null = null) {
    super(message, expression, position);
  }
}
