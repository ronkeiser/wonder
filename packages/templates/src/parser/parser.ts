import type { Lexer } from '../lexer/lexer';
import type { Token } from '../lexer/token';
import { TokenType } from '../lexer/token-types';
import { ParserError } from './parser-error';

/**
 * Parser for Handlebars-compatible templates
 *
 * Transforms token streams from the lexer into an Abstract Syntax Tree (AST)
 * following the Handlebars AST specification for compatibility.
 */
export class Parser {
  private lexer: Lexer;
  private tokens: Token[] = [];
  private currentToken: Token | null = null;
  private position: number = 0;

  /**
   * Initialize parser with lexer instance
   *
   * @param lexer - Lexer instance to read tokens from
   * @throws {Error} If lexer is not provided
   */
  constructor(lexer: Lexer) {
    if (!lexer) {
      throw new Error('Parser requires a lexer instance');
    }
    this.lexer = lexer;
  }

  /**
   * Get the current lexer instance
   */
  getLexer(): Lexer {
    return this.lexer;
  }

  /**
   * Get the current token being processed
   */
  getCurrentToken(): Token | null {
    return this.currentToken;
  }

  /**
   * Get the current position in the token stream
   */
  getPosition(): number {
    return this.position;
  }

  /**
   * Initialize parser with tokens from template
   *
   * @param template - Template string to parse
   */
  setInput(template: string): void {
    this.tokens = this.lexer.tokenize(template);
    this.position = 0;
    this.currentToken = this.tokens.length > 0 ? this.tokens[0] : null;
  }

  /**
   * Advance to the next token in the stream
   *
   * @returns The new current token (or null if at end)
   */
  advance(): Token | null {
    if (this.position < this.tokens.length - 1) {
      this.position++;
      this.currentToken = this.tokens[this.position];
    } else {
      this.currentToken = null;
    }
    return this.currentToken;
  }

  /**
   * Look ahead at a token without consuming it
   *
   * @param offset - Number of tokens to look ahead (default 1)
   * @returns The token at the offset position (or null if out of bounds)
   */
  peek(offset: number = 1): Token | null {
    const peekPosition = this.position + offset;
    if (peekPosition >= 0 && peekPosition < this.tokens.length) {
      return this.tokens[peekPosition];
    }
    return null;
  }

  /**
   * Check if the current token matches the given type
   *
   * @param type - Token type to match against
   * @returns True if current token matches the type
   */
  match(type: TokenType): boolean {
    return this.currentToken !== null && this.currentToken.type === type;
  }

  /**
   * Assert that the current token matches the expected type
   *
   * @param type - Expected token type
   * @param message - Optional error message
   * @throws {ParserError} If current token doesn't match expected type
   * @returns The current token
   */
  expect(type: TokenType, message?: string): Token {
    if (!this.currentToken) {
      throw new ParserError(
        message || `Expected token of type ${TokenType[type]}, but reached end of input`,
        null,
      );
    }
    if (this.currentToken.type !== type) {
      const context = this.getErrorContext();
      throw ParserError.fromToken(
        message ||
          `Expected token of type ${TokenType[type]}, but got ${TokenType[this.currentToken.type]}`,
        this.currentToken,
        context,
      );
    }
    return this.currentToken;
  }

  /**
   * Get surrounding tokens for error context
   *
   * @returns Array of tokens around current position (up to 2 before and 2 after)
   */
  private getErrorContext(): Token[] {
    const context: Token[] = [];
    const start = Math.max(0, this.position - 2);
    const end = Math.min(this.tokens.length, this.position + 3);

    for (let i = start; i < end; i++) {
      context.push(this.tokens[i]);
    }

    return context;
  }
}
