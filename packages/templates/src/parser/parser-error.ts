import type { Token } from '../lexer/token';

/**
 * Error thrown by the parser when encountering invalid syntax
 * Includes position information and context for debugging
 */
export class ParserError extends Error {
  readonly line: number;
  readonly column: number;
  readonly index: number;
  readonly context: string | null;

  constructor(message: string, token: Token | null, context?: string | null) {
    const position = token?.loc?.start;

    // Build error message with position if available
    let fullMessage = message;
    if (position) {
      // Display 1-indexed column for user-facing error messages (editors show 1-indexed)
      fullMessage = `Error at line ${position.line}, column ${position.column + 1}: ${message}`;
    }

    super(fullMessage);
    this.name = 'ParserError';

    // Store position information (using 0-indexed column internally)
    this.line = position?.line ?? 0;
    this.column = position?.column ?? 0;
    this.index = position?.index ?? 0;
    this.context = context ?? null;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if ('captureStackTrace' in Error) {
      (
        Error as { captureStackTrace?: (target: object, constructor: Function) => void }
      ).captureStackTrace?.(this, ParserError);
    }
  }

  /**
   * Create a ParserError with automatic context extraction from token
   */
  static fromToken(message: string, token: Token | null, contextTokens?: Token[]): ParserError {
    let context: string | null = null;

    if (contextTokens && contextTokens.length > 0) {
      // Build context from surrounding tokens
      context = contextTokens
        .map((t) => t.value || `[${t.type}]`)
        .join(' ')
        .slice(0, 50); // Limit context length

      if (context.length === 50) {
        context += '...';
      }
    } else if (token?.value !== undefined && token?.value !== null) {
      context = token.value.slice(0, 50);
      if (token.value.length > 50) {
        context += '...';
      }
      // Keep context as null if value is empty string
      if (context === '') {
        context = null;
      }
    }

    return new ParserError(message, token, context);
  }
}
