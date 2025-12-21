/**
 * @wonder/expressions
 *
 * Pure expression evaluation for JSON data transformation.
 * Safe for Cloudflare Workers (no eval, no new Function).
 */

import { Interpreter } from './interpreter/interpreter';
import { Parser } from './parser/parser';
import type { Expression } from './parser/ast';
import {
  builtinFunctions,
  createIteratorFunctions,
  type FunctionRegistry,
} from './functions/index';
import {
  ExpressionError,
  ExpressionRangeError,
  ExpressionReferenceError,
  ExpressionSyntaxError,
  ExpressionTypeError,
} from './errors';
import { LexerError } from './lexer/lexer-error';
import { ParserError } from './parser/parser-error';

// Re-export error types
export {
  ExpressionError,
  ExpressionRangeError,
  ExpressionReferenceError,
  ExpressionSyntaxError,
  ExpressionTypeError,
};

// Re-export types
export type { Expression } from './parser/ast';
export type { FunctionRegistry } from './functions/index';

/**
 * Default limits for expression evaluation
 */
export const DEFAULT_LIMITS = {
  /** Maximum expression length in characters */
  maxExpressionLength: 10_000,
  /** Maximum string literal length in characters */
  maxStringLength: 10_000,
  /** Maximum elements in array/object literals */
  maxLiteralSize: 1_000,
} as const;

/**
 * Options for expression evaluation
 */
export interface EvaluateOptions {
  /** Custom functions to add to the registry */
  functions?: FunctionRegistry;
  /** Override default limits (set to Infinity to disable) */
  limits?: Partial<typeof DEFAULT_LIMITS>;
}

/**
 * Compiled expression that can be evaluated multiple times
 */
export interface CompiledExpression {
  /** Evaluate the expression against a context */
  evaluate(context: Record<string, unknown>): unknown;
  /** The original expression string */
  readonly expression: string;
}

/**
 * Validate AST against limits
 */
function validateAstLimits(
  node: Expression,
  expression: string,
  limits: typeof DEFAULT_LIMITS
): void {
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string' && node.value.length > limits.maxStringLength) {
        throw new ExpressionRangeError(
          `String literal exceeds maximum length of ${limits.maxStringLength} characters`,
          expression,
          node.loc?.start || null
        );
      }
      break;

    case 'ArrayExpression':
      if (node.elements.length > limits.maxLiteralSize) {
        throw new ExpressionRangeError(
          `Array literal exceeds maximum size of ${limits.maxLiteralSize} elements`,
          expression,
          node.loc?.start || null
        );
      }
      for (const element of node.elements) {
        validateAstLimits(element.type === 'SpreadElement' ? element.argument : element, expression, limits);
      }
      break;

    case 'ObjectExpression':
      if (node.properties.length > limits.maxLiteralSize) {
        throw new ExpressionRangeError(
          `Object literal exceeds maximum size of ${limits.maxLiteralSize} properties`,
          expression,
          node.loc?.start || null
        );
      }
      for (const prop of node.properties) {
        if (prop.type === 'SpreadElement') {
          validateAstLimits(prop.argument, expression, limits);
        } else {
          validateAstLimits(prop.value, expression, limits);
        }
      }
      break;

    case 'BinaryExpression':
    case 'LogicalExpression':
      validateAstLimits(node.left, expression, limits);
      validateAstLimits(node.right, expression, limits);
      break;

    case 'UnaryExpression':
      validateAstLimits(node.argument, expression, limits);
      break;

    case 'ConditionalExpression':
      validateAstLimits(node.test, expression, limits);
      validateAstLimits(node.consequent, expression, limits);
      validateAstLimits(node.alternate, expression, limits);
      break;

    case 'MemberExpression':
      validateAstLimits(node.object, expression, limits);
      if (node.computed) {
        validateAstLimits(node.property, expression, limits);
      }
      break;

    case 'CallExpression':
      for (const arg of node.arguments) {
        validateAstLimits(arg, expression, limits);
      }
      break;

    case 'Identifier':
      // No limits to check
      break;
  }
}

/**
 * Create the full function registry including iterator functions
 */
function createFullRegistry(
  context: Record<string, unknown>,
  customFunctions: FunctionRegistry = {}
): FunctionRegistry {
  const parser = new Parser();

  // Create base registry with builtins and custom functions
  const baseRegistry: FunctionRegistry = { ...builtinFunctions, ...customFunctions };

  // Create interpreter for iterator function evaluation
  const interpreter = new Interpreter(baseRegistry);

  // Add iterator functions that need parser/interpreter access
  const iteratorFns = createIteratorFunctions(
    (expr) => parser.parse(expr),
    (ast, ctx) => interpreter.evaluate(ast, ctx),
    context,
    baseRegistry
  );

  // Merge iterator functions into registry
  Object.assign(baseRegistry, iteratorFns);

  // Update interpreter's function registry
  return baseRegistry;
}

/**
 * Evaluate an expression against a context
 *
 * @param expression - The expression string to evaluate
 * @param context - The context object containing variables
 * @param options - Optional evaluation options
 * @returns The result of evaluating the expression
 * @throws {ExpressionSyntaxError} If the expression has invalid syntax
 * @throws {ExpressionReferenceError} If an unknown function is called
 * @throws {ExpressionTypeError} If a type error occurs during evaluation
 *
 * @example
 * ```ts
 * evaluate('user.name', { user: { name: 'Alice' } })
 * // => 'Alice'
 *
 * evaluate('items.length > 0 ? first(items) : null', { items: [1, 2, 3] })
 * // => 1
 * ```
 */
