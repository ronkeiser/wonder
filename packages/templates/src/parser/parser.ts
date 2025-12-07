import { Lexer } from '../lexer/lexer';
import type { SourceLocation, Token } from '../lexer/token';
import { TokenType } from '../lexer/token-types';
import type {
  BlockStatement,
  BooleanLiteral,
  CommentStatement,
  ContentStatement,
  Expression,
  Hash,
  MustacheStatement,
  Node,
  NullLiteral,
  NumberLiteral,
  PathExpression,
  Program,
  Statement,
  StringLiteral,
  SubExpression,
  UndefinedLiteral,
} from './ast-nodes';
import { ParserError } from './parser-error';

/**
 * Parser for Handlebars-compatible templates
 *
 * Transforms token streams from the lexer into an Abstract Syntax Tree (AST)
 * following the Handlebars AST specification for compatibility.
 *
 * ## Location Tracking Patterns
 *
 * The parser uses two patterns for tracking source locations in AST nodes:
 *
 * 1. **Simple nodes** (leaf nodes that don't parse child nodes):
 *    - Call `startNode()` at the beginning to save the current token
 *    - Create and populate the node
 *    - Call `finishNode(node)` to attach location info
 *
 * 2. **Composite nodes** (nodes that call other parse methods):
 *    - Save the starting token manually: `const startToken = this.currentToken`
 *    - Parse child nodes (which will use startNode/finishNode internally)
 *    - Use `getSourceLocation(startToken, endToken)` to create location manually
 *    - This avoids conflicts since child parsers clear the shared `startToken` field
 */
export class Parser {
  private lexer: Lexer;
  private tokens: Token[] = [];
  private currentToken: Token | null = null;
  private position: number = 0;
  private startToken: Token | null = null;

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
   * Check if we're at an {{else}} clause
   * {{else}} is tokenized as OPEN + ID("else") + CLOSE
   *
   * @returns True if current position is at {{else}}
   */
  private isAtElse(): boolean {
    if (!this.match(TokenType.OPEN)) {
      return false;
    }

    const nextToken = this.peek(1);
    const closeToken = this.peek(2);

    return (
      nextToken !== null &&
      nextToken.type === TokenType.ID &&
      nextToken.value === 'else' &&
      closeToken !== null &&
      closeToken.type === TokenType.CLOSE
    );
  }

  /**
   * Consume an {{else}} clause
   * Advances past OPEN + ID("else") + CLOSE tokens
   *
   * @throws {ParserError} If not currently at {{else}}
   */
  private consumeElse(): void {
    if (!this.isAtElse()) {
      throw ParserError.fromToken(
        'Expected {{else}} clause',
        this.currentToken!,
        this.getErrorContext(),
      );
    }

    // Consume OPEN token
    this.advance();
    // Consume ID("else") token
    this.advance();
    // Consume CLOSE token
    this.advance();
  }

