import { Lexer } from '../lexer/lexer';
import type { SourceLocation, Token } from '../lexer/token';
import { TokenType } from '../lexer/token-types';
import type {
  ArrayExpression,
  BinaryExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  Identifier,
  Literal,
  LogicalExpression,
  MemberExpression,
  ObjectExpression,
  Property,
  SpreadElement,
  UnaryExpression,
} from './ast';
import { ParserError } from './parser-error';

/**
 * Recursive descent parser for expression syntax
 *
 * Operator precedence (lowest to highest):
 * 1. Ternary (?:)
 * 2. Logical OR (||)
 * 3. Logical AND (&&)
 * 4. Equality (===, !==)
 * 5. Comparison (>, >=, <, <=)
 * 6. Additive (+, -)
 * 7. Multiplicative (*, /, %)
 * 8. Unary (!, -)
 * 9. Member access (., [])
 * 10. Call (())
 * 11. Primary (literals, identifiers, grouping)
 */
export class Parser {
  private tokens: Token[] = [];
  private current: number = 0;
  private input: string = '';

  /**
   * Parse an expression string into an AST
   */
  parse(input: string): Expression {
    this.input = input;
    const lexer = new Lexer();
    this.tokens = lexer.tokenize(input);
    this.current = 0;

    const expr = this.expression();

    if (!this.isAtEnd()) {
      throw this.error(`Unexpected token '${this.peek().value}'`);
    }

    return expr;
  }