export function evaluate(
  expression: string,
  context: Record<string, unknown> = {},
  options: EvaluateOptions = {}
): unknown {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };

  // Check expression length limit
  if (expression.length > limits.maxExpressionLength) {
    throw new ExpressionRangeError(
      `Expression exceeds maximum length of ${limits.maxExpressionLength} characters`,
      expression
    );
  }

  const parser = new Parser();
  let ast: Expression;

  try {
    ast = parser.parse(expression);
  } catch (error) {
    if (error instanceof LexerError) {
      throw new ExpressionSyntaxError(error.message, expression, error.position);
    }
    if (error instanceof ParserError) {
      throw new ExpressionSyntaxError(error.message, expression, error.position);
    }
    throw error;
  }

  // Validate AST limits
  validateAstLimits(ast, expression, limits);

  const functions = createFullRegistry(context, options.functions);
  const interpreter = new Interpreter(functions);

  try {
    return interpreter.evaluate(ast, context);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('Unknown function:')) {
        throw new ExpressionReferenceError(error.message, expression);
      }
      if (
        error.message.includes('requires') ||
        error.message.includes('must be')
      ) {
        throw new ExpressionTypeError(error.message, expression);
      }
    }
    throw error;
  }
}

/**
 * Parse an expression string into an AST
 *
 * Use this to validate expressions at creation time and store the AST.
 * The AST can later be evaluated with evaluateAst() without re-parsing.
 *
 * @param expression - The expression string to parse
 * @param options - Optional parsing options (for limits)
 * @returns The parsed AST
 * @throws {ExpressionSyntaxError} If the expression has invalid syntax
 * @throws {ExpressionRangeError} If the expression exceeds limits
 *
 * @example
 * ```ts
 * const ast = parse('state.score >= 80');
 * // Store ast as JSON in database
 * // Later: evaluateAst(ast, context)
 * ```
 */
export function parse(
  expression: string,
  options: EvaluateOptions = {}
): Expression {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };

  // Check expression length limit
  if (expression.length > limits.maxExpressionLength) {
    throw new ExpressionRangeError(
      `Expression exceeds maximum length of ${limits.maxExpressionLength} characters`,
      expression
    );
  }

  const parser = new Parser();
  let ast: Expression;

  try {
    ast = parser.parse(expression);
  } catch (error) {
    if (error instanceof LexerError) {
      throw new ExpressionSyntaxError(error.message, expression, error.position);
    }
    if (error instanceof ParserError) {
      throw new ExpressionSyntaxError(error.message, expression, error.position);
    }
    throw error;
  }

  // Validate AST limits
  validateAstLimits(ast, expression, limits);

  return ast;
}

/**
 * Evaluate a pre-parsed AST against a context
 *
 * Use this when you have already parsed and stored the AST.
 * Skips parsing for better performance and guaranteed no syntax errors.
 *
 * @param ast - The pre-parsed AST
 * @param context - The context object containing variables
 * @param options - Optional evaluation options
 * @returns The result of evaluating the expression
 * @throws {ExpressionReferenceError} If an unknown function is called
 * @throws {ExpressionTypeError} If a type error occurs during evaluation
 *
 * @example
 * ```ts
 * const ast = parse('user.name');
 * evaluateAst(ast, { user: { name: 'Alice' } }) // => 'Alice'
 * ```
 */
export function evaluateAst(
  ast: Expression,
  context: Record<string, unknown> = {},
  options: EvaluateOptions = {}
): unknown {
  const functions = createFullRegistry(context, options.functions);
  const interpreter = new Interpreter(functions);

  try {
    return interpreter.evaluate(ast, context);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('Unknown function:')) {
        throw new ExpressionReferenceError(error.message, '<ast>');
      }
      if (
        error.message.includes('requires') ||
        error.message.includes('must be')
      ) {
        throw new ExpressionTypeError(error.message, '<ast>');
      }
    }
    throw error;
  }
}

/**
 * Compile an expression for repeated evaluation
 *
 * @param expression - The expression string to compile
 * @param options - Optional compilation options
 * @returns A compiled expression object
 * @throws {ExpressionSyntaxError} If the expression has invalid syntax
 *
 * @example
 * ```ts
 * const expr = compile('user.name');
 * expr.evaluate({ user: { name: 'Alice' } }) // => 'Alice'
 * expr.evaluate({ user: { name: 'Bob' } })   // => 'Bob'
 * ```
 */
export function compile(
  expression: string,
  options: EvaluateOptions = {}
): CompiledExpression {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };

  // Check expression length limit
  if (expression.length > limits.maxExpressionLength) {
    throw new ExpressionRangeError(
      `Expression exceeds maximum length of ${limits.maxExpressionLength} characters`,
      expression
    );
  }

  const parser = new Parser();
  let ast: Expression;

  try {
    ast = parser.parse(expression);
  } catch (error) {
    if (error instanceof LexerError) {
      throw new ExpressionSyntaxError(error.message, expression, error.position);
    }
    if (error instanceof ParserError) {
      throw new ExpressionSyntaxError(error.message, expression, error.position);
    }
    throw error;
  }

  // Validate AST limits
  validateAstLimits(ast, expression, limits);

  return {
    expression,
    evaluate(context: Record<string, unknown> = {}): unknown {
      const functions = createFullRegistry(context, options.functions);
      const interpreter = new Interpreter(functions);

      try {
        return interpreter.evaluate(ast, context);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.startsWith('Unknown function:')) {
            throw new ExpressionReferenceError(error.message, expression);
          }
          if (
            error.message.includes('requires') ||
            error.message.includes('must be')
          ) {
            throw new ExpressionTypeError(error.message, expression);
          }
        }
        throw error;
      }
    },
  };
}
