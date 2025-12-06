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
  private inMustache: boolean = false;
  private lastTokenType: TokenType | null = null;

  /**
   * Initialize lexer with template string
   */
  setInput(template: string): void {
    this.input = template;
    this.index = 0;
    this.line = 1;
    this.column = 0;
    this.tokens = [];
    this.inMustache = false;
    this.lastTokenType = null;
  }

  /**
   * Extract next token from input
   * Returns null when EOF is reached
   */
  lex(): Token | null {
    const token = this.lexInternal();
    if (token) {
      this.lastTokenType = token.type;
    }
    return token;
  }

  /**
   * Internal lexing logic
   */
  private lexInternal(): Token | null {
    if (this.isEOF()) {
      return null;
    }

    // Check for mustache opening - need to check triple braces before double
    if (this.match('{{{')) {
      this.inMustache = true;
      return this.scanDelimiter(TokenType.OPEN_UNESCAPED, '{{{');
    }

    if (this.match('{{')) {
      // Check for comments first
      const nextChar = this.input[this.index + 2];

      if (nextChar === '!') {
        return this.scanComment();
      }

      // Check for block delimiters after {{
      if (nextChar === '#') {
        this.inMustache = true;
        return this.scanBlockDelimiter(TokenType.OPEN_BLOCK, '{{#');
      }

      if (nextChar === '/') {
        this.inMustache = true;
        return this.scanBlockDelimiter(TokenType.OPEN_ENDBLOCK, '{{/');
      }

      if (nextChar === '^') {
        this.inMustache = true;
        return this.scanBlockDelimiter(TokenType.OPEN_INVERSE, '{{^');
      }

      this.inMustache = true;
      return this.scanDelimiter(TokenType.OPEN, '{{');
    }

    // Check for mustache closing - need to check triple braces before double
    if (this.match('}}}')) {
      this.inMustache = false;
      return this.scanDelimiter(TokenType.CLOSE_UNESCAPED, '}}}');
    }

    if (this.match('}}')) {
      this.inMustache = false;
      return this.scanDelimiter(TokenType.CLOSE, '}}');
    }

    // If we're inside a mustache, check for mustache-specific tokens
    if (this.inMustache) {
      const char = this.peek();

      // Check for string literals
      if (char === '"' || char === "'") {
        return this.scanString();
      }

      // Check for data prefix (@)
      if (char === '@') {
        return this.scanData();
      }

      // Check for special dot identifiers (. or ..) before treating as separator
      if (char === '.') {
        // After an identifier, the first dot is always a separator
        if (this.lastTokenType === TokenType.ID) {
          return this.scanSeparator();
        }

        const nextChar = this.input[this.index + 1];
        const charAfterNext = this.input[this.index + 2];

        // After OPEN, SEP, or other tokens (not ID), check if it's a special identifier
        // IMPORTANT: Check for .. before checking for single .
        // If nextChar is also a dot AND the character after is not alphanumeric, it's ..
        if (nextChar === '.' && !this.isAlphaNumeric(charAfterNext)) {
          return this.scanSpecialIdentifier('..');
        }

        // Check if it's single . as standalone identifier
        // Treat as identifier when:
        // - followed by / (./foo pattern)
        // - followed by }} (just . before closing)
        // - followed by whitespace (standalone . before }}))
        if (
          nextChar === '/' ||
          (nextChar === '}' && charAfterNext === '}') ||
          nextChar === ' ' ||
          nextChar === '\t'
        ) {
          return this.scanSpecialIdentifier('.');
        }

        // Otherwise it's a separator (like in foo . bar where bar follows)
        return this.scanSeparator();
      }

      // Check for slash separator
      if (char === '/') {
        return this.scanSeparator();
      }

      // Check for number literals
      if (this.isDigit(char) || (char === '-' && this.isDigit(this.input[this.index + 1]))) {
        return this.scanNumber();
      }

      // Check for boolean, null, undefined literals (keywords)
      if (this.isAlpha(char)) {
        // Peek ahead to see if it's a keyword
        if (this.match('true') && !this.isAlphaNumeric(this.input[this.index + 4])) {
          return this.scanKeyword(TokenType.BOOLEAN, 'true');
        }
        if (this.match('false') && !this.isAlphaNumeric(this.input[this.index + 5])) {
          return this.scanKeyword(TokenType.BOOLEAN, 'false');
        }
        if (this.match('null') && !this.isAlphaNumeric(this.input[this.index + 4])) {
          return this.scanKeyword(TokenType.NULL, 'null');
        }
        if (this.match('undefined') && !this.isAlphaNumeric(this.input[this.index + 9])) {
          return this.scanKeyword(TokenType.UNDEFINED, 'undefined');
        }

        // If not a keyword, scan as identifier
        return this.scanIdentifier();
      }

      // Skip whitespace in mustache context
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        this.advance();
        return this.lexInternal(); // Recursively get next token
      }
    }

    // Otherwise, scan content until we hit {{
    return this.scanContent();
  }

  /**
   * Scan a block delimiter token ({{#, {{/, {{^)
   */
  private scanBlockDelimiter(type: TokenType, delimiter: string): Token {
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
   * Scan a separator token (. or /)
   */
  private scanSeparator(): Token {
    const start = this.getPosition();
    const value = this.advance(); // Consume . or /

    const end = this.getPosition();

    return {
      type: TokenType.SEP,
      value,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Scan a data prefix token (@)
   */
  private scanData(): Token {
    const start = this.getPosition();
    const value = this.advance(); // Consume @

    const end = this.getPosition();

    return {
      type: TokenType.DATA,
      value,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Scan a special identifier (. or ..)
   * These are identifiers, not separators, when they appear as standalone tokens
   */
  private scanSpecialIdentifier(expected: string): Token {
    const start = this.getPosition();
    let value = '';

    // Consume the expected characters
    for (let i = 0; i < expected.length; i++) {
      value += this.advance();
    }

    const end = this.getPosition();

    return {
      type: TokenType.ID,
      value,
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
   * Scan a comment token ({{! ... }} or {{!-- ... --}})
   */
  private scanComment(): Token {
    const start = this.getPosition();

    // Consume {{!
    this.advance(); // {
    this.advance(); // {
    this.advance(); // !

    // Check if it's a block comment {{!--
    const isBlockComment = this.match('--');
    if (isBlockComment) {
      this.advance(); // -
      this.advance(); // -
    }

    let value = '';
    const endSequence = isBlockComment ? '--}}' : '}}';

    // Scan until we find the closing sequence
    while (!this.isEOF() && !this.match(endSequence)) {
      value += this.advance();
    }

    // Check for unclosed comment
    if (this.isEOF() && !this.match(endSequence)) {
      const pos = this.getPosition();
      throw new Error(`Unclosed comment at line ${pos.line}, column ${pos.column}`);
    }

    // Consume the closing sequence
    for (let i = 0; i < endSequence.length; i++) {
      this.advance();
    }

    const end = this.getPosition();

    return {
      type: TokenType.COMMENT,
      value,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Scan a string literal ("text" or 'text')
   */
  private scanString(): Token {
    const start = this.getPosition();
    const quote = this.advance(); // Consume opening quote
    let value = '';

    while (!this.isEOF() && this.peek() !== quote) {
      const char = this.peek();

      // Handle escape sequences
      if (char === '\\') {
        this.advance(); // Consume backslash
        const nextChar = this.peek();

        if (nextChar === '\\') {
          value += '\\';
          this.advance();
        } else if (nextChar === quote) {
          value += quote;
          this.advance();
        } else {
          // Keep the escape sequence as-is for other characters
          value += '\\' + nextChar;
          this.advance();
        }
      } else {
        value += this.advance();
      }
    }

    // Check for unclosed string
    if (this.isEOF()) {
      const pos = this.getPosition();
      throw new Error(`Unclosed string at line ${pos.line}, column ${pos.column}`);
    }

    this.advance(); // Consume closing quote
    const end = this.getPosition();

    return {
      type: TokenType.STRING,
      value,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Scan a number literal (123, -42, 1.5)
   */
  private scanNumber(): Token {
    const start = this.getPosition();
    let value = '';

    // Handle negative sign
    if (this.peek() === '-') {
      value += this.advance();
    }

    // Scan integer part
    while (!this.isEOF() && this.isDigit(this.peek())) {
      value += this.advance();
    }

    // Scan decimal part
    if (this.peek() === '.' && this.isDigit(this.input[this.index + 1])) {
      value += this.advance(); // Consume '.'
      while (!this.isEOF() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    const end = this.getPosition();

    return {
      type: TokenType.NUMBER,
      value,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Scan a keyword (true, false, null, undefined)
   */
  private scanKeyword(type: TokenType, keyword: string): Token {
    const start = this.getPosition();

    // Consume the keyword characters
    for (let i = 0; i < keyword.length; i++) {
      this.advance();
    }

    const end = this.getPosition();

    return {
      type,
      value: keyword,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Scan an identifier (variable/helper name)
   * Identifiers start with letter, _, or $ and can contain letters, digits, _, $
   */
  private scanIdentifier(): Token {
    const start = this.getPosition();
    let value = '';

    // First character must be letter, _, or $
    if (this.isAlpha(this.peek())) {
      value += this.advance();
    }

    // Subsequent characters can be letters, digits, _, or $
    while (!this.isEOF() && this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }

    const end = this.getPosition();

    return {
      type: TokenType.ID,
      value,
      loc: {
        start,
        end,
      },
    };
  }

  /**
   * Check if character is a digit
   */
  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  /**
   * Check if character is a letter
   */
  private isAlpha(char: string): boolean {
    return (
      (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_' || char === '$'
    );
  }

  /**
   * Check if character is alphanumeric
   */
  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
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
