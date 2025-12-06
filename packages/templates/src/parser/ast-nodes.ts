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
 * Forward declarations for types that will be defined in later tasks
 */
export type PathExpression = Node; // Placeholder - defined in C2-F1-T4
export type Expression = Node; // Placeholder - defined in C2-F1-T4
export type Hash = Node; // Placeholder - defined in C2-F1-T5

/**
 * Whitespace stripping flags for block delimiters
 * Used in V2 for whitespace control ({{~#if~}} syntax)
 */
export interface StripFlags {
  open: boolean; // Strip whitespace before
  close: boolean; // Strip whitespace after
}

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
