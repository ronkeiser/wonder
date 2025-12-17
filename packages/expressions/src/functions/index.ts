/**
 * Built-in function registry for expressions
 */

import * as arrayFunctions from './array';
import * as mathFunctions from './math';
import * as objectFunctions from './object';
import * as stringFunctions from './string';
import * as typeFunctions from './type';
export { createIteratorFunctions, clearPredicateCache } from './iterator';
export type { PredicateEvaluator, ExpressionParser } from './iterator';

export type ExpressionFunction = (...args: unknown[]) => unknown;
export type FunctionRegistry = Record<string, ExpressionFunction>;

/**
 * Default function registry containing all non-iterator built-in functions
 * Iterator functions (map, filter, find, every, some) require runtime binding
 * and are created via createIteratorFunctions()
 */
export const builtinFunctions: FunctionRegistry = {
  // Array functions
  length: arrayFunctions.length,
  append: arrayFunctions.append,
  concat: arrayFunctions.concat,
  first: arrayFunctions.first,
  last: arrayFunctions.last,
  slice: arrayFunctions.slice,
  includes: arrayFunctions.includes,
  unique: arrayFunctions.unique,
  flatten: arrayFunctions.flatten,
  sort: arrayFunctions.sort,
  reverse: arrayFunctions.reverse,

  // Object functions
  keys: objectFunctions.keys,
  values: objectFunctions.values,
  entries: objectFunctions.entries,
  merge: objectFunctions.merge,
  pick: objectFunctions.pick,
  omit: objectFunctions.omit,
  get: objectFunctions.get,
  has: objectFunctions.has,

  // Math functions
  sum: mathFunctions.sum,
  avg: mathFunctions.avg,
  min: mathFunctions.min,
  max: mathFunctions.max,
  round: mathFunctions.round,
  floor: mathFunctions.floor,
  ceil: mathFunctions.ceil,
  abs: mathFunctions.abs,

  // String functions
  upper: stringFunctions.upper,
  lower: stringFunctions.lower,
  trim: stringFunctions.trim,
  split: stringFunctions.split,
  join: stringFunctions.join,
  startsWith: stringFunctions.startsWith,
  endsWith: stringFunctions.endsWith,
  replace: stringFunctions.replace,
  replaceAll: stringFunctions.replaceAll,
  substring: stringFunctions.substring,

  // Type functions
  isArray: typeFunctions.isArray,
  isObject: typeFunctions.isObject,
  isString: typeFunctions.isString,
  isNumber: typeFunctions.isNumber,
  isBoolean: typeFunctions.isBoolean,
  isNull: typeFunctions.isNull,
  isDefined: typeFunctions.isDefined,
  isEmpty: typeFunctions.isEmpty,
  type: typeFunctions.type,
};

/**
 * Create a function registry by merging built-in functions with custom functions
 */
export function createFunctionRegistry(
  customFunctions: FunctionRegistry = {}
): FunctionRegistry {
  return { ...builtinFunctions, ...customFunctions };
}
