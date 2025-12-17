import type { SourceLocation } from '../lexer/token';

/**
 * Base interface for all AST nodes
 */
interface BaseNode {
  /** Source location for error reporting */
  loc: SourceLocation | null;
}

/**
 * Literal value: string, number, boolean, or null
 */
export interface Literal extends BaseNode {
  type: 'Literal';
  value: string | number | boolean | null;
}

/**
 * Variable reference
 */
export interface Identifier extends BaseNode {
  type: 'Identifier';
  name: string;
}

/**
 * Property access: obj.prop or obj[expr]
 */
export interface MemberExpression extends BaseNode {
  type: 'MemberExpression';
  object: Expression;
  property: Expression;
  /** true for bracket notation obj[expr], false for dot notation obj.prop */
  computed: boolean;
}

/**
 * Array literal: [1, 2, ...arr]
 */
export interface ArrayExpression extends BaseNode {
  type: 'ArrayExpression';
  elements: (Expression | SpreadElement)[];
}

/**
 * Object literal: { key: value, ...obj }
 */
export interface ObjectExpression extends BaseNode {
  type: 'ObjectExpression';
  properties: (Property | SpreadElement)[];
}

/**
 * Object property: { key: value } or { key } (shorthand)
 */
export interface Property extends BaseNode {
  type: 'Property';
  key: Identifier | Literal;
  value: Expression;
  /** true for { foo } shorthand, false for { foo: bar } */
  shorthand: boolean;
}

/**
 * Spread element: ...expr
 */
export interface SpreadElement extends BaseNode {
  type: 'SpreadElement';
  argument: Expression;
}

/**
 * Binary operator expression: a + b, a > b
 */
export interface BinaryExpression extends BaseNode {
  type: 'BinaryExpression';
  operator: '+' | '-' | '*' | '/' | '%' | '===' | '!==' | '>' | '>=' | '<' | '<=';
  left: Expression;
  right: Expression;
}

/**
 * Logical operator expression: a && b, a || b
 */
export interface LogicalExpression extends BaseNode {
  type: 'LogicalExpression';
  operator: '&&' | '||';
  left: Expression;
  right: Expression;
}

/**
 * Unary operator expression: !a, -b
 */
export interface UnaryExpression extends BaseNode {
  type: 'UnaryExpression';
  operator: '!' | '-';
  argument: Expression;
}

/**
 * Ternary conditional: test ? consequent : alternate
 */
export interface ConditionalExpression extends BaseNode {
  type: 'ConditionalExpression';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

/**
 * Function call: fn(arg1, arg2)
 */
export interface CallExpression extends BaseNode {
  type: 'CallExpression';
  callee: Identifier;
  arguments: Expression[];
}

/**
 * Union of all expression types
 */
export type Expression =
  | Literal
  | Identifier
  | MemberExpression
  | ArrayExpression
  | ObjectExpression
  | BinaryExpression
  | LogicalExpression
  | UnaryExpression
  | ConditionalExpression
  | CallExpression;

/**
 * Union of all AST node types
 */
export type Node = Expression | Property | SpreadElement;
