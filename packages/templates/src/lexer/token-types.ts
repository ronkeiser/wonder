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
  OPEN_RAW: 'OPEN_RAW', // {{&

  // Block tokens
  OPEN_BLOCK: 'OPEN_BLOCK', // {{#
  OPEN_ENDBLOCK: 'OPEN_ENDBLOCK', // {{/
  OPEN_INVERSE: 'OPEN_INVERSE', // {{^

  // Block markers (used after ~ in whitespace control)
  BLOCK_START: 'BLOCK_START', // # (after ~ in mustache)
  BLOCK_END: 'BLOCK_END', // / (after ~ in mustache)
  BLOCK_INVERSE: 'BLOCK_INVERSE', // ^ (after ~ in mustache)
  RAW_MARKER: 'RAW_MARKER', // & (after ~ in mustache)

  // Special tokens
  INVERSE: 'INVERSE', // {{else}}
  COMMENT: 'COMMENT', // {{! ... }} or {{!-- ... --}}

  // Subexpressions
  OPEN_SEXPR: 'OPEN_SEXPR', // (
  CLOSE_SEXPR: 'CLOSE_SEXPR', // )

  // Braces (for {{~{foo}~}} unescaped syntax)
  OPEN_BRACE: 'OPEN_BRACE', // {
  CLOSE_BRACE: 'CLOSE_BRACE', // }

  // Bracket literals
  BRACKET_LITERAL: 'BRACKET_LITERAL', // [literal content]

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

  // Hash arguments
  EQUALS: 'EQUALS', // = for key=value pairs

  // Block parameters
  PIPE: 'PIPE', // | for block params (as |foo bar|)

  // Whitespace control
  STRIP: 'STRIP', // ~ for whitespace stripping

  // End of input
  EOF: 'EOF',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];
