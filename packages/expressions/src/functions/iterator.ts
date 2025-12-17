/**
 * Iterator functions for expressions
 *
 * These functions parse and evaluate a predicate expression string for each element.
 * Predicate receives `item` (current element) and `index` (position) in context.
 */

import type { Expression } from '../parser/ast';
import type { FunctionRegistry } from '../interpreter/interpreter';

/**
 * Predicate evaluator type - evaluates an expression against a context
 */
export type PredicateEvaluator = (ast: Expression, context: Record<string, unknown>) => unknown;

/**
 * Expression parser type - parses a string into an AST
 */
export type ExpressionParser = (expression: string) => Expression;

/**
 * Cache for compiled predicate expressions
 */
const predicateCache = new Map<string, Expression>();

/**
 * Parse a predicate expression, with caching
 */
function parsePredicate(expr: string, parser: ExpressionParser): Expression {
  let ast = predicateCache.get(expr);
  if (!ast) {
    ast = parser(expr);
    predicateCache.set(expr, ast);
  }
  return ast;
}

/**
 * Create iterator functions with access to parser and evaluator
 */
export function createIteratorFunctions(
  parser: ExpressionParser,
  evaluator: PredicateEvaluator,
  parentContext: Record<string, unknown>,
  _functions: FunctionRegistry
): FunctionRegistry {
  /**
   * Build context for predicate evaluation
   * Includes item, index, and all parent context values
   */
  function buildPredicateContext(
    item: unknown,
    index: number,
    baseContext: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      ...baseContext,
      item,
      index,
    };
  }

  /**
   * Transform each element using a predicate expression
   */
  function map(arr: unknown, expr: unknown): unknown[] {
    if (!Array.isArray(arr)) {
      throw new TypeError('map() requires an array as first argument');
    }
    if (typeof expr !== 'string') {
      throw new TypeError('map() requires a string expression as second argument');
    }

    const ast = parsePredicate(expr, parser);
    return arr.map((item, index) => {
      const ctx = buildPredicateContext(item, index, parentContext);
      return evaluator(ast, ctx);
    });
  }

  /**
   * Keep elements where predicate is truthy
   */
  function filter(arr: unknown, expr: unknown): unknown[] {
    if (!Array.isArray(arr)) {
      throw new TypeError('filter() requires an array as first argument');
    }
    if (typeof expr !== 'string') {
      throw new TypeError('filter() requires a string expression as second argument');
    }

    const ast = parsePredicate(expr, parser);
    return arr.filter((item, index) => {
      const ctx = buildPredicateContext(item, index, parentContext);
      return evaluator(ast, ctx);
    });
  }

  /**
   * Return first element where predicate is truthy
   * Short-circuits on first match
   */
  function find(arr: unknown, expr: unknown): unknown {
    if (!Array.isArray(arr)) {
      throw new TypeError('find() requires an array as first argument');
    }
    if (typeof expr !== 'string') {
      throw new TypeError('find() requires a string expression as second argument');
    }

    const ast = parsePredicate(expr, parser);
    for (let index = 0; index < arr.length; index++) {
      const item = arr[index];
      const ctx = buildPredicateContext(item, index, parentContext);
      if (evaluator(ast, ctx)) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Return true if all elements pass predicate
   * Short-circuits on first failure
   */
  function every(arr: unknown, expr: unknown): boolean {
    if (!Array.isArray(arr)) {
      throw new TypeError('every() requires an array as first argument');
    }
    if (typeof expr !== 'string') {
      throw new TypeError('every() requires a string expression as second argument');
    }

    const ast = parsePredicate(expr, parser);
    for (let index = 0; index < arr.length; index++) {
      const item = arr[index];
      const ctx = buildPredicateContext(item, index, parentContext);
      if (!evaluator(ast, ctx)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Return true if any element passes predicate
   * Short-circuits on first success
   */
  function some(arr: unknown, expr: unknown): boolean {
    if (!Array.isArray(arr)) {
      throw new TypeError('some() requires an array as first argument');
    }
    if (typeof expr !== 'string') {
      throw new TypeError('some() requires a string expression as second argument');
    }

    const ast = parsePredicate(expr, parser);
    for (let index = 0; index < arr.length; index++) {
      const item = arr[index];
      const ctx = buildPredicateContext(item, index, parentContext);
      if (evaluator(ast, ctx)) {
        return true;
      }
    }
    return false;
  }

  return {
    map,
    filter,
    find,
    every,
    some,
  };
}

/**
 * Clear the predicate cache (useful for testing)
 */
export function clearPredicateCache(): void {
  predicateCache.clear();
}
