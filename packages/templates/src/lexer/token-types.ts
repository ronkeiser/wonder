/**
 * Token types for Handlebars-compatible template lexer
 *
 * Based on Handlebars tokenization specification
 */

export const TokenType = {
  // Delimiters
  OPEN: 'OPEN', // {{
  CLOSE: 'CLOSE', // }}
  OPEN_UNESCAPED: 'OPEN_UNESCAPED', // {{{
  CLOSE_UNESCAPED: 'CLOSE_UNESCAPED', // }}}

  // Block tokens
  OPEN_BLOCK: 'OPEN_BLOCK', // {{#
  OPEN_ENDBLOCK: 'OPEN_ENDBLOCK', // {{/
  OPEN_INVERSE: 'OPEN_INVERSE', // {{^

  // Special tokens
  INVERSE: 'INVERSE', // {{else}}
  COMMENT: 'COMMENT', // {{! ... }} or {{!-- ... --}}

  // Content
  CONTENT: 'CONTENT', // Plain text between mustaches

  // Literals
  STRING: 'STRING', // "text" or 'text'
  NUMBER: 'NUMBER', // 123, 1.5, -42
  BOOLEAN: 'BOOLEAN', // true, false
  UNDEFINED: 'UNDEFINED', // undefined
  NULL: 'NULL', // null

  // Identifiers and paths
  ID: 'ID', // Variable/helper names
  SEP: 'SEP', // . or / for dot notation
  DATA: 'DATA', // @ prefix for data variables

  // End of input
  EOF: 'EOF',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];
