/**
 * Token types for expression lexer
 *
 * Supports a safe subset of JavaScript expression syntax for JSON data transformation.
 */

export const TokenType = {
  // Literals
  STRING: 'STRING', // 'hello' or "world"
  NUMBER: 'NUMBER', // 42, 3.14, -17
  BOOLEAN: 'BOOLEAN', // true, false
  NULL: 'NULL', // null

  // Identifiers
  IDENTIFIER: 'IDENTIFIER', // foo, user, items

  // Arithmetic operators
  PLUS: 'PLUS', // +
  MINUS: 'MINUS', // -
  STAR: 'STAR', // *
  SLASH: 'SLASH', // /
  PERCENT: 'PERCENT', // %

  // Comparison operators
  EQ: 'EQ', // ===
  NEQ: 'NEQ', // !==
  GT: 'GT', // >
  GTE: 'GTE', // >=
  LT: 'LT', // <
  LTE: 'LTE', // <=

  // Logical operators
  AND: 'AND', // &&
  OR: 'OR', // ||
  NOT: 'NOT', // !

  // Punctuation
  LPAREN: 'LPAREN', // (
  RPAREN: 'RPAREN', // )
  LBRACKET: 'LBRACKET', // [
  RBRACKET: 'RBRACKET', // ]
  LBRACE: 'LBRACE', // {
  RBRACE: 'RBRACE', // }
  COMMA: 'COMMA', // ,
  COLON: 'COLON', // :
  DOT: 'DOT', // .
  QUESTION: 'QUESTION', // ?

  // Spread operator
  SPREAD: 'SPREAD', // ...

  // End of input
  EOF: 'EOF',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];
