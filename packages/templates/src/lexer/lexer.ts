import type { Position, Token } from './token';
import { TokenType } from './token-types';

/**
 * Lexer for Handlebars-compatible templates
 *
 * Transforms template strings into token streams without using eval() or new Function()
 */
export class Lexer {
  // Keyword definitions for efficient scanning
  private static readonly KEYWORDS = [
    { word: 'true', type: TokenType.BOOLEAN, length: 4 },
    { word: 'false', type: TokenType.BOOLEAN, length: 5 },
    { word: 'null', type: TokenType.NULL, length: 4 },
    { word: 'undefined', type: TokenType.UNDEFINED, length: 9 },
  ] as const;

  private input: string = '';
  private index: number = 0;
  private line: number = 1;
  private column: number = 0;
  private inMustache: boolean = false;
  // Track last token type to disambiguate dot notation (foo.bar vs . as identifier)
  private lastTokenType: TokenType | null = null;
  // Track which characters are escaped (set of indices)
  private escapedIndices: Set<number> = new Set();

  /**
   * Initialize lexer with template string
   */
  setInput(template: string): void {
    // Pre-process escape sequences before tokenization
    const { processedInput, escapedIndices } = this.preprocessEscapes(template);
    this.input = processedInput;
    this.escapedIndices = escapedIndices;
    this.index = 0;
    this.line = 1;
    this.column = 0;
    this.inMustache = false;
    this.lastTokenType = null;
  }

  /**
   * Pre-process escape sequences in the template
   * Handles backslash escaping: \\ followed by mustache delimiters
   * Returns processed input with backslashes removed (only for mustache escapes)
   * and a set of escaped character indices
   *
   * NOTE: Only escapes mustache delimiters ({ and }). Other escapes (like \" in strings)
   * are handled by their respective scanners (scanString, etc.)
   */
  private preprocessEscapes(template: string): {
    processedInput: string;
    escapedIndices: Set<number>;
  } {
    const escapedIndices = new Set<number>();
    let processedInput = '';
    let i = 0;

    while (i < template.length) {
      const char = template[i];

      // Check for escape sequence
      if (char === '\\' && i + 1 < template.length) {
        const nextChar = template[i + 1];

        // Handle backslash escaping another backslash
        if (nextChar === '\\') {
          // Two backslashes become one backslash in output
          processedInput += '\\';
          i += 2; // Skip both backslashes
        }
        // Handle escaping of mustache delimiters
        else if (nextChar === '{' || nextChar === '}') {
          // Remove the backslash and mark the next character as escaped
          const escapedIndex = processedInput.length;
          escapedIndices.add(escapedIndex);

          // Mark positions for double and triple brace patterns
          escapedIndices.add(escapedIndex + 1);
          escapedIndices.add(escapedIndex + 2);

          processedInput += nextChar;
          i += 2; // Skip both backslash and the escaped character
        } else {
          // Not a brace or backslash escape - keep the backslash
          processedInput += char;
          i++;
        }
      } else {
        processedInput += char;
        i++;
      }
    }

    return { processedInput, escapedIndices };
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
    // Skip if the opening brace is escaped
    if (this.match('{{{') && !this.isEscaped(this.index)) {
      this.inMustache = true;
      return this.scanDelimiter(TokenType.OPEN_UNESCAPED, '{{{');
    }

    if (this.match('{{') && !this.isEscaped(this.index)) {
      // Check for comments first
      const nextChar = this.peekAt(2);

      if (nextChar === '!') {
        return this.scanComment();
      }

      // Check for block delimiters after {{
      if (nextChar === '#') {
        this.inMustache = true;
        return this.scanDelimiter(TokenType.OPEN_BLOCK, '{{#');
      }

      if (nextChar === '/') {
        this.inMustache = true;
        return this.scanDelimiter(TokenType.OPEN_ENDBLOCK, '{{/');
      }

      if (nextChar === '^') {
        this.inMustache = true;
        return this.scanDelimiter(TokenType.OPEN_INVERSE, '{{^');
      }

      this.inMustache = true;
      return this.scanDelimiter(TokenType.OPEN, '{{');
    }

    // Check for mustache closing - need to check triple braces before double
    // Skip if the closing brace is escaped
    if (this.match('}}}') && !this.isEscaped(this.index)) {
      this.inMustache = false;
      return this.scanDelimiter(TokenType.CLOSE_UNESCAPED, '}}}');
    }

    if (this.match('}}') && !this.isEscaped(this.index)) {
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
        return this.handleDot();
      }

      // Check for slash separator
      if (char === '/') {
        return this.scanSeparator();
      }

      // Check for number literals
      if (this.isDigit(char) || (char === '-' && this.isDigit(this.peekAt(1)))) {
        return this.scanNumber();
      }

      // Check for boolean, null, undefined literals (keywords)
      if (this.isAlpha(char)) {
        // Check if it's a keyword
        const keyword = this.tryMatchKeyword();
        if (keyword) {
          return keyword;
        }

        // If not a keyword, scan as identifier
        return this.scanIdentifier();
      }

      // Skip whitespace in mustache context
      if (this.isWhitespace(char)) {
        while (!this.isEOF() && this.isWhitespace(this.peek())) {
          this.advance();
        }
        return this.lexInternal();
      }
    }