  // Token navigation

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(message);
  }

  private error(message: string): ParserError {
    const token = this.peek();
    return new ParserError(message, this.input, token.loc.start);
  }

  private makeLoc(start: Token, end: Token): SourceLocation {
    return {
      start: start.loc.start,
      end: end.loc.end,
    };
  }

  // Expression parsing - precedence climbing

  private expression(): Expression {
    return this.ternary();
  }

  private ternary(): Expression {
    const startToken = this.peek();
    let expr = this.logicalOr();

    if (this.match(TokenType.QUESTION)) {
      const consequent = this.expression(); // right-associative
      this.consume(TokenType.COLON, "Expected ':' in ternary expression");
      const alternate = this.expression(); // right-associative
      const endToken = this.previous();

      const node: ConditionalExpression = {
        type: 'ConditionalExpression',
        test: expr,
        consequent,
        alternate,
        loc: this.makeLoc(startToken, endToken),
      };
      expr = node;
    }

    return expr;
  }

  private logicalOr(): Expression {
    const startToken = this.peek();
    let left = this.logicalAnd();

    while (this.match(TokenType.OR)) {
      const right = this.logicalAnd();
      const endToken = this.previous();

      const node: LogicalExpression = {
        type: 'LogicalExpression',
        operator: '||',
        left,
        right,
        loc: this.makeLoc(startToken, endToken),
      };
      left = node;
    }

    return left;
  }

  private logicalAnd(): Expression {
    const startToken = this.peek();
    let left = this.equality();

    while (this.match(TokenType.AND)) {
      const right = this.equality();
      const endToken = this.previous();

      const node: LogicalExpression = {
        type: 'LogicalExpression',
        operator: '&&',
        left,
        right,
        loc: this.makeLoc(startToken, endToken),
      };
      left = node;
    }

    return left;
  }

  private equality(): Expression {
    const startToken = this.peek();
    let left = this.comparison();

    while (this.match(TokenType.EQ, TokenType.NEQ)) {
      const operator = this.previous().value as '===' | '!==';
      const right = this.comparison();
      const endToken = this.previous();

      const node: BinaryExpression = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        loc: this.makeLoc(startToken, endToken),
      };
      left = node;
    }

    return left;
  }

  private comparison(): Expression {
    const startToken = this.peek();
    let left = this.additive();

    while (this.match(TokenType.GT, TokenType.GTE, TokenType.LT, TokenType.LTE)) {
      const operator = this.previous().value as '>' | '>=' | '<' | '<=';
      const right = this.additive();
      const endToken = this.previous();

      const node: BinaryExpression = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        loc: this.makeLoc(startToken, endToken),
      };
      left = node;
    }

    return left;
  }

  private additive(): Expression {
    const startToken = this.peek();
    let left = this.multiplicative();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous().value as '+' | '-';
      const right = this.multiplicative();
      const endToken = this.previous();

      const node: BinaryExpression = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        loc: this.makeLoc(startToken, endToken),
      };
      left = node;
    }

    return left;
  }

  private multiplicative(): Expression {
    const startToken = this.peek();
    let left = this.unary();

    while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const operator = this.previous().value as '*' | '/' | '%';
      const right = this.unary();
      const endToken = this.previous();

      const node: BinaryExpression = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        loc: this.makeLoc(startToken, endToken),
      };
      left = node;
    }

    return left;
  }

  private unary(): Expression {
    const startToken = this.peek();

    if (this.match(TokenType.NOT)) {
      const argument = this.unary();
      const endToken = this.previous();

      const node: UnaryExpression = {
        type: 'UnaryExpression',
        operator: '!',
        argument,
        loc: this.makeLoc(startToken, endToken),
      };
      return node;
    }

    if (this.match(TokenType.MINUS)) {
      const argument = this.unary();
      const endToken = this.previous();

      const node: UnaryExpression = {
        type: 'UnaryExpression',
        operator: '-',
        argument,
        loc: this.makeLoc(startToken, endToken),
      };
      return node;
    }

    return this.callAndMember();
  }

  private callAndMember(): Expression {
    let expr = this.primary();

    while (true) {
      const startToken = this.tokens[this.current - 1] || this.peek();

      if (this.match(TokenType.DOT)) {
        const name = this.consume(TokenType.IDENTIFIER, 'Expected property name after "."');

        const property: Identifier = {
          type: 'Identifier',
          name: name.value,
          loc: name.loc,
        };

        const node: MemberExpression = {
          type: 'MemberExpression',
          object: expr,
          property,
          computed: false,
          loc: this.makeLoc(startToken, name),
        };
        expr = node;
      } else if (this.match(TokenType.LBRACKET)) {
        const property = this.expression();
        const endToken = this.consume(TokenType.RBRACKET, 'Expected "]" after computed property');

        const node: MemberExpression = {
          type: 'MemberExpression',
          object: expr,
          property,
          computed: true,
          loc: this.makeLoc(startToken, endToken),
        };
        expr = node;
      } else if (this.match(TokenType.LPAREN)) {
        // Function call - callee must be an identifier
        if (expr.type !== 'Identifier') {
          throw new ParserError(
            'Method calls are not allowed; use built-in functions',
            this.input,
            expr.loc?.start || null,
          );
        }

        const args: Expression[] = [];

        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.expression());
          } while (this.match(TokenType.COMMA));
        }

        const endToken = this.consume(TokenType.RPAREN, 'Expected ")" after arguments');

        const node: CallExpression = {
          type: 'CallExpression',
          callee: expr,
          arguments: args,
          loc: this.makeLoc(startToken, endToken),
        };
        expr = node;
      } else {
        break;
      }
    }

    return expr;
  }

  private primary(): Expression {
    const token = this.peek();

    // Literals
    if (this.match(TokenType.STRING)) {
      const node: Literal = {
        type: 'Literal',
        value: this.previous().value,
        loc: this.previous().loc,
      };
      return node;
    }

    if (this.match(TokenType.NUMBER)) {
      const node: Literal = {
        type: 'Literal',
        value: parseFloat(this.previous().value),
        loc: this.previous().loc,
      };
      return node;
    }

    if (this.match(TokenType.BOOLEAN)) {
      const node: Literal = {
        type: 'Literal',
        value: this.previous().value === 'true',
        loc: this.previous().loc,
      };
      return node;
    }

    if (this.match(TokenType.NULL)) {
      const node: Literal = {
        type: 'Literal',
        value: null,
        loc: this.previous().loc,
      };
      return node;
    }

    // Identifier
    if (this.match(TokenType.IDENTIFIER)) {
      const node: Identifier = {
        type: 'Identifier',
        name: this.previous().value,
        loc: this.previous().loc,
      };
      return node;
    }

    // Grouping
    if (this.match(TokenType.LPAREN)) {
      const expr = this.expression();
      this.consume(TokenType.RPAREN, 'Expected ")" after expression');
      return expr;
    }

    // Array literal
    if (this.match(TokenType.LBRACKET)) {
      return this.arrayLiteral(token);
    }

    // Object literal
    if (this.match(TokenType.LBRACE)) {
      return this.objectLiteral(token);
    }

    throw this.error(`Unexpected token '${token.value}'`);
  }

  private arrayLiteral(startToken: Token): ArrayExpression {
    const elements: (Expression | SpreadElement)[] = [];

    if (!this.check(TokenType.RBRACKET)) {
      do {
        if (this.match(TokenType.SPREAD)) {
          const spreadStart = this.previous();
          const argument = this.expression();

          const spread: SpreadElement = {
            type: 'SpreadElement',
            argument,
            loc: this.makeLoc(spreadStart, this.previous()),
          };
          elements.push(spread);
        } else {
          elements.push(this.expression());
        }
      } while (this.match(TokenType.COMMA));
    }

    const endToken = this.consume(TokenType.RBRACKET, 'Expected "]" after array elements');

    return {
      type: 'ArrayExpression',
      elements,
      loc: this.makeLoc(startToken, endToken),
    };
  }

  private objectLiteral(startToken: Token): ObjectExpression {
    const properties: (Property | SpreadElement)[] = [];

    if (!this.check(TokenType.RBRACE)) {
      do {
        if (this.match(TokenType.SPREAD)) {
          const spreadStart = this.previous();
          const argument = this.expression();

          const spread: SpreadElement = {
            type: 'SpreadElement',
            argument,
            loc: this.makeLoc(spreadStart, this.previous()),
          };
          properties.push(spread);
        } else {
          const keyToken = this.peek();

          // Key can be identifier or string
          let key: Identifier | Literal;
          if (this.match(TokenType.IDENTIFIER)) {
            key = {
              type: 'Identifier',
              name: this.previous().value,
              loc: this.previous().loc,
            };
          } else if (this.match(TokenType.STRING)) {
            key = {
              type: 'Literal',
              value: this.previous().value,
              loc: this.previous().loc,
            };
          } else {
            throw this.error('Expected property name');
          }

          // Check for shorthand { foo } vs full { foo: bar }
          let value: Expression;
          let shorthand = false;

          if (this.match(TokenType.COLON)) {
            value = this.expression();
          } else {
            // Shorthand - key must be identifier
            if (key.type !== 'Identifier') {
              throw this.error('Shorthand property must be an identifier');
            }
            value = key;
            shorthand = true;
          }

          const prop: Property = {
            type: 'Property',
            key,
            value,
            shorthand,
            loc: this.makeLoc(keyToken, this.previous()),
          };
          properties.push(prop);
        }
      } while (this.match(TokenType.COMMA));
    }

    const endToken = this.consume(TokenType.RBRACE, 'Expected "}" after object properties');

    return {
      type: 'ObjectExpression',
      properties,
      loc: this.makeLoc(startToken, endToken),
    };
  }
}
