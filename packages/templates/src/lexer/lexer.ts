import { LexerError } from './lexer-error';
import type { Position, Token } from './token';
import { TokenType } from './token-types';

/**
 * Lexer states for template scanning
 */
const STATE_CONTENT = 0; // Scanning plain text content
const STATE_MUSTACHE = 1; // Inside mustache delimiters ({{...}})

/**
 * Number of characters to mark as escaped when processing \{{ or \}}
 * This covers the backslash escape plus the two delimiter chars
 */
const ESCAPED_CHARS_COUNT = 3;

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

      // Not a backslash or at end - copy as-is
      if (char !== '\\' || i + 1 >= template.length) {
        processedInput += char;
        i++;
        continue;
      }

      const next = template[i + 1];

      // \{{ or \}} - escape mustache delimiters
      if (next === '{' || next === '}') {
        this.markEscapedSequence(escapedIndices, processedInput.length);
        processedInput += next;
        i += 2;
        continue;
      }

      // \\{{ - backslash before mustache (output \, then process {{)
      if (this.isBackslashBeforeMustache(template, i, next)) {
        processedInput += '\\';
        i += 2;
        continue;
      }

      // Not an escape sequence - keep backslash
      processedInput += char;
      i++;
    }

    return { processedInput, escapedIndices };
  }

  /**
   * Mark a sequence of characters as escaped in the indices set
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

    // Try to scan opening mustache delimiters
    const openingToken = this.tryScanOpeningMustache();
    if (openingToken) {
      return openingToken;
    }

    // Try to scan closing mustache delimiters
    const closingToken = this.tryScanClosingMustache();
    if (closingToken) {
      return closingToken;
    }

    // If we're inside a mustache, scan mustache-specific tokens
    if (this.state === STATE_MUSTACHE) {
      return this.scanMustacheToken();
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
   * Try to scan an opening mustache delimiter ({{{, {{#, {{/, {{^, {{&, {{!, {{)
   * Returns the token if matched, null otherwise
   */
  private tryScanOpeningMustache(): Token | null {
    // Check for triple braces first (more specific)
    if (this.match('{{{') && !this.isEscaped(this.index)) {
      this.state = STATE_MUSTACHE;
      return this.scanDelimiter(TokenType.OPEN_UNESCAPED, '{{{');
    }

    // Check for double braces
    if (this.match('{{') && !this.isEscaped(this.index)) {
      const nextChar = this.peekAt(2);

      // Comments are handled specially (they don't enter mustache state the same way)
      if (nextChar === '!') {
        return this.scanComment();
      }

      this.state = STATE_MUSTACHE;

      // Map next character to token type and delimiter
      switch (nextChar) {
        case '&':
          return this.scanDelimiter(TokenType.OPEN_RAW, '{{&');
        case '#':
          return this.scanDelimiter(TokenType.OPEN_BLOCK, '{{#');
        case '/':
          return this.scanDelimiter(TokenType.OPEN_ENDBLOCK, '{{/');
        case '^':
          return this.scanDelimiter(TokenType.OPEN_INVERSE, '{{^');
        default:
          return this.scanDelimiter(TokenType.OPEN, '{{');
      }
    }

    return null;
  }

  /**
   * Try to scan a closing mustache delimiter (}}} or }})
   * Returns the token if matched, null otherwise
   */
  private tryScanClosingMustache(): Token | null {
    // Check for triple braces first (more specific)
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
   * Handles strings, data, paths, subexpressions, numbers, keywords, and identifiers
   */
  private scanMustacheToken(): Token {
    const char = this.peek();

    // String literals
    if (char === '"' || char === "'") {
      return this.scanString();
    }

    // Data prefix (@)
    if (char === '@') {
      return this.scanData();
    }

    // Dot handling (. or .. as identifier, or . as separator)
    if (char === '.') {
      return this.handleDot();
    }

    // Slash separator
    if (char === '/') {
      return this.scanSeparator();
    }

    // Subexpression delimiters
    if (char === '(') {
      return this.scanDelimiter(TokenType.OPEN_SEXPR, '(');
    }
    if (char === ')') {
      return this.scanDelimiter(TokenType.CLOSE_SEXPR, ')');
    }

    // Equals sign (hash arguments)
    if (char === '=') {
      return this.scanDelimiter(TokenType.EQUALS, '=');
    }

    // Bracket literals [content]
    if (char === '[') {
      return this.scanBracketLiteral();
    }

    // Number literals
    if (this.isDigit(char) || (char === '-' && this.isDigit(this.peekAt(1)))) {
      return this.scanNumber();
    }

    // Keywords (true, false, null, undefined) or identifiers
    if (this.isAlpha(char)) {
      const keyword = this.tryMatchKeyword();
      if (keyword) {
        return keyword;
      }
      return this.scanIdentifier();
    }

    // Whitespace - skip and continue
    if (this.isWhitespace(char)) {
      this.skipWhitespace();
      return this.lexInternal();
    }

    // Unknown character in mustache - advance and try again
    // This handles edge cases like stray characters
    this.advance();
    return this.lexInternal();
  }

  /**
   * Skip whitespace characters and reset token tracking
   */
  private skipWhitespace(): void {
    while (!this.isEOF() && this.isWhitespace(this.peek())) {
      this.advance();
    }
    this.lastTokenType = null;
  }

  /**
   * Scan a delimiter token ({{, }}, {{{, }}}, {{#, {{/, {{^)
   */
  private scanDelimiter(type: TokenType, delimiter: string): Token {
    const start = this.getPosition();
    this.consumeChars(delimiter.length);
    return this.createToken(type, delimiter, start);
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
   * Consume a specific number of characters (used for delimiters)
   */
  private consumeChars(count: number): void {
    for (let i = 0; i < count; i++) {
      this.advance();
    }
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
    return this.createToken(TokenType.SEP, value, start);
  }

  /**
   * Scan a data prefix token (@)
   */
  private scanData(): Token {
    const start = this.getPosition();
    const value = this.advance(); // Consume @
    return this.createToken(TokenType.DATA, value, start);
  }

  /**
   * Scan a special identifier (. or ..)
   * These are identifiers, not separators, when they appear as standalone tokens
   */
  private scanSpecialIdentifier(expected: string): Token {
    const start = this.getPosition();
    this.consumeChars(expected.length);
    return this.createToken(TokenType.ID, expected, start);
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
      // Check for escaped delimiters - these become literal content
      if (this.isEscaped(this.index)) {
        const escapedContent = this.scanEscapedDelimiter();
        if (escapedContent) {
          value += escapedContent;
          continue;
        }
      }

      // Check for non-escaped delimiters (these end content)
      if (this.isUnescapedDelimiter()) {
        break;
      }

      value += this.advance();
    }

    // Handle empty content case (adjacent mustaches)
    // Return null to signal lexInternal should continue
    if (value.length === 0) {
      return null;
    }

    return this.createToken(TokenType.CONTENT, value, start);
  }

  /**
   * Scan an escaped delimiter sequence and return it as literal content
   * Handles \{{{...}}}, \{{...}}, \}}}, \}}
   * Returns the content string or null if not at an escaped delimiter
   */
  private scanEscapedDelimiter(): string | null {
    // Escaped triple opening brace - include through closing
    if (this.match('{{{')) {
      return this.consumeEscapedMustache('{{{', '}}}');
    }

    // Escaped double opening brace - include through closing
    if (this.match('{{')) {
      return this.consumeEscapedMustache('{{', '}}');
    }

    // Escaped closing braces - just include them
    if (this.match('}}}')) {
      return this.consumeDelimiterChars(3);
    }

    if (this.match('}}')) {
      return this.consumeDelimiterChars(2);
    }

    return null;
  }

  /**
   * Consume an escaped mustache expression including its closing delimiter
   * Used for \{{...}} and \{{{...}}} patterns
   */
  private consumeEscapedMustache(openDelim: string, closeDelim: string): string {
    let content = '';

    // Consume opening delimiter
    for (let i = 0; i < openDelim.length; i++) {
      content += this.advance();
    }

    // Scan until we find closing delimiter
    while (!this.isEOF() && !this.match(closeDelim)) {
      content += this.advance();
    }

    // Consume closing delimiter
    if (this.match(closeDelim)) {
      for (let i = 0; i < closeDelim.length; i++) {
        content += this.advance();
      }
    }

    return content;
  }

  /**
   * Consume a specific number of delimiter characters
   */
  private consumeDelimiterChars(count: number): string {
    let content = '';
    for (let i = 0; i < count && this.peek() === '}'; i++) {
      content += this.advance();
    }
    return content;
  }

  /**
   * Check if we're at a non-escaped delimiter ({{ or }})
   */
  private isUnescapedDelimiter(): boolean {
    const isOpen = (this.match('{{{') || this.match('{{')) && !this.isEscaped(this.index);
    const isClose = (this.match('}}}') || this.match('}}')) && !this.isEscaped(this.index);
    return isOpen || isClose;
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
    this.consumeChars(3);

    // Check if it's a block comment {{!--
    const isBlockComment = this.match('--');
    if (isBlockComment) {
      this.consumeChars(2);
    }

    const endSequence = isBlockComment ? '--}}' : '}}';
    const value = this.scanUntilMatch(endSequence);

    // Check for unclosed comment
    if (this.isEOF() && !this.match(endSequence)) {
      throw new LexerError(`Unclosed comment: expected closing '${endSequence}'`, start);
    }

    // Consume the closing sequence
    this.consumeChars(endSequence.length);

    return this.createToken(TokenType.COMMENT, value, start);
  }

  /**
   * Scan characters until a match is found (does not consume the match)
   */
  private scanUntilMatch(endSequence: string): string {
    let value = '';
    while (!this.isEOF() && !this.match(endSequence)) {
      value += this.advance();
    }
    return value;
  }

  /**
   * Scan a bracket literal [content] - preserves all content including spaces
   * Used for paths with special characters: {{[foo bar]}}, {{[@alan]}}
   */
  private scanBracketLiteral(): Token {
    const start = this.getPosition();
    this.advance(); // Consume opening [

    const value = this.scanUntilChar(']');

    // Check for unclosed bracket
    if (this.isEOF()) {
      throw new LexerError('Unclosed bracket literal: expected closing ]', start);
    }

    this.advance(); // Consume closing ]
    return this.createToken(TokenType.BRACKET_LITERAL, value, start);
  }

  /**
   * Scan characters until a specific character is found (does not consume it)
   */
  private scanUntilChar(endChar: string): string {
    let value = '';
    while (!this.isEOF() && this.peek() !== endChar) {
      value += this.advance();
    }
    return value;
  }

  /**
   * Scan a string literal ("text" or 'text')
   */
  private scanString(): Token {
    const start = this.getPosition();
    const quote = this.advance(); // Consume opening quote
    const value = this.scanStringContent(quote);

    // Check for unclosed string
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

    return value;
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
    value += this.scanDigits();

    // Scan decimal part if present and not in path context
    // Paths: {{matrix.0.1}} → ["matrix", "0", "1"]
    // Params: {{helper count=3.14}} → count=3.14
    if (this.shouldScanDecimal() && this.peek() === '.' && this.isDigit(this.peekAt(1))) {
      value += this.advance(); // Consume '.'
      value += this.scanDigits();
    }

    return this.createToken(TokenType.NUMBER, value, start);
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
    this.consumeChars(keyword.length);
    return this.createToken(type, keyword, start);
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

    return this.createToken(TokenType.ID, value, start);
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
