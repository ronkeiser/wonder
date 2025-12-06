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

    // TODO: Implement token extraction
    return null;
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
