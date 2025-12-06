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

/**
 * Escape characters for HTML output.
 *
 * Escapes 7 characters that are significant in HTML:
 * & < > " ' ` =
 *
 * Reference: Handlebars lib/handlebars/utils.js
 */
const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

// Regex to detect characters that need escaping
const escapeRegex = /[&<>"'`=]/g;

/**
 * Escapes HTML entities for safe output in HTML contexts.
 *
 * Handles null/undefined by returning empty string.
 * Converts non-string values to strings before escaping.
 * Escapes 7 HTML-significant characters: & < > " ' ` =
 *
 * @param value - The value to escape
 * @returns Escaped string safe for HTML output
 *
 * @example
 * ```typescript
 * escapeExpression('<script>alert("xss")</script>');
 * // '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 *
 * escapeExpression(null); // ''
 * escapeExpression(42); // '42'
 * escapeExpression(false); // 'false'
 * ```
 */
export function escapeExpression(value: any): string {
  // Handle null/undefined -> empty string
  if (value == null) {
    return '';
  }

  // Convert to string if needed
  const str = String(value);

  // Fast path: if no special characters, return original string
  if (!escapeRegex.test(str)) {
    return str;
  }

  // Replace all special characters with their HTML entity equivalents
  return str.replace(escapeRegex, (char) => escapeMap[char]);
}
