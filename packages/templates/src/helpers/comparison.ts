/**
 * Built-in Comparison Helpers
 *
 * Provides standard comparison helpers for use in conditionals.
 * All helpers use JavaScript comparison operators with strict equality.
 */

/**
 * Checks if two values are strictly equal.
 *
 * @param a - First value
 * @param b - Second value
 * @returns true if a === b
 *
 * @example
 * ```handlebars
 * {{#if (eq status "active")}}Active{{/if}}
 * {{#if (eq count 0)}}Zero{{/if}}
 * ```
 */
export const eq = (a: any, b: any): boolean => a === b;

/**
 * Checks if two values are not equal.
 *
 * @param a - First value
 * @param b - Second value
 * @returns true if a !== b
 *
 * @example
 * ```handlebars
 * {{#if (ne status "deleted")}}Show{{/if}}
 * ```
 */
export const ne = (a: any, b: any): boolean => a !== b;

/**
 * Checks if first value is less than second value.
 *
 * @param a - First value
 * @param b - Second value
 * @returns true if a < b
 *
 * @example
 * ```handlebars
 * {{#if (lt age 18)}}Minor{{/if}}
 * ```
 */
export const lt = (a: any, b: any): boolean => a < b;

/**
 * Checks if first value is less than or equal to second value.
 *
 * @param a - First value
 * @param b - Second value
 * @returns true if a <= b
 *
 * @example
 * ```handlebars
 * {{#if (lte score 60)}}Needs improvement{{/if}}
 * ```
 */
export const lte = (a: any, b: any): boolean => a <= b;

/**
 * Checks if first value is greater than second value.
 *
 * @param a - First value
 * @param b - Second value
 * @returns true if a > b
 *
 * @example
 * ```handlebars
 * {{#if (gt score 80)}}Excellent{{/if}}
 * ```
 */
export const gt = (a: any, b: any): boolean => a > b;

/**
 * Checks if first value is greater than or equal to second value.
 *
 * @param a - First value
 * @param b - Second value
 * @returns true if a >= b
 *
 * @example
 * ```handlebars
 * {{#if (gte age 18)}}Adult{{/if}}
 * ```
 */
export const gte = (a: any, b: any): boolean => a >= b;
