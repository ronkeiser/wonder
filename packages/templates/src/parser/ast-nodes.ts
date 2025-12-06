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
 * Forward declaration for Statement types
 * Will be defined in C2-F1-T3
 */
export type Statement = Node; // Placeholder until we define actual statement types

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
