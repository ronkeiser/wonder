import { LexerError } from './lexer-error';
import type { Position, Token } from './token';
import { TokenType } from './token-types';

/**
 * Lexer states for template scanning
 */
const STATE_CONTENT = 0; // Scanning plain text content
const STATE_MUSTACHE = 1; // Inside mustache delimiters ({{...}})

type LexerState = typeof STATE_CONTENT | typeof STATE_MUSTACHE;

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
  private state: LexerState = STATE_CONTENT;
  private tabWidth: number = 4; // Number of spaces a tab counts as
  // Track last token type to disambiguate dot notation (foo.bar vs . as identifier)
  private lastTokenType: TokenType | null = null;
  private lastTokenValue: string | null = null;
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
    this.state = STATE_CONTENT;
    this.lastTokenType = null;
    this.lastTokenValue = null;
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

        // Handle escaping of mustache delimiters: \{{ or \}}
        if (nextChar === '{' || nextChar === '}') {
          // Remove the backslash and mark the next character as escaped
          const escapedIndex = processedInput.length;
          escapedIndices.add(escapedIndex);

          // Mark positions for double and triple brace patterns
          escapedIndices.add(escapedIndex + 1);
          escapedIndices.add(escapedIndex + 2);

          processedInput += nextChar;
          i += 2; // Skip both backslash and the escaped character
        }
        // Handle backslash escaping another backslash ONLY if followed by {{
        else if (nextChar === '\\' && i + 2 < template.length && template[i + 2] === '{') {
          // \\{{ means: output one backslash, then process the mustache
          processedInput += '\\';
          i += 2; // Skip both backslashes, leave {{ to be lexed
        } else {
          // Not an escape sequence - keep the backslash as-is
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
   * Returns EOF token when end of input is reached
   */
  lex(): Token {
    const token = this.lexInternal();
    if (token) {
      this.lastTokenType = token.type;
      this.lastTokenValue = token.value;
    }
    return token;
  }

  /**
   * Internal lexing logic
   */
  private lexInternal(): Token {
    if (this.isEOF()) {
      return this.createEOFToken();
    }

    // Check for mustache opening - need to check triple braces before double
    // Skip if the opening brace is escaped
    if (this.match('{{{') && !this.isEscaped(this.index)) {
      this.state = STATE_MUSTACHE;
      return this.scanDelimiter(TokenType.OPEN_UNESCAPED, '{{{');
    }

    if (this.match('{{') && !this.isEscaped(this.index)) {
      // Check for comments first
      const nextChar = this.peekAt(2);

      if (nextChar === '!') {
        return this.scanComment();
      }

      // Check for & unescaped syntax {{&
      if (nextChar === '&') {
        this.state = STATE_MUSTACHE;
        return this.scanDelimiter(TokenType.OPEN_RAW, '{{&');
      }

      // Check for block delimiters after {{
      if (nextChar === '#') {
        this.state = STATE_MUSTACHE;
        return this.scanDelimiter(TokenType.OPEN_BLOCK, '{{#');
      }

      if (nextChar === '/') {
        this.state = STATE_MUSTACHE;
        return this.scanDelimiter(TokenType.OPEN_ENDBLOCK, '{{/');
      }

      if (nextChar === '^') {
        this.state = STATE_MUSTACHE;
        return this.scanDelimiter(TokenType.OPEN_INVERSE, '{{^');
      }

      this.state = STATE_MUSTACHE;
      return this.scanDelimiter(TokenType.OPEN, '{{');
    }

    // Check for mustache closing - need to check triple braces before double
    // Skip if the closing brace is escaped
    if (this.match('}}}') && !this.isEscaped(this.index)) {
      this.state = STATE_CONTENT;
      return this.scanDelimiter(TokenType.CLOSE_UNESCAPED, '}}}');
    }

    if (this.match('}}') && !this.isEscaped(this.index)) {
      this.state = STATE_CONTENT;
      return this.scanDelimiter(TokenType.CLOSE, '}}');
    }

    // If we're inside a mustache, check for mustache-specific tokens
    if (this.state === STATE_MUSTACHE) {
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

      // Check for subexpression delimiters (parentheses)
      if (char === '(') {
        return this.scanDelimiter(TokenType.OPEN_SEXPR, '(');
      }

      if (char === ')') {
        return this.scanDelimiter(TokenType.CLOSE_SEXPR, ')');
      }

      // Check for bracket literals - scan content between [ and ] as a single token
      if (char === '[') {
        return this.scanBracketLiteral();
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
        this.lastTokenType = null;
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
   *
   * In Handlebars tokenization:
   * - {{foo.bar}} → foo, SEP, bar
   * - {{../value}} → .., SEP, value
   * - {{foo...}} → foo, SEP, ..
   *
   * After an ID, the first . is ALWAYS a separator.
   * After a SEP (or at path start), check for .. before treating as separator.
   */
  private handleDot(): Token {
    // After an ID token, check for triple dots first (foo... → foo, .., .)
    // Otherwise treat first dot as separator
    if (this.lastTokenType === TokenType.ID) {
      // Check for triple dots: ... → .., .
      if (this.peekAt(1) === '.' && this.peekAt(2) === '.') {
        return this.scanSpecialIdentifier('..');
      }
      // After .. (parent path), a single dot can be a standalone identifier
      // Check if previous token was .. before defaulting to separator
      if (this.lastTokenValue === '..' && this.isSingleDotIdentifier()) {
        return this.scanSpecialIdentifier('.');
      }
      return this.scanSeparator();
    }

    // Check for double dot (..) - it's a special identifier
    if (this.isDoubleDot()) {
      return this.scanSpecialIdentifier('..');
    }

    // Check for current context (.)
    if (this.isSingleDotIdentifier()) {
      return this.scanSpecialIdentifier('.');
    }

    // Otherwise it's a separator
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
   * Updates position tracking: line, column, and index
   * - Newlines increment line and reset column to 0
   * - Tabs advance column by tabWidth (default 4)
   * - Other characters advance column by 1
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
    } else if (char === '\t') {
      this.column += this.tabWidth;
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
      throw new LexerError(`Unclosed comment: expected closing '${endSequence}'`, start);
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
  /**
   * Scan a bracket literal [content] - preserves all content including spaces
   * Used for paths with special characters: {{[foo bar]}}, {{[@alan]}}
   */
  private scanBracketLiteral(): Token {
    const start = this.getPosition();
    this.advance(); // Consume opening [
    let value = '';

    // Scan everything until we hit the closing ]
    while (!this.isEOF() && this.peek() !== ']') {
      value += this.advance();
    }

    // Check for unclosed bracket
    if (this.isEOF()) {
      throw new LexerError('Unclosed bracket literal: expected closing ]', start);
    }

    this.advance(); // Consume closing ]
    const end = this.getPosition();

    return {
      type: TokenType.BRACKET_LITERAL,
      value,
      loc: {
        start,
        end,
      },
    };
  }

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
      throw new LexerError(`Unclosed string: expected closing ${quote}`, start);
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
   * In path contexts (foo.0.1), dots separate segments, not decimals
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

    // Scan decimal part if present and not in path context
    // Paths: {{matrix.0.1}} → ["matrix", "0", "1"]
    // Params: {{helper count=3.14}} → count=3.14
    if (this.shouldScanDecimal() && this.peek() === '.' && this.isDigit(this.peekAt(1))) {
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
   * Determine if we should scan a decimal point as part of a number
   * Returns false when in path context (after a separator)
   */
  private shouldScanDecimal(): boolean {
    return this.lastTokenType !== TokenType.SEP;
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

  /**
   * Create an EOF token at current position
   */
  private createEOFToken(): Token {
    const pos = this.getPosition();
    return {
      type: TokenType.EOF,
      value: '',
      loc: {
        start: pos,
        end: pos,
      },
    };
  }

  /**
   * Convenience method to tokenize an entire template string
   * @param template The template string to tokenize
   * @returns Array of all tokens including EOF token
   */
  tokenize(template: string): Token[] {
    this.setInput(template);
    const tokens: Token[] = [];

    while (!this.isEOF()) {
      tokens.push(this.lex());
    }

    // Include EOF token
    tokens.push(this.lex());

    return tokens;
  }
}
