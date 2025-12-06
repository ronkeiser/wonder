/**
 * AST Node Types for Template Parser
 *
 * These types follow the Handlebars AST specification for compatibility.
 */

import type { SourceLocation } from '../lexer/token';

/**
 * Base interface for all AST nodes
 */
export interface Node {
  type: string; // Node type discriminator
  loc: SourceLocation | null; // Position information (null for synthetic nodes)
}

/**
 * Key-value pair for hash parameters
 * Example: in {{helper name="value"}}, name="value" is a HashPair
 */
export interface HashPair extends Node {
  type: 'HashPair';
  key: string; // Parameter name
  value: Expression; // Parameter value (can be path or literal)
}

/**
 * Hash for named parameters in helper calls
 * Example: {{formatDate date format="YYYY-MM-DD" locale="en"}}
 */
export interface Hash extends Node {
  type: 'Hash';
  pairs: HashPair[]; // Array of key-value pairs
}

/**
 * Whitespace stripping flags for block delimiters
 * Used in V2 for whitespace control ({{~#if~}} syntax)
 */
export interface StripFlags {
  open: boolean; // Strip whitespace before
  close: boolean; // Strip whitespace after
}

/**
 * PathExpression - variable path with security-critical depth tracking
 *
 * Examples:
 * - {{foo}} → depth: 0, parts: ['foo'], data: false
 * - {{foo.bar}} → depth: 0, parts: ['foo', 'bar'], data: false
 * - {{../parent}} → depth: 1, parts: ['parent'], data: false
 * - {{../../grand}} → depth: 2, parts: ['grand'], data: false
 * - {{@index}} → depth: 0, parts: ['index'], data: true
 * - {{this}} → depth: 0, parts: [], data: false
 */
export interface PathExpression extends Node {
  type: 'PathExpression';
  data: boolean; // true if starts with @
  depth: number; // 0=current, 1=../, 2=../../
  parts: string[]; // Path segments (e.g., ['foo', 'bar'] for foo.bar)
  original: string; // Raw path string
  loc: SourceLocation | null;
}

/**
 * StringLiteral - string literal expression
 */
export interface StringLiteral extends Node {
  type: 'StringLiteral';
  value: string; // Unescaped string value
  original: string; // Original string with quotes
  loc: SourceLocation | null;
}

/**
 * NumberLiteral - numeric literal expression
 */
export interface NumberLiteral extends Node {
  type: 'NumberLiteral';
  value: number; // Parsed numeric value
  original: string; // Original number string
  loc: SourceLocation | null;
}

/**
 * BooleanLiteral - boolean literal expression
 */
export interface BooleanLiteral extends Node {
  type: 'BooleanLiteral';
  value: boolean; // true or false
  original: string; // "true" or "false"
  loc: SourceLocation | null;
}

/**
 * NullLiteral - null literal expression
 */
export interface NullLiteral extends Node {
  type: 'NullLiteral';
  value: null; // Always null
  original: string; // "null"
  loc: SourceLocation | null;
}

/**
 * UndefinedLiteral - undefined literal expression
 */
export interface UndefinedLiteral extends Node {
  type: 'UndefinedLiteral';
  value: undefined; // Always undefined
  original: string; // "undefined"
  loc: SourceLocation | null;
}

/**
 * Expression - union of all expression types
 */
export type Expression =
  | PathExpression
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | NullLiteral
  | UndefinedLiteral;

/**
 * ContentStatement - plain text content between mustaches
 */
export interface ContentStatement extends Node {
  type: 'ContentStatement';
  value: string; // Raw text content
  original: string; // Original text (may include escape sequences)
  loc: SourceLocation | null;
}

/**
 * MustacheStatement - variable or helper output {{foo}} or {{{foo}}}
 */
export interface MustacheStatement extends Node {
  type: 'MustacheStatement';
  path: PathExpression; // Variable path or helper name
  params: Expression[]; // Helper arguments (empty in V1)
  hash: Hash; // Named parameters (empty in V1)
  escaped: boolean; // true for {{}}, false for {{{}}}
  loc: SourceLocation | null;
}

/**
 * BlockStatement - block helper {{#if}}...{{/if}}
 */
export interface BlockStatement extends Node {
  type: 'BlockStatement';
  path: PathExpression; // Helper name (e.g., 'if', 'each')
  params: Expression[]; // Helper arguments (empty in V1)
  hash: Hash; // Named parameters (empty in V1)
  program: Program | null; // Main block content
  inverse: Program | null; // {{else}} block content
  openStrip: StripFlags; // Whitespace control at opening tag (V2)
  inverseStrip: StripFlags; // Whitespace control at {{else}} (V2)
  closeStrip: StripFlags; // Whitespace control at closing tag (V2)
  loc: SourceLocation | null;
}

/**
 * CommentStatement - template comment {{! comment }} or {{!-- comment --}}
 */
export interface CommentStatement extends Node {
  type: 'CommentStatement';
  value: string; // Comment text (without delimiters)
  loc: SourceLocation | null;
}

/**
 * Statement - union of all statement types
 */
export type Statement = ContentStatement | MustacheStatement | BlockStatement | CommentStatement;

/**
 * Program node - root of the AST
 *
 * Every parsed template returns a Program containing an ordered list of statements.
 */
export interface Program extends Node {
  type: 'Program';
  body: Statement[]; // Ordered list of statements in the template
  loc: SourceLocation | null;
}
