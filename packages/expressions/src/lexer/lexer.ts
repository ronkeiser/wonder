import { LexerError } from './lexer-error';
import type { SourcePosition, Token } from './token';
import { TokenType } from './token-types';

/**
 * Lexer for expression syntax
 *
 * Tokenizes a safe subset of JavaScript expression syntax.
 */
export class Lexer {
  private input: string = '';
  private position: number = 0;
  private line: number = 1;
  private column: number = 0;

  /**
   * Tokenize an expression string
   */
  tokenize(input: string): Token[] {
    this.input = input;
    this.position = 0;
    this.line = 1;
    this.column = 0;

    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespace();
      if (this.isAtEnd()) break;

      const token = this.nextToken();
      tokens.push(token);
    }

    tokens.push(this.makeToken(TokenType.EOF, ''));
    return tokens;
  }

  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.input[this.position];
  }

  private peekNext(): string {
    if (this.position + 1 >= this.input.length) return '\0';
    return this.input[this.position + 1];
  }

  private advance(): string {
    const char = this.input[this.position];
    this.position++;
    if (char === '\n') {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }
    return char;
  }

  private currentPosition(): SourcePosition {
    return {
      line: this.line,
      column: this.column,
      offset: this.position,
    };
  }

  private makeToken(type: TokenType, value: string, startPos?: SourcePosition): Token {
    const start = startPos || this.currentPosition();
    const end = this.currentPosition();
    return {
      type,
      value,
      loc: { start, end },
    };
  }

  private error(message: string): never {
    throw new LexerError(message, this.input, this.currentPosition());
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        this.advance();
      } else {
        break;
      }
    }
  }

  private nextToken(): Token {
    const start = this.currentPosition();
    const char = this.peek();

    // String literals
    if (char === '"' || char === "'") {
      return this.string(char, start);
    }

    // Numbers
    if (this.isDigit(char)) {
      return this.number(start);
    }

    // Identifiers and keywords
    if (this.isAlpha(char)) {
      return this.identifier(start);
    }

    // Operators and punctuation
    return this.operator(start);
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_' || char === '$';
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private string(quote: string, start: SourcePosition): Token {
    this.advance(); // consume opening quote
    let value = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        if (this.isAtEnd()) {
          this.error('Unterminated string literal');
        }
        const escaped = this.advance();
        switch (escaped) {
          case 'n':
            value += '\n';
            break;
          case 't':
            value += '\t';
            break;
          case 'r':
            value += '\r';
            break;
          case '\\':
            value += '\\';
            break;
          case "'":
            value += "'";
            break;
          case '"':
            value += '"';
            break;
          default:
            value += escaped;
        }
      } else if (this.peek() === '\n') {
        this.error('Unterminated string literal');
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      this.error('Unterminated string literal');
    }

    this.advance(); // consume closing quote
    return this.makeToken(TokenType.STRING, value, start);
  }

  private number(start: SourcePosition): Token {
    let value = '';

    // Integer part
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      value += this.advance();
    }

    // Decimal part
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance(); // consume '.'
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    return this.makeToken(TokenType.NUMBER, value, start);
  }

  private identifier(start: SourcePosition): Token {
    let value = '';

    while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }

    // Check for keywords
    switch (value) {
      case 'true':
      case 'false':
        return this.makeToken(TokenType.BOOLEAN, value, start);
      case 'null':
        return this.makeToken(TokenType.NULL, value, start);
      // Forbidden keywords
      case 'function':
        this.error('Function definitions are not allowed');
      case 'this':
        this.error("The 'this' keyword is not allowed");
      case 'new':
        this.error("The 'new' keyword is not allowed");
      case 'for':
      case 'while':
      case 'do':
        this.error('Loops are not allowed');
      case 'var':
      case 'let':
      case 'const':
        this.error('Variable declarations are not allowed');
      case 'class':
        this.error('Class definitions are not allowed');
      case 'async':
      case 'await':
        this.error('Async/await is not allowed');
      case 'yield':
        this.error('Generators are not allowed');
      case 'import':
      case 'export':
        this.error('Import/export is not allowed');
      case 'delete':
        this.error("The 'delete' keyword is not allowed");
      case 'typeof':
        this.error("The 'typeof' keyword is not allowed; use type() function");
      case 'instanceof':
        this.error("The 'instanceof' keyword is not allowed");
      case 'void':
        this.error("The 'void' keyword is not allowed");
      case 'in':
        this.error("The 'in' keyword is not allowed; use includes() or has()");
      default:
        return this.makeToken(TokenType.IDENTIFIER, value, start);
    }
  }

  private operator(start: SourcePosition): Token {
    const char = this.advance();

    switch (char) {
      // Single-character tokens
      case '(':
        return this.makeToken(TokenType.LPAREN, char, start);
      case ')':
        return this.makeToken(TokenType.RPAREN, char, start);
      case '[':
        return this.makeToken(TokenType.LBRACKET, char, start);
      case ']':
        return this.makeToken(TokenType.RBRACKET, char, start);
      case '{':
        return this.makeToken(TokenType.LBRACE, char, start);
      case '}':
        return this.makeToken(TokenType.RBRACE, char, start);
      case ',':
        return this.makeToken(TokenType.COMMA, char, start);
      case ':':
        return this.makeToken(TokenType.COLON, char, start);
      case '?':
        return this.makeToken(TokenType.QUESTION, char, start);
      case '+':
        if (this.peek() === '+') {
          this.error('Increment operator (++) is not allowed');
        }
        if (this.peek() === '=') {
          this.error('Assignment is not allowed');
        }
        return this.makeToken(TokenType.PLUS, char, start);
      case '-':
        if (this.peek() === '-') {
          this.error('Decrement operator (--) is not allowed');
        }
        if (this.peek() === '=') {
          this.error('Assignment is not allowed');
        }
        return this.makeToken(TokenType.MINUS, char, start);
      case '*':
        if (this.peek() === '=') {
          this.error('Assignment is not allowed');
        }
        return this.makeToken(TokenType.STAR, char, start);
      case '/':
        if (this.peek() === '=') {
          this.error('Assignment is not allowed');
        }
        return this.makeToken(TokenType.SLASH, char, start);
      case '%':
        if (this.peek() === '=') {
          this.error('Assignment is not allowed');
        }
        return this.makeToken(TokenType.PERCENT, char, start);

      // Dot or spread
      case '.':
        if (this.peek() === '.' && this.peekNext() === '.') {
          this.advance(); // consume second .
          this.advance(); // consume third .
          return this.makeToken(TokenType.SPREAD, '...', start);
        }
        return this.makeToken(TokenType.DOT, char, start);

      // Comparison and equality
      case '>':
        if (this.peek() === '=') {
          this.advance();
          return this.makeToken(TokenType.GTE, '>=', start);
        }
        return this.makeToken(TokenType.GT, char, start);

      case '<':
        if (this.peek() === '=') {
          this.advance();
          return this.makeToken(TokenType.LTE, '<=', start);
        }
        return this.makeToken(TokenType.LT, char, start);

      case '=':
        if (this.peek() === '=' && this.peekNext() === '=') {
          this.advance();
          this.advance();
          return this.makeToken(TokenType.EQ, '===', start);
        }
        if (this.peek() === '>') {
          this.error('Arrow functions are not allowed');
        }
        this.error('Assignment is not allowed');

      case '!':
        if (this.peek() === '=' && this.peekNext() === '=') {
          this.advance();
          this.advance();
          return this.makeToken(TokenType.NEQ, '!==', start);
        }
        return this.makeToken(TokenType.NOT, char, start);

      // Logical operators
      case '&':
        if (this.peek() === '&') {
          this.advance();
          return this.makeToken(TokenType.AND, '&&', start);
        }
        this.error("Invalid operator '&'. Use '&&' for logical AND");

      case '|':
        if (this.peek() === '|') {
          this.advance();
          return this.makeToken(TokenType.OR, '||', start);
        }
        this.error("Invalid operator '|'. Use '||' for logical OR");

      default:
        this.error(`Unexpected character '${char}'`);
    }
  }
}
