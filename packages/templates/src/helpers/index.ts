/**
 * Built-in Helper Registry
 *
 * Exports all built-in comparison and logical helpers for use in templates.
 * These helpers are available by default and can be overridden by user-provided helpers.
 */

import { lookupProperty } from '../runtime/utils.js';
import * as comparison from './comparison.js';
import * as logical from './logical.js';

/**
 * Type definition for helper functions.
 * Helpers can accept any number of arguments and return any value.
 */
export type Helper = (...args: any[]) => any;

/**
 * Type definition for helper registry (map of helper name to function).
 */
export type HelperRegistry = Record<string, Helper>;

/**
 * Built-in helpers available by default in all templates.
 *
 * Includes:
 * - Comparison: eq, ne, lt, lte, gt, gte
 * - Logical: and, or, not
 * - Utility: lookup
 *
 * @example
 * ```typescript
 * import { builtInHelpers } from './helpers';
 *
 * // Merge with user helpers
 * const allHelpers = { ...builtInHelpers, ...userHelpers };
 * ```
 */
export const builtInHelpers: HelperRegistry = {
  // Comparison helpers
  eq: comparison.eq,
  ne: comparison.ne,
  lt: comparison.lt,
  lte: comparison.lte,
  gt: comparison.gt,
  gte: comparison.gte,

  // Logical helpers
  and: logical.and,
  or: logical.or,
  not: logical.not,

  // Utility helpers
  /**
   * Lookup helper - dynamically access object properties.
   *
   * Safely looks up a property on an object using secure property access.
   * Returns undefined if the object is null/undefined or the property doesn't exist.
   *
   * @param obj - The object to look up the property on
   * @param field - The property name to look up
   * @returns The property value, or undefined if not found
   *
   * @example
   * ```handlebars
   * {{lookup person "name"}}
   * {{lookup array 0}}
   * {{lookup this key}}
   * ```
   */
  lookup: (obj: any, field: any): any => {
    if (obj == null) {
      return undefined;
    }
    return lookupProperty(obj, String(field));
  },
};
