import { LexerError } from './lexer-error';
import type { Position, Token } from './token';
import { TokenType } from './token-types';

/** Scanning plain text content */
const STATE_CONTENT = 0;
/** Inside mustache delimiters ({{...}}) */
const STATE_MUSTACHE = 1;
/** Number of characters to mark as escaped when processing \{{ or \}} */
const ESCAPED_CHARS_COUNT = 3;

type LexerState = typeof STATE_CONTENT | typeof STATE_MUSTACHE;

/**
 * Lexer for Handlebars-compatible templates
 *
 * Transforms template strings into token streams without using eval() or new Function()
 */
export class Lexer {
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
  private tabWidth: number = 4;
  private lastTokenType: TokenType | null = null;
  private lastTokenValue: string | null = null;
  private escapedIndices: Set<number> = new Set();

  /**
   * Initialize lexer with template string
   */
  setInput(template: string): void {
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
   * Convenience method to tokenize an entire template string
   */
  tokenize(template: string): Token[] {
    this.setInput(template);
    const tokens: Token[] = [];

    while (!this.isEOF()) {
      tokens.push(this.lex());
    }

    tokens.push(this.lex()); // Include EOF token
    return tokens;
  }

  /**
   * Check if we've reached end of input
   */
  isEOF(): boolean {
    return this.index >= this.input.length;
  }

  /**
   * Internal lexing logic - dispatches to appropriate scanner
   */
  private lexInternal(): Token {
    if (this.isEOF()) {
      return this.createEOFToken();
    }

    const openingToken = this.tryScanOpeningMustache();
    if (openingToken) return openingToken;

    const closingToken = this.tryScanClosingMustache();
    if (closingToken) return closingToken;

    // Inside mustache: scan mustache-specific tokens
    if (this.state === STATE_MUSTACHE) {
      return this.scanMustacheToken();
    }

    // Outside mustache: scan content
    const content = this.scanContent();
    if (content === null) {
      return this.lexInternal(); // No content between delimiters
    }
    return content;
  }

  /**
   * Try to scan an opening mustache delimiter ({{{, {{#, {{/, {{^, {{&, {{!, {{)
   * Also handles whitespace control: {{~, {{~#, etc.
   */
  private tryScanOpeningMustache(): Token | null {
    // Triple braces first (more specific) - check for {{~ before {{{
    if (this.match('{{{') && !this.isEscaped(this.index)) {
      this.state = STATE_MUSTACHE;
      return this.scanDelimiter(TokenType.OPEN_UNESCAPED, '{{{');
    }

    if (this.match('{{') && !this.isEscaped(this.index)) {
      // Check if there's a ~ for whitespace control
      const hasStrip = this.peekAt(2) === '~';
      const checkOffset = hasStrip ? 3 : 2;
      const nextChar = this.peekAt(checkOffset);

      // Handle comments before setting state (they don't support strip markers in the same way)
      if (!hasStrip && nextChar === '!') {
        return this.scanComment();
      }
      // Handle {{~!
      if (hasStrip && nextChar === '!') {
        // Scan just {{~ and let the comment be handled next
        this.state = STATE_MUSTACHE;
        return this.scanDelimiter(TokenType.OPEN, '{{');
      }

      this.state = STATE_MUSTACHE;

      // Determine the token type based on the character after {{ (and optional ~)
      switch (nextChar) {
        case '&':
          if (hasStrip) {
            // Return just {{, let ~ and & be handled separately
            return this.scanDelimiter(TokenType.OPEN, '{{');
          }
          return this.scanDelimiter(TokenType.OPEN_RAW, '{{&');
        case '#':
          if (hasStrip) {
            // Return just {{, let ~ and # be handled in mustache state
            return this.scanDelimiter(TokenType.OPEN, '{{');
          }
          return this.scanDelimiter(TokenType.OPEN_BLOCK, '{{#');
        case '/':
          if (hasStrip) {
            return this.scanDelimiter(TokenType.OPEN, '{{');
          }
          return this.scanDelimiter(TokenType.OPEN_ENDBLOCK, '{{/');
        case '^':
          if (hasStrip) {
            return this.scanDelimiter(TokenType.OPEN, '{{');
          }
          return this.scanDelimiter(TokenType.OPEN_INVERSE, '{{^');
        default:
          return this.scanDelimiter(TokenType.OPEN, '{{');
      }
    }

    return null;
  }

  /**
   * Try to scan a closing mustache delimiter (}}} or }})
   */
  private tryScanClosingMustache(): Token | null {
    if (this.match('}}}') && !this.isEscaped(this.index)) {
      this.state = STATE_CONTENT;
      return this.scanDelimiter(TokenType.CLOSE_UNESCAPED, '}}}');
    }

    if (this.match('}}') && !this.isEscaped(this.index)) {
      this.state = STATE_CONTENT;
      return this.scanDelimiter(TokenType.CLOSE, '}}');
    }

    return null;
  }

  /**
   * Scan a token inside mustache context
   */
  private scanMustacheToken(): Token {
    const char = this.peek();

    // Whitespace control strip marker (~)
    if (char === '~') return this.scanDelimiter(TokenType.STRIP, '~');

    // Block markers (used after ~ for whitespace control variants)
    if (char === '#') return this.scanDelimiter(TokenType.BLOCK_START, '#');
    if (char === '^') return this.scanDelimiter(TokenType.BLOCK_INVERSE, '^');
    if (char === '&') return this.scanDelimiter(TokenType.RAW_MARKER, '&');

    if (char === '"' || char === "'") return this.scanString();

    // Data prefix (@)
    if (char === '@') return this.scanData();

    if (char === '.') return this.handleDot();

    // / can be either a path separator or block end marker
    if (char === '/') {
      // Check if this is at start of expression (block end marker) vs path separator
      // If we just saw STRIP or we're at start of mustache, it's a block end marker
      if (this.lastTokenType === TokenType.STRIP || this.lastTokenType === TokenType.OPEN) {
        return this.scanDelimiter(TokenType.BLOCK_END, '/');
      }
      return this.scanSeparator();
    }

    if (char === '(') return this.scanDelimiter(TokenType.OPEN_SEXPR, '(');
    if (char === ')') return this.scanDelimiter(TokenType.CLOSE_SEXPR, ')');

    // Braces (for {{~{foo}~}} unescaped syntax)
    if (char === '{') return this.scanDelimiter(TokenType.OPEN_BRACE, '{');
    if (char === '}') return this.scanDelimiter(TokenType.CLOSE_BRACE, '}');

    // Pipe (block parameters)
    if (char === '|') return this.scanDelimiter(TokenType.PIPE, '|');

    // Equals sign (hash arguments)
    if (char === '=') return this.scanDelimiter(TokenType.EQUALS, '=');

    if (char === '[') return this.scanBracketLiteral();

    if (this.isDigit(char) || (char === '-' && this.isDigit(this.peekAt(1)))) {
      return this.scanNumber();
    }

    if (this.isAlpha(char)) {
      return this.tryMatchKeyword() ?? this.scanIdentifier();
    }

    // Whitespace - skip and continue
    if (this.isWhitespace(char)) {
      this.skipWhitespace();
      return this.lexInternal();
    }

    // Unknown character - advance and try again
    this.advance();
    return this.lexInternal();
  }

  /**
   * Scan a delimiter token
   */
  private scanDelimiter(type: TokenType, delimiter: string): Token {
    const start = this.getPosition();
    this.consumeChars(delimiter.length);
    return this.createToken(type, delimiter, start);
  }

  /**
   * Scan a comment token ({{! ... }} or {{!-- ... --}})
   */
  private scanComment(): Token {
    const start = this.getPosition();
    this.consumeChars(3); // {{!

    const isBlockComment = this.match('--');
    if (isBlockComment) {
      this.consumeChars(2);
    }

    const endSequence = isBlockComment ? '--}}' : '}}';
    const value = this.scanUntilMatch(endSequence);

    if (this.isEOF() && !this.match(endSequence)) {
      throw new LexerError(`Unclosed comment: expected closing '${endSequence}'`, start);
    }

    this.consumeChars(endSequence.length);
    return this.createToken(TokenType.COMMENT, value, start);
  }

  /**
   * Scan a string literal ("text" or 'text')
   */
  private scanString(): Token {
    const start = this.getPosition();
    const quote = this.advance();
    const value = this.scanStringContent(quote);

    if (this.isEOF()) {
      throw new LexerError(`Unclosed string: expected closing ${quote}`, start);
    }

    this.advance(); // Consume closing quote
    return this.createToken(TokenType.STRING, value, start);
  }

  /**
   * Scan string content handling escape sequences
   */
  private scanStringContent(quote: string): string {
    let value = '';

    while (!this.isEOF() && this.peek() !== quote) {
      const char = this.peek();

      if (char === '\\') {
        this.advance();
        const nextChar = this.peek();

        if (nextChar === '\\') {
          value += '\\';
          this.advance();
        } else if (nextChar === quote) {
          value += quote;
          this.advance();
        } else {
          value += '\\' + nextChar;
          this.advance();
        }
      } else {
        value += this.advance();
      }
    }

    return value;
  }

  /**
   * Scan a number literal (123, -42, 1.5)
   */
  private scanNumber(): Token {
    const start = this.getPosition();
    let value = '';

    if (this.peek() === '-') {
      value += this.advance();
    }

    value += this.scanDigits();

    if (this.shouldScanDecimal() && this.peek() === '.' && this.isDigit(this.peekAt(1))) {
      value += this.advance();
      value += this.scanDigits();
    }

    return this.createToken(TokenType.NUMBER, value, start);
  }

  /**
   * Scan a bracket literal [content]
   */
  private scanBracketLiteral(): Token {
    const start = this.getPosition();
    this.advance(); // [

    const value = this.scanUntilChar(']');

    if (this.isEOF()) {
      throw new LexerError('Unclosed bracket literal: expected closing ]', start);
    }

    this.advance(); // ]
    return this.createToken(TokenType.BRACKET_LITERAL, value, start);
  }

  /**
   * Scan a keyword (true, false, null, undefined)
   */
  private scanKeyword(type: TokenType, keyword: string): Token {
    const start = this.getPosition();
    this.consumeChars(keyword.length);
    return this.createToken(type, keyword, start);
  }

  /**
   * Scan an identifier (variable/helper name)
   */
  private scanIdentifier(): Token {
    const start = this.getPosition();
    let value = '';

    if (this.isAlpha(this.peek())) {
      value += this.advance();
    }

    while (!this.isEOF() && this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }

    return this.createToken(TokenType.ID, value, start);
  }

  /**
   * Scan a data prefix token (@)
   */
  private scanData(): Token {
    const start = this.getPosition();
    const value = this.advance();
    return this.createToken(TokenType.DATA, value, start);
  }

  /**
   * Scan a separator token (. or /)
   */
  private scanSeparator(): Token {
    const start = this.getPosition();
    const value = this.advance();
    return this.createToken(TokenType.SEP, value, start);
  }

  /**
   * Scan a special identifier (. or ..)
   */
  private scanSpecialIdentifier(expected: string): Token {
    const start = this.getPosition();
    this.consumeChars(expected.length);
    return this.createToken(TokenType.ID, expected, start);
  }

  /**
   * Scan plain text content until {{ or }} is encountered
   */
  private scanContent(): Token | null {
    const start = this.getPosition();
    let value = '';

    while (!this.isEOF()) {
      if (this.isEscaped(this.index)) {
        const escapedContent = this.scanEscapedDelimiter();
        if (escapedContent) {
          value += escapedContent;
          continue;
        }
      }

      if (this.isUnescapedDelimiter()) {
        break;
      }

      value += this.advance();
    }

    if (value.length === 0) {
      return null;
    }

    return this.createToken(TokenType.CONTENT, value, start);
  }

  /**
   * Scan an escaped delimiter sequence as literal content
   */
  private scanEscapedDelimiter(): string | null {
    if (this.match('{{{')) return this.consumeEscapedMustache('{{{', '}}}');
    if (this.match('{{')) return this.consumeEscapedMustache('{{', '}}');
    if (this.match('}}}')) return this.consumeDelimiterChars(3);
    if (this.match('}}')) return this.consumeDelimiterChars(2);
    return null;
  }

  /**
   * Consume an escaped mustache expression including its closing delimiter
   */
  private consumeEscapedMustache(openDelim: string, closeDelim: string): string {
    let content = '';

    for (let i = 0; i < openDelim.length; i++) {
      content += this.advance();
    }

    while (!this.isEOF() && !this.match(closeDelim)) {
      content += this.advance();
    }

    if (this.match(closeDelim)) {
      for (let i = 0; i < closeDelim.length; i++) {
        content += this.advance();
      }
    }

    return content;
  }

  /**
   * Consume a specific number of closing brace characters
   */
  private consumeDelimiterChars(count: number): string {
    let content = '';
    for (let i = 0; i < count && this.peek() === '}'; i++) {
      content += this.advance();
    }
    return content;
  }

  /**
   * Handle dot character - determines if it's a separator or special identifier
   */
  private handleDot(): Token {
    if (this.lastTokenType === TokenType.ID) {
      // Triple dots: ... → .., .
      if (this.peekAt(1) === '.' && this.peekAt(2) === '.') {
        return this.scanSpecialIdentifier('..');
      }
      // After .., a single dot can be standalone
      if (this.lastTokenValue === '..' && this.isSingleDotIdentifier()) {
        return this.scanSpecialIdentifier('.');
      }
      return this.scanSeparator();
    }

    if (this.isDoubleDot()) return this.scanSpecialIdentifier('..');
    if (this.isSingleDotIdentifier()) return this.scanSpecialIdentifier('.');

    return this.scanSeparator();
  }

  /**
   * Check if current position has .. as a special identifier
   */
  private isDoubleDot(): boolean {
    return this.peekAt(1) === '.' && !this.isAlphaNumeric(this.peekAt(2));
  }

  /**
   * Check if current dot should be treated as a standalone identifier
   */
  private isSingleDotIdentifier(): boolean {
    const nextChar = this.peekAt(1);
    return (
      nextChar === '/' ||
      (nextChar === '}' && this.peekAt(2) === '}') ||
      nextChar === ' ' ||
      nextChar === '\t'
    );
  }

  /**
   * Pre-process escape sequences in the template
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

      if (char !== '\\' || i + 1 >= template.length) {
        processedInput += char;
        i++;
        continue;
      }

      const next = template[i + 1];

      // \{{ or \}}
      if (next === '{' || next === '}') {
        this.markEscapedSequence(escapedIndices, processedInput.length);
        processedInput += next;
        i += 2;
        continue;
      }

      // \\{{
      if (this.isBackslashBeforeMustache(template, i, next)) {
        processedInput += '\\';
        i += 2;
        continue;
      }

      processedInput += char;
      i++;
    }

    return { processedInput, escapedIndices };
  }

  /**
   * Mark a sequence of characters as escaped
   */
  private markEscapedSequence(escapedIndices: Set<number>, startIndex: number): void {
    for (let offset = 0; offset < ESCAPED_CHARS_COUNT; offset++) {
      escapedIndices.add(startIndex + offset);
    }
  }

  /**
   * Check if we have a backslash before mustache pattern: \\{{
   */
  private isBackslashBeforeMustache(template: string, i: number, next: string): boolean {
    return next === '\\' && i + 3 < template.length && template.slice(i + 2, i + 4) === '{{';
  }

  /**
   * Check if the character at the given index is escaped
   */
  private isEscaped(index: number): boolean {
    return this.escapedIndices.has(index);
  }

  /**
   * Check if we're at a non-escaped delimiter
   */
  private isUnescapedDelimiter(): boolean {
    const isOpen = (this.match('{{{') || this.match('{{')) && !this.isEscaped(this.index);
    const isClose = (this.match('}}}') || this.match('}}')) && !this.isEscaped(this.index);
    return isOpen || isClose;
  }

  /**
   * Look ahead at next character without consuming it
   */
  peek(): string {
    if (this.isEOF()) return '';
    return this.input[this.index];
  }

  /**
   * Safely peek at character at specific offset
   */
  private peekAt(offset: number): string {
    const targetIndex = this.index + offset;
    if (targetIndex >= this.input.length) return '';
    return this.input[targetIndex];
  }

  /**
   * Consume and return next character
   */
  advance(): string {
    if (this.isEOF()) return '';

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
    if (this.index + str.length > this.input.length) return false;

    for (let i = 0; i < str.length; i++) {
      if (this.input[this.index + i] !== str[i]) return false;
    }

    return true;
  }

  /**
   * Consume a specific number of characters
   */
  private consumeChars(count: number): void {
    for (let i = 0; i < count; i++) {
      this.advance();
    }
  }

  /**
   * Skip whitespace characters
   */
  private skipWhitespace(): void {
    while (!this.isEOF() && this.isWhitespace(this.peek())) {
      this.advance();
    }
    this.lastTokenType = null;
  }

  /**
   * Scan characters until a match is found
   */
  private scanUntilMatch(endSequence: string): string {
    let value = '';
    while (!this.isEOF() && !this.match(endSequence)) {
      value += this.advance();
    }
    return value;
  }

  /**
   * Scan characters until a specific character is found
   */
  private scanUntilChar(endChar: string): string {
    let value = '';
    while (!this.isEOF() && this.peek() !== endChar) {
      value += this.advance();
    }
    return value;
  }

  /**
   * Scan consecutive digit characters
   */
  private scanDigits(): string {
    let digits = '';
    while (!this.isEOF() && this.isDigit(this.peek())) {
      digits += this.advance();
    }
    return digits;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (
      (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_' || char === '$'
    );
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
  }

  /**
   * Try to match a keyword at the current position
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
   * Determine if we should scan a decimal point as part of a number
   */
  private shouldScanDecimal(): boolean {
    return this.lastTokenType !== TokenType.SEP;
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
   * Create a token with the given type, value, and location
   */
  private createToken(type: TokenType, value: string, start: Position): Token {
    return {
      type,
      value,
      loc: {
        start,
        end: this.getPosition(),
      },
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
}