    // Otherwise, scan content until we hit {{
    // scanContent returns null for empty content (adjacent delimiters)
    const content = this.scanContent();
    if (content === null) {
      // No content between delimiters, continue to next token
      return this.lexInternal();
    }
    return content;
  }

  /**
   * Scan a delimiter token ({{, }}, {{{, }}}, {{#, {{/, {{^)
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
   * Handle dot character - determines if it's a separator or special identifier
   */
  private handleDot(): Token {
    // After an identifier, the first dot is always a separator
    if (this.lastTokenType === TokenType.ID) {
      return this.scanSeparator();
    }

    // Check for .. (parent path reference)
    if (this.isDoubleDot()) {
      return this.scanSpecialIdentifier('..');
    }

    // Check for . as standalone identifier
    if (this.isSingleDotIdentifier()) {
      return this.scanSpecialIdentifier('.');
    }

    // Otherwise it's a separator (like in foo . bar where bar follows)
    return this.scanSeparator();
  }

  /**
   * Check if current position has .. as a special identifier
   */
  private isDoubleDot(): boolean {
    const nextChar = this.peekAt(1);
    const charAfterNext = this.peekAt(2);
    return nextChar === '.' && !this.isAlphaNumeric(charAfterNext);
  }

  /**
   * Check if current dot should be treated as a standalone identifier
   * Treats as identifier when followed by: / (./foo), }} (closing), or whitespace
   */
  private isSingleDotIdentifier(): boolean {
    const nextChar = this.peekAt(1);
    const charAfterNext = this.peekAt(2);

    return (
      nextChar === '/' ||
      (nextChar === '}' && charAfterNext === '}') ||
      nextChar === ' ' ||
      nextChar === '\t'
    );
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
   * Returns null only if there's no content (adjacent mustaches),
   * which triggers lexInternal to continue scanning for the next token
   *
   * Special case: When we encounter an escaped opening delimiter (like \{{),
   * we treat the entire mustache-like structure as content, including finding
   * and consuming the matching closing delimiter
   */
  private scanContent(): Token | null {
    const start = this.getPosition();
    let value = '';

    // Scan until we hit a non-escaped delimiter
    while (!this.isEOF()) {
      // Check for escaped opening delimiters - these consume through closing
      if (this.isEscaped(this.index)) {
        if (this.match('{{{')) {
          // Escaped triple brace - include it and find matching }}}
          value += this.advance(); // First {
          value += this.advance(); // Second {
          value += this.advance(); // Third {

          // Scan until we find }}}
          while (!this.isEOF() && !this.match('}}}')) {
            value += this.advance();
          }

          // Include the closing }}}
          if (this.match('}}}')) {
            value += this.advance(); // First }
            value += this.advance(); // Second }
            value += this.advance(); // Third }
          }
          continue;
        } else if (this.match('{{')) {
          // Escaped double brace - include it and find matching }}
          value += this.advance(); // First {
          value += this.advance(); // Second {

          // Scan until we find }}
          while (!this.isEOF() && !this.match('}}')) {
            value += this.advance();
          }

          // Include the closing }}
          if (this.match('}}')) {
            value += this.advance(); // First }
            value += this.advance(); // Second }
          }
          continue;
        } else if (this.match('}}}') || this.match('}}')) {
          // Escaped closing brace - just include it
          value += this.advance();
          if (this.peek() === '}') {
            value += this.advance();
            if (this.peek() === '}') {
              value += this.advance();
            }
          }
          continue;
        }
      }

      // Check for non-escaped delimiters (these end content)
      const isOpenDelimiter =
        (this.match('{{{') || this.match('{{')) && !this.isEscaped(this.index);
      const isCloseDelimiter =
        (this.match('}}}') || this.match('}}')) && !this.isEscaped(this.index);

      if (isOpenDelimiter || isCloseDelimiter) {
        break;
      }

      value += this.advance();
    }

    // Handle empty content case (adjacent mustaches)
    // Return null to signal lexInternal should continue
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
   * Check if the character at the given index is escaped
   */
  private isEscaped(index: number): boolean {
    return this.escapedIndices.has(index);
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
    if (this.peek() === '.' && this.isDigit(this.peekAt(1))) {
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
   * Try to match a keyword at the current position
   * Returns the keyword token if matched, null otherwise
   */
  private tryMatchKeyword(): Token | null {
    for (const { word, type, length } of Lexer.KEYWORDS) {
      if (this.match(word) && !this.isAlphaNumeric(this.peekAt(length))) {
        return this.scanKeyword(type, word);
      }
    }
    return null;
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
   * Check if character is whitespace
   */
  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
  }

  /**
   * Safely peek at character at specific offset from current position
   */
  private peekAt(offset: number): string {
    const targetIndex = this.index + offset;
    if (targetIndex >= this.input.length) {
      return '';
    }
    return this.input[targetIndex];
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
