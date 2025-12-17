/**
 * Runtime utilities for secure property access
 *
 * Adapted from @wonder/templates/src/runtime/utils.ts
 * Security-critical: prevents prototype pollution attacks
 */

// Cache hasOwnProperty reference for performance
const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Dangerous properties that could lead to prototype pollution or code execution
 */
const DANGEROUS_PROPERTIES = new Set([
  '__proto__',
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/**
 * Security-aware property lookup that prevents prototype pollution attacks.
 *
 * Only returns own properties, never inherited properties. This prevents
 * accessing dangerous inherited properties like __proto__, constructor, etc.
 *
 * @param parent - The object to look up the property on
 * @param propertyName - The property name to look up
 * @returns The property value if it exists as an own property, undefined otherwise
 */
export function lookupProperty(parent: unknown, propertyName: string): unknown {
  // Handle null/undefined parents
  if (parent == null) {
    return undefined;
  }

  // Security: Block dangerous properties to prevent prototype pollution
  if (DANGEROUS_PROPERTIES.has(propertyName)) {
    return undefined;
  }

  // Handle Map objects
  if (parent instanceof Map) {
    return parent.get(propertyName);
  }

  // Handle primitives - they don't have own properties we should access
  const type = typeof parent;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    // Allow 'length' on strings as it's safe and commonly used
    if (type === 'string' && propertyName === 'length') {
      return (parent as string).length;
    }
    return undefined;
  }

  // Check if property exists as an own property (not inherited)
  if (hasOwnProperty.call(parent, propertyName)) {
    return (parent as Record<string, unknown>)[propertyName];
  }

  // Special case: array length is not an own property but is safe
  if (Array.isArray(parent) && propertyName === 'length') {
    return parent.length;
  }

  // Property doesn't exist or is inherited
  return undefined;
}

/**
 * Resolve a path by walking through parts sequentially.
 *
 * Uses lookupProperty for secure property access. Returns undefined
 * if any intermediate value is null/undefined.
 *
 * @param object - The object to resolve the path from
 * @param parts - Array of property names to walk through
 * @returns The resolved value, or undefined if not found
 */
export function resolvePath(object: unknown, parts: string[]): unknown {
  let current = object;

  for (const part of parts) {
    if (current == null) {
      return undefined;
    }
    current = lookupProperty(current, part);
  }

  return current;
}

/**
 * Check if a value is a plain object (not array, not null)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
