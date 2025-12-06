/**
 * Runtime Utilities
 *
 * Core utility functions from Handlebars runtime for secure evaluation.
 * These provide the foundation for safe property access, HTML escaping,
 * scope management, and value checking.
 *
 * Reference: Handlebars lib/handlebars/runtime.js and lib/handlebars/utils.js
 */

// Cache hasOwnProperty reference for performance
const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Security-aware property lookup that prevents prototype pollution attacks.
 *
 * Only returns own properties, never inherited properties. This prevents
 * accessing dangerous inherited properties like __proto__, constructor, etc.
 *
 * @param parent - The object to look up the property on
 * @param propertyName - The property name to look up
 * @returns The property value if it exists as an own property, undefined otherwise
 *
 * @example
 * ```typescript
 * const obj = { foo: 'bar' };
 * lookupProperty(obj, 'foo'); // 'bar'
 * lookupProperty(obj, 'baz'); // undefined
 * lookupProperty(obj, '__proto__'); // undefined (security!)
 * ```
 */
export function lookupProperty(parent: any, propertyName: string): any {
  // Handle null/undefined parents
  if (parent == null) {
    return undefined;
  }

  // Handle primitives - they don't have own properties
  // We need to return undefined for primitives to be secure
  const type = typeof parent;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return undefined;
  }

  // Check if property exists as an own property (not inherited)
  if (hasOwnProperty.call(parent, propertyName)) {
    return parent[propertyName];
  }

  // Property doesn't exist or is inherited
  return undefined;
}