  /**
   * Parse a path segment, which can be an identifier or a numeric literal
   * This allows both {{obj.prop}} and {{array.0}}
   *
   * @returns The segment token (ID or NUMBER)
   */
  private parsePathSegment(): Token {
    if (this.match(TokenType.ID) || this.match(TokenType.NUMBER)) {
      return this.currentToken!;
    }
    throw ParserError.fromToken(
      'Expected identifier or number after path separator',
      this.currentToken!,
      this.getErrorContext(),
    );
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

  /**
   * Create a SourceLocation from one or two tokens
   *
   * Used by composite nodes that manually track location tokens instead of
   * using startNode()/finishNode(). See class-level documentation for pattern details.
   *
   * @param startToken - Token marking the start of the location
   * @param endToken - Optional token marking the end (defaults to startToken)
   * @returns SourceLocation spanning from start to end
   */
  getSourceLocation(startToken: Token, endToken?: Token): SourceLocation {
    const end = endToken || startToken;
    return {
      start: startToken.loc.start,
      end: end.loc.end,
    };
  }

  /**
   * Mark the start of parsing a node
   *
   * Saves the current token for later use in finishNode(). Only use this pattern
   * for simple nodes that don't call other parse methods. For composite nodes,
   * manually save the token and use getSourceLocation() instead.
   * See class-level documentation for pattern details.
   */
  startNode(): void {
    this.startToken = this.currentToken;
  }

  /**
   * Complete a node with location information
   *
   * Sets the node's loc property based on saved start token and current token,
   * then clears the saved start token. Only use with startNode() for simple nodes.
   * For composite nodes, use getSourceLocation() manually instead.
   * See class-level documentation for pattern details.
   *
   * @param node - The node to complete with location
   * @returns The node with location added
   */
  finishNode<T extends Node>(node: T): T {
    if (this.startToken && this.currentToken) {
      node.loc = this.getSourceLocation(this.startToken, this.currentToken);
    } else if (this.startToken) {
      node.loc = this.getSourceLocation(this.startToken);
    } else {
      node.loc = null;
    }
    this.startToken = null;
    return node;
  }

  /**
   * Parse a content statement (plain text)
   *
   * @returns ContentStatement node
   * @throws {ParserError} If current token is not CONTENT
   */
  parseContentStatement(): ContentStatement {
    this.startNode();
    const token = this.expect(TokenType.CONTENT);

    const node: ContentStatement = {
      type: 'ContentStatement',
      value: token.value,
      original: token.value,
      loc: null,
    };

    this.advance(); // Move past CONTENT token
    return this.finishNode(node);
  }

  /**
   * Parse a comment statement
   * Handles both {{! comment }} and {{!-- comment --}} syntax
   *
   * @returns CommentStatement node
   * @throws {ParserError} If current token is not COMMENT
   */
  parseCommentStatement(): CommentStatement {
    this.startNode();
    const token = this.expect(TokenType.COMMENT);

    // Extract comment text without delimiters
    // COMMENT tokens include the full comment with {{! }} or {{!-- --}}
    let value = token.value;

    // Strip {{! and }}
    if (value.startsWith('{{!--') && value.endsWith('--}}')) {
      // Block comment: {{!-- text --}}
      value = value.slice(5, -4);
    } else if (value.startsWith('{{!') && value.endsWith('}}')) {
      // Regular comment: {{! text }}
      value = value.slice(3, -2);
    }

    const node: CommentStatement = {
      type: 'CommentStatement',
      value: value,
      loc: null,
    };

    this.advance(); // Move past COMMENT token
    return this.finishNode(node);
  }

  /**
   * Parse additional path segments after an initial segment
   * Helper method to reduce code duplication in path expression parsing
   *
   * @param parts - Array to append parsed segments to
   * @param original - String to append parsed segments to (with dot notation)
   * @returns Object with updated parts and original strings
   */
  private parsePathSegments(
    parts: string[],
    original: string,
  ): { parts: string[]; original: string } {
    while (this.currentToken && this.match(TokenType.SEP)) {
      this.advance(); // Move past SEP token

      const segmentToken = this.parsePathSegment();
      parts.push(segmentToken.value);
      original += '.' + segmentToken.value;
      this.advance(); // Move past segment token
    }

    return { parts, original };
  }

  /**
   * Parse a data variable path (@variable)
   * Handles @index, @root, @root.user, etc.
   *
   * @returns PathExpression node for data variable
   */
  private parseDataVariablePath(): PathExpression {
    let parts: string[] = [];
    let original = '@';
    this.advance(); // Move past DATA token

    // After @, we must have an identifier
    const dataVarToken = this.expect(TokenType.ID, 'Expected identifier after @ in data variable');
    parts.push(dataVarToken.value);
    original += dataVarToken.value;
    this.advance(); // Move past ID token

    // Parse additional path segments (e.g., @root.user)
    const result = this.parsePathSegments(parts, original);
    parts = result.parts;
    original = result.original;

    const node: PathExpression = {
      type: 'PathExpression',
      data: true,
      depth: 0, // Data variables always have depth 0
      parts: parts,
      original: original,
      loc: null,
    };

    return this.finishNode(node);
  }

  /**
   * Parse a 'this' path (this, this.foo, etc.)
   *
   * @returns PathExpression node for 'this' path
   */
  private parseThisPath(): PathExpression {
    let parts: string[] = [];
    let original = 'this';
    this.advance(); // Move past 'this'

    // Check if there's a path after 'this'
    if (this.currentToken && this.match(TokenType.SEP)) {
      this.advance(); // Move past SEP

      const segmentToken = this.parsePathSegment();
      parts.push(segmentToken.value);
      original += '.' + segmentToken.value;
      this.advance();

      // Parse additional segments
      const result = this.parsePathSegments(parts, original);
      parts = result.parts;
      original = result.original;
    }
    // else: {{this}} alone - parts remains empty

    const node: PathExpression = {
      type: 'PathExpression',
      data: false,
      depth: 0,
      parts: parts, // Empty for {{this}}, or ['foo'] for {{this.foo}}
      original: original,
      loc: null,
    };

    return this.finishNode(node);
  }

  /**
   * Parse a current context path (., ./foo, etc.)
   *
   * @returns PathExpression node for current context path
   */
  private parseCurrentContextPath(): PathExpression {
    let parts: string[] = [];
    let original = '.';
    this.advance(); // Move past '.'

    // Check if there's a path after '.'
    if (this.currentToken && this.match(TokenType.SEP)) {
      this.advance(); // Move past SEP

      const segmentToken = this.parsePathSegment();
      parts.push(segmentToken.value);
      original += '/' + segmentToken.value; // Use slash for ./ syntax
      this.advance();

      // Parse additional segments
      const result = this.parsePathSegments(parts, original);
      parts = result.parts;
      original = result.original;
    }
    // else: {{.}} alone - parts remains empty

    const node: PathExpression = {
      type: 'PathExpression',
      data: false,
      depth: 0,
      parts: parts, // Empty for {{.}}, or ['foo'] for {{./foo}}
      original: original,
      loc: null,
    };

    return this.finishNode(node);
  }

  /**
   * Parse a parent reference path (.., ../foo, ../../bar, etc.)
   *
   * @returns PathExpression node for parent path
   */
  private parseParentPath(): PathExpression {
    let depth = 0;
    let parts: string[] = [];
    let original = '';

    // Count consecutive .. segments to calculate depth
    while (this.currentToken && this.match(TokenType.ID) && this.currentToken.value === '..') {
      depth++;
      original += this.currentToken.value; // Add ".."
      this.advance(); // Move past ..

      // Check for separator after ..
      if (this.currentToken && this.match(TokenType.SEP)) {
        original += '/'; // Use slash as that's what lexer uses between .. segments
        this.advance(); // Move past SEP
      }
    }

    // Parse remaining path segments after .. (if any)
    if (this.currentToken && this.match(TokenType.ID)) {
      parts.push(this.currentToken.value);
      original += this.currentToken.value;
      this.advance();

      // Parse additional segments
      const result = this.parsePathSegments(parts, original);
      parts = result.parts;
      original = result.original;
    }

    const node: PathExpression = {
      type: 'PathExpression',
      data: false,
      depth: depth,
      parts: parts,
      original: original,
      loc: null,
    };

    return this.finishNode(node);
  }

  /**
   * Parse a simple path (foo, foo.bar, foo.bar.baz)
   *
   * @param firstToken - The first token of the path
   * @returns PathExpression node for simple path
   */
  private parseSimplePath(firstToken: Token): PathExpression {
    let parts: string[] = [firstToken.value];
    let original = firstToken.value;
    this.advance(); // Move past first ID

    // Parse additional path segments (dot/slash notation)
    const result = this.parsePathSegments(parts, original);
    parts = result.parts;
    original = result.original;

    const node: PathExpression = {
      type: 'PathExpression',
      data: false,
      depth: 0,
      parts: parts,
      original: original,
      loc: null,
    };

    return this.finishNode(node);
  }

  /**
   * Parse a path expression (variable path)
   * Handles simple paths, parent references, data variables, and special paths:
   * - Simple: foo, foo.bar, foo.bar.baz
   * - Parent: ../parent, ../../grandparent, ../foo.bar
   * - Data: @index, @root.user
   * - Special: this, this.foo, ./foo, .
   *
   * @returns PathExpression node
   * @throws {ParserError} If path is invalid or malformed
   */
  /**
   * Parse an expression (can be a literal or a path)
   * Used for parsing block parameters and mustache arguments
   *
   * @returns Expression node (literal or path)
   * @throws {ParserError} If expression is invalid
   */
  parseExpression(): Expression {
    if (!this.currentToken) {
      throw new ParserError('Unexpected end of input while parsing expression', null);
    }

    // Dispatch based on token type
    switch (this.currentToken.type) {
      case TokenType.STRING:
        return this.parseStringLiteral();
      case TokenType.NUMBER:
        return this.parseNumberLiteral();
      case TokenType.BOOLEAN:
        return this.parseBooleanLiteral();
      case TokenType.NULL:
        return this.parseNullLiteral();
      case TokenType.UNDEFINED:
        return this.parseUndefinedLiteral();
      case TokenType.ID:
      case TokenType.DATA:
        return this.parsePathExpression();
      case TokenType.OPEN_SEXPR:
        return this.parseSubExpression();
      default:
        throw ParserError.fromToken(
          `Unexpected token ${this.currentToken.type} while parsing expression`,
          this.currentToken,
          this.getErrorContext(),
        );
    }
  }

  /**
   * Parse a string literal
   */
  parseStringLiteral(): StringLiteral {
    const token = this.expect(TokenType.STRING, 'Expected string literal');
    const loc = this.getSourceLocation(token, token);
    this.advance();

    return {
      type: 'StringLiteral',
      value: token.value,
      original: `"${token.value}"`, // Reconstruct with quotes
      loc,
    };
  }

  /**
   * Parse a number literal
   */
  parseNumberLiteral(): NumberLiteral {
    const token = this.expect(TokenType.NUMBER, 'Expected number literal');
    const loc = this.getSourceLocation(token, token);
    this.advance();

    return {
      type: 'NumberLiteral',
      value: parseFloat(token.value),
      original: token.value,
      loc,
    };
  }

  /**
   * Parse a boolean literal
   */
  parseBooleanLiteral(): BooleanLiteral {
    const token = this.expect(TokenType.BOOLEAN, 'Expected boolean literal');
    const loc = this.getSourceLocation(token, token);
    this.advance();

    return {
      type: 'BooleanLiteral',
      value: token.value === 'true',
      original: token.value,
      loc,
    };
  }

  /**
   * Parse a null literal
   */
  parseNullLiteral(): NullLiteral {
    const token = this.expect(TokenType.NULL, 'Expected null literal');
    const loc = this.getSourceLocation(token, token);
    this.advance();

    return {
      type: 'NullLiteral',
      value: null,
      original: 'null',
      loc,
    };
  }

  /**
   * Parse an undefined literal
   */
  parseUndefinedLiteral(): UndefinedLiteral {
    const token = this.expect(TokenType.UNDEFINED, 'Expected undefined literal');
    const loc = this.getSourceLocation(token, token);
    this.advance();

    return {
      type: 'UndefinedLiteral',
      value: undefined,
      original: 'undefined',
      loc,
    };
  }

  /**
   * Parse a SubExpression (nested helper call)
   * Syntax: (helperName param1 param2 ...)
   *
   * SubExpressions allow helper calls to be nested within other expressions.
   * For example: {{#if (gt score 80)}}...{{/if}}
   * Here (gt score 80) is a SubExpression that calls the 'gt' helper.
   *
   * @returns SubExpression node
   * @throws {ParserError} If SubExpression is malformed or unclosed
   */
  parseSubExpression(): SubExpression {
    // Save start token for location tracking
    const startToken = this.currentToken;

    // Expect opening parenthesis
    this.expect(TokenType.OPEN_SEXPR, 'Expected opening parenthesis for subexpression');
    this.advance();

    // Parse helper name (must be a path expression)
    if (!this.currentToken) {
      throw ParserError.fromToken(
        'Unexpected end of input while parsing subexpression helper name',
        startToken,
        this.getErrorContext(),
      );
    }

    if (!this.match(TokenType.ID) && !this.match(TokenType.DATA)) {
      throw ParserError.fromToken(
        `Expected helper name in subexpression, got ${this.currentToken?.type}`,
        this.currentToken,
        this.getErrorContext(),
      );
    }

    const path = this.parsePathExpression();

    // Parse parameters (can include literals, paths, or nested subexpressions)
    const params: Expression[] = [];
    while (this.currentToken && !this.match(TokenType.CLOSE_SEXPR)) {
      // Check for valid expression token
      const validTypes = [
        TokenType.STRING,
        TokenType.NUMBER,
        TokenType.BOOLEAN,
        TokenType.NULL,
        TokenType.UNDEFINED,
        TokenType.ID,
        TokenType.DATA,
        TokenType.OPEN_SEXPR,
      ];

      const isValidToken = validTypes.some((type) => this.match(type));
      if (!isValidToken) {
        // If we hit a block-ending token, the subexpression is likely unclosed
        const isBlockEnd =
          this.match(TokenType.CLOSE) ||
          this.match(TokenType.INVERSE) ||
          this.match(TokenType.OPEN_ENDBLOCK);
        const message = isBlockEnd
          ? `Unclosed subexpression for helper '${path.original}' - expected closing parenthesis`
          : `Unexpected token ${this.currentToken.type} in subexpression parameters`;
        throw ParserError.fromToken(message, this.currentToken, this.getErrorContext());
      }

      params.push(this.parseExpression());
    }

    // Expect closing parenthesis
    if (!this.currentToken) {
      throw ParserError.fromToken(
        `Unclosed subexpression for helper '${path.original}'`,
        startToken,
        this.getErrorContext(),
      );
    }

    const endToken = this.expect(
      TokenType.CLOSE_SEXPR,
      'Expected closing parenthesis for subexpression',
    );
    this.advance();

    // Create empty hash (V1 doesn't support named parameters in subexpressions)
    const hash: Hash = {
      type: 'Hash',
      pairs: [],
      loc: null,
    };

    const loc = startToken ? this.getSourceLocation(startToken, endToken) : null;

    return {
      type: 'SubExpression',
      path,
      params,
      hash,
      loc,
    };
  }

  parsePathExpression(): PathExpression {
    this.startNode();

    // Check for data variable (@)
    if (this.currentToken && this.match(TokenType.DATA)) {
      return this.parseDataVariablePath();
    }

    // Expect at least one identifier to start the path
    const firstToken = this.expect(TokenType.ID, 'Expected identifier to start path expression');

    // Dispatch to specialized parsers based on first token
    if (firstToken.value === 'this') {
      return this.parseThisPath();
    }

    if (firstToken.value === '.') {
      return this.parseCurrentContextPath();
    }

    if (firstToken.value === '..') {
      return this.parseParentPath();
    }

    // Simple path (no special syntax)
    return this.parseSimplePath(firstToken);
  }

  /**
   * Parse a mustache statement (variable output)
   * Handles both escaped {{foo}} and unescaped {{{foo}}} syntax
   *
   * @returns MustacheStatement node
   * @throws {ParserError} If mustache is malformed or has mismatched closing
   */
  parseMustacheStatement(): MustacheStatement {
    /**
     * Save the mustache opening token for location tracking.
     * We can't use startNode()/finishNode() because parsePathExpression()
     * calls finishNode() internally, which would clear this.startToken.
     * This is a deliberate pattern for composite nodes that parse child nodes.
     */
    const mustacheStartToken = this.currentToken;

    // Determine if this is escaped or unescaped output
    let escaped: boolean;
    if (this.match(TokenType.OPEN)) {
      escaped = true;
      this.advance(); // Move past OPEN token
    } else if (this.match(TokenType.OPEN_UNESCAPED)) {
      escaped = false;
      this.advance(); // Move past OPEN_UNESCAPED token
    } else {
      throw ParserError.fromToken(
        'Expected OPEN or OPEN_UNESCAPED token to start mustache statement',
        this.currentToken!,
        this.getErrorContext(),
      );
    }

    // Parse the path expression inside the mustache
    const path = this.parsePathExpression();

    // Parse parameters until we hit closing delimiter
    const params: Expression[] = [];
    const closeType = escaped ? TokenType.CLOSE : TokenType.CLOSE_UNESCAPED;

    while (this.currentToken && !this.match(closeType)) {
      const param = this.parseExpression();
      params.push(param);
    }

    // Expect appropriate closing delimiter and capture the closing token
    const closeToken = escaped
      ? this.expect(TokenType.CLOSE, 'Expected }} to close mustache statement')
      : this.expect(
          TokenType.CLOSE_UNESCAPED,
          'Expected }}} to close unescaped mustache statement',
        );

    // Create empty hash for V1 (no named parameters support)
    const hash = {
      type: 'Hash' as const,
      pairs: [],
      loc: null,
    };

    // mustacheStartToken is guaranteed non-null because we checked at method entry
    // closeToken is guaranteed non-null because expect() throws if token doesn't exist
    const loc = mustacheStartToken ? this.getSourceLocation(mustacheStartToken, closeToken) : null;

    const node: MustacheStatement = {
      type: 'MustacheStatement',
      path: path,
      params: params,
      hash: hash, // Empty in V1 - no named parameters support
      escaped: escaped,
      loc: loc,
    };

    this.advance(); // Move past CLOSE or CLOSE_UNESCAPED token
    return node;
  }

  /**
   * Parse the body of a program (main template or block content)
   * Continues until EOF or block terminator (OPEN_ENDBLOCK or INVERSE)
   *
   * @returns Program node containing parsed statements
   */
  parseProgram(blockContext?: { helperName: string; openToken: Token }): Program {
    const programStartToken = this.currentToken;
    const body: Statement[] = [];

    // Parse statements until we hit EOF or a block terminator
    while (this.currentToken && this.currentToken.type !== TokenType.EOF) {
      // Check for block terminators: {{/...}}, {{^...}}, or {{else}}
      if (this.match(TokenType.OPEN_ENDBLOCK) || this.match(TokenType.INVERSE) || this.isAtElse()) {
        break;
      }

      // Dispatch based on token type
      if (this.match(TokenType.CONTENT)) {
        body.push(this.parseContentStatement());
      } else if (this.match(TokenType.COMMENT)) {
        body.push(this.parseCommentStatement());
      } else if (this.match(TokenType.OPEN)) {
        body.push(this.parseMustacheStatement());
      } else if (this.match(TokenType.OPEN_UNESCAPED)) {
        body.push(this.parseMustacheStatement());
      } else if (this.match(TokenType.OPEN_BLOCK)) {
        body.push(this.parseBlockStatement());
      } else {
        // Unexpected token
        throw ParserError.fromToken(
          `Unexpected token ${TokenType[this.currentToken.type]} in program body`,
          this.currentToken,
          this.getErrorContext(),
        );
      }
    }

    // Check if we hit EOF while inside a block (unclosed block error)
    if (blockContext && (!this.currentToken || this.currentToken.type === TokenType.EOF)) {
      const openLine = blockContext.openToken.loc?.start.line || '?';
      throw ParserError.fromToken(
        `Unclosed block: ${blockContext.helperName} opened at line ${openLine} was never closed`,
        blockContext.openToken,
        this.getErrorContext(),
      );
    }

    // Get the last token for location tracking
    // If body is empty, use the start token; otherwise use the previous token
    const endToken =
      body.length > 0 && this.position > 0 ? this.tokens[this.position - 1] : programStartToken;

    const loc =
      programStartToken && endToken ? this.getSourceLocation(programStartToken, endToken) : null;

    const program: Program = {
      type: 'Program',
      body: body,
      loc: loc,
    };

    return program;
  }

  /**
   * Parse a complete template into a Program AST node
   *
   * This is the main entry point for parsing. It parses the entire template
   * and ensures no unexpected tokens remain after parsing completes.
   *
   * @returns Program node representing the entire template
   * @throws {ParserError} If there are unexpected tokens after the template
   */
  parse(): Program {
    const program = this.parseProgram();

    // After parsing the program, we should be at EOF
    // If not, there are unexpected tokens after the template
    if (this.currentToken && this.currentToken.type !== TokenType.EOF) {
      throw ParserError.fromToken(
        'Unexpected content after template',
        this.currentToken,
        this.getErrorContext(),
      );
    }

    return program;
  }

  /**
   * Static convenience method to parse a template string
   *
   * Creates a Lexer and Parser internally, parses the template,
   * and returns the AST. Useful for one-off parsing operations.
   *
   * @param template - The template string to parse
   * @returns Program node representing the parsed template
   * @throws {ParserError} If the template is malformed
   *
   * @example
   * ```typescript
   * const ast = Parser.parse('Hello {{name}}!');
   * ```
   */
  static parse(template: string): Program {
    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    return parser.parse();
  }

  /**
   * Parse a block statement (block helper)
   * Handles {{#helper}}...{{/helper}} syntax with optional {{else}} blocks
   *
   * @returns BlockStatement node
   * @throws {ParserError} If block is malformed or has mismatched closing tag
   */
  parseBlockStatement(): BlockStatement {
    // Save the opening token for location tracking
    const blockStartToken = this.currentToken;

    // Expect and consume OPEN_BLOCK token ({{#)
    this.expect(TokenType.OPEN_BLOCK, 'Expected {{# to start block statement');
    this.advance();

    // Parse the helper name (path expression)
    const helperName = this.parsePathExpression();

    // Parse parameters until we hit CLOSE token
    const params: Expression[] = [];
    let firstParam: string | null = null; // For error messages

    while (this.currentToken && !this.match(TokenType.CLOSE)) {
      const param = this.parseExpression();
      params.push(param);

      // Capture first parameter for error messages
      if (firstParam === null) {
        if (param.type === 'PathExpression') {
          firstParam = param.original;
        } else if ('original' in param) {
          firstParam = param.original;
        }
      }
    }

    // Expect CLOSE token (}})
    this.expect(TokenType.CLOSE, 'Expected }} after block helper name');
    this.advance();

    // Build block identifier for error messages
    const blockIdentifier = firstParam
      ? `{{#${helperName.original} ${firstParam}}}`
      : `{{#${helperName.original}}}`;

    // Parse the main block content
    const program = this.parseProgram({
      helperName: blockIdentifier,
      openToken: blockStartToken!,
    });

    // Check if there's an else block
    // {{else}} is tokenized as OPEN + ID("else") + CLOSE
    // {{^}} is tokenized as INVERSE
    let inverse: Program | null = null;
    if (this.isAtElse()) {
      // Consume the {{else}} tokens (OPEN + ID + CLOSE)
      this.consumeElse();

      // Parse the inverse block content
      inverse = this.parseProgram({
        helperName: blockIdentifier,
        openToken: blockStartToken!,
      });
    } else if (this.match(TokenType.INVERSE)) {
      // Consume the INVERSE token ({{^}})
      this.advance();

      // Parse the inverse block content
      inverse = this.parseProgram({
        helperName: blockIdentifier,
        openToken: blockStartToken!,
      });
    }

    // Expect OPEN_ENDBLOCK token ({{/)
    this.expect(
      TokenType.OPEN_ENDBLOCK,
      `Expected {{/ to close block started at line ${blockStartToken?.loc?.start.line || '?'}`,
    );
    this.advance();

    // Parse the closing helper name
    const closingNameToken = this.currentToken; // Save for error reporting
    const closingName = this.parsePathExpression();

    // V1: Skip any parameters in closing tag (shouldn't be any, but be safe)
    while (this.currentToken && !this.match(TokenType.CLOSE)) {
      this.advance();
    }

    // Validate that closing name matches opening name
    if (helperName.original !== closingName.original) {
      const openLine = blockStartToken?.loc?.start.line || '?';
      const closeToken = closingNameToken || this.currentToken;
      throw ParserError.fromToken(
        `Block closing tag mismatch: expected {{/${helperName.original}}} but found {{/${closingName.original}}} (block opened at line ${openLine})`,
        closeToken!,
        this.getErrorContext(),
      );
    }

    // Expect final CLOSE token (}})
    const closeToken = this.expect(TokenType.CLOSE, 'Expected }} to close block end tag');
    this.advance();

    // Create empty hash for V1 (no named parameters support)
    const hash = {
      type: 'Hash' as const,
      pairs: [],
      loc: null,
    };

    // Create empty strip flags for V1 (no whitespace control support)
    const stripFlags = {
      open: false,
      close: false,
    };

    // Build location spanning entire block
    const loc = blockStartToken ? this.getSourceLocation(blockStartToken, closeToken) : null;

    const node: BlockStatement = {
      type: 'BlockStatement',
      path: helperName,
      params: params,
      hash: hash, // Empty in V1 - no named parameters support
      program: program,
      inverse: inverse, // Set to parsed inverse block if {{else}} was present
      openStrip: stripFlags, // V2 feature
      inverseStrip: stripFlags, // V2 feature
      closeStrip: stripFlags, // V2 feature
      loc: loc,
    };

    return node;
  }
}
