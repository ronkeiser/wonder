import type { Position, SourceLocation, Token } from './token';
import { TokenType } from './token-types';

/**
 * Lexer for Handlebars-compatible templates
 *
 * Transforms template strings into token streams without using eval() or new Function()
 */
export class Lexer {
  private input: string = '';
  private index: number = 0;
  private line: number = 1;
  private column: number = 0;
  private tokens: Token[] = [];

  /**
   * Initialize lexer with template string
   */
  setInput(template: string): void {
    this.input = template;
    this.index = 0;
    this.line = 1;
    this.column = 0;
    this.tokens = [];
  }

  /**
   * Extract next token from input
   * Returns null when EOF is reached
   */
  lex(): Token | null {
    if (this.isEOF()) {
      return null;
    }

    // Check for mustache opening - need to check triple braces before double
    if (this.match('{{{')) {
      return this.scanDelimiter(TokenType.OPEN_UNESCAPED, '{{{');
    }

    if (this.match('{{')) {
      return this.scanDelimiter(TokenType.OPEN, '{{');
    }

    // Check for mustache closing - need to check triple braces before double
    if (this.match('}}}')) {
      return this.scanDelimiter(TokenType.CLOSE_UNESCAPED, '}}}');
    }

    if (this.match('}}')) {
      return this.scanDelimiter(TokenType.CLOSE, '}}');
    }

    // Otherwise, scan content until we hit {{
    return this.scanContent();
  }

  /**
   * Scan a delimiter token
   */
  private scanDelimiter(type: TokenType, delimiter: string): Token {
    const start = this.getPosition();

    // Consume the delimiter characters
    for (let i = 0; i < delimiter.length; i++) {
      this.advance();
    }

    const end = this.getPosition();

    return {
      type,
      value: delimiter,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Scan plain text content until {{ or }} is encountered
   */
  private scanContent(): Token | null {
    const start = this.getPosition();
    let value = '';

    // Scan until we hit a delimiter
    while (
      !this.isEOF() &&
      !this.match('{{') &&
      !this.match('}}') &&
      !this.match('{{{') &&
      !this.match('}}}')
    ) {
      value += this.advance();
    }

    // Handle empty content case (adjacent mustaches)
    if (value.length === 0) {
      return null;
    }

    const end = this.getPosition();

    return {
      type: TokenType.CONTENT,
      value,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Look ahead at next character without consuming it
   */
  peek(): string {
    if (this.isEOF()) {
      return '';
    }
    return this.input[this.index];
  }

  /**
   * Consume and return next character
   */
  advance(): string {
    if (this.isEOF()) {
      return '';
    }

    const char = this.input[this.index];
    this.index++;

    if (char === '\n') {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }

    return char;
  }

  /**
   * Check if next characters match the given string
   */
  match(str: string): boolean {
    if (this.index + str.length > this.input.length) {
      return false;
    }

    for (let i = 0; i < str.length; i++) {
      if (this.input[this.index + i] !== str[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if we've reached end of input
   */
  isEOF(): boolean {
    return this.index >= this.input.length;
  }

  /**
   * Get current position
   */
  private getPosition(): Position {
    return {
      line: this.line,
      column: this.column,
      index: this.index,
    };
  }
}
