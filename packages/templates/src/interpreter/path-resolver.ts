/**
 * Path Resolution
 *
 * Functions for resolving PathExpressions by walking property chains
 * using secure lookupProperty access.
 */

import { lookupProperty } from '../runtime/utils.js';

/**
 * Resolve a path by walking through parts sequentially.
 *
 * Uses lookupProperty for secure property access. Returns undefined
 * if any intermediate value is null/undefined, or if the final value
 * doesn't exist.
 *
 * @param context - The object to resolve the path from
 * @param parts - Array of property names to walk through
 * @returns The resolved value, or undefined if not found
 *
 * @example
 * ```typescript
 * resolvePath({foo: {bar: 'baz'}}, ['foo', 'bar']); // 'baz'
 * resolvePath({foo: null}, ['foo', 'bar']); // undefined
 * resolvePath({foo: 'bar'}, []); // {foo: 'bar'} (empty parts = this)
 * ```
 */
export function resolvePath(context: any, parts: string[]): any {
  // Empty parts means {{this}} - return context as-is
  if (parts.length === 0) {
    return context;
  }

  // Start with the provided context
  let current = context;

  // Walk through each part
  for (const part of parts) {
    // If current is null or undefined, can't continue
    if (current == null) {
      return undefined;
    }

    // Use lookupProperty for security (prevents prototype pollution)
    current = lookupProperty(current, part);

    // If we got undefined, stop here
    // Note: null is a valid intermediate value and should continue
    // but lookupProperty will return undefined for null parent on next iteration
  }

  return current;
}
