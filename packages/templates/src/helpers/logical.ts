/**
 * Built-in Logical Helpers
 *
 * Provides logical operators (and, or, not) using Handlebars truthiness semantics.
 * Uses isEmpty() from runtime utils to match Handlebars behavior.
 */

import { isEmpty } from '../runtime/utils';

/**
 * Logical AND - Returns true if all arguments are truthy.
 *
 * Uses Handlebars truthiness semantics via isEmpty():
 * - Falsy: null, undefined, false, "", []
 * - Truthy: everything else including 0 and {}
 *
 * @param args - Values to check
 * @returns true if all arguments are truthy
 *
 * @example
 * ```handlebars
 * {{#if (and isActive isPremium)}}Premium Active{{/if}}
 * {{#if (and a b c)}}All true{{/if}}
 * ```
 */
export const and = (...args: any[]): boolean => {
  for (const arg of args) {
    if (isEmpty(arg)) {
      return false;
    }
  }
  return true;
};

/**
 * Logical OR - Returns true if any argument is truthy.
 *
 * Uses Handlebars truthiness semantics via isEmpty():
 * - Falsy: null, undefined, false, "", []
 * - Truthy: everything else including 0 and {}
 *
 * @param args - Values to check
 * @returns true if any argument is truthy
 *
 * @example
 * ```handlebars
 * {{#if (or isAdmin isOwner)}}Has access{{/if}}
 * {{#if (or a b c)}}At least one true{{/if}}
 * ```
 */
export const or = (...args: any[]): boolean => {
  for (const arg of args) {
    if (!isEmpty(arg)) {
      return true;
    }
  }
  return false;
};

/**
 * Logical NOT - Returns true if value is falsy.
 *
 * Uses Handlebars truthiness semantics via isEmpty():
 * - Falsy: null, undefined, false, "", []
 * - Truthy: everything else including 0 and {}
 *
 * @param value - Value to negate
 * @returns true if value is falsy
 *
 * @example
 * ```handlebars
 * {{#if (not isDisabled)}}Enabled{{/if}}
 * {{#unless (not isActive)}}Active{{/unless}}
 * ```
 */
export const not = (value: any): boolean => {
  return isEmpty(value);
};
