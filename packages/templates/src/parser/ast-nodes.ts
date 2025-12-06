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
