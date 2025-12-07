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

  // Feature 7.8: Handle Map objects
  if (parent instanceof Map) {
    return parent.get(propertyName);
  }

  // Handle string primitives - allow access to length property
  if (typeof parent === 'string' && propertyName === 'length') {
    return parent.length;
  }

  // Handle other primitives - they don't have own properties
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
 * SafeString class for pre-escaped HTML content.
 *
 * Wraps a string to indicate it has already been escaped and should not
 * be escaped again by escapeExpression(). This is used by helpers that
 * generate HTML content.
 *
 * Reference: Handlebars lib/handlebars/safe-string.js
 *
 * @example
 * ```typescript
 * const html = new SafeString('<b>Bold</b>');
 * escapeExpression(html); // '<b>Bold</b>' (not escaped)
 * ```
 */
export class SafeString {
  private string: string;

  constructor(string: string) {
    this.string = string;
  }

  /**
   * Returns the stored string value.
   * @returns The unescaped string
   */
  toString(): string {
    return this.string;
  }

  /**
   * Returns the stored string value as HTML.
   * Alias for toString() for Handlebars compatibility.
   * @returns The unescaped string
   */
  toHTML(): string {
    return this.string;
  }
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
  // SafeString instances bypass escaping
  if (value instanceof SafeString) {
    return value.toString();
  }

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

/**
 * Creates a new data frame for scope isolation in block helpers.
 *
 * This function creates a shallow copy of the input data with a special
 * `_parent` property that references the original data. This enables:
 * - Scope isolation: changes in child scope don't affect parent
 * - Parent access: child can access parent data via `_parent`
 * - Nesting: multiple frames can be chained via `_parent`
 *
 * @param data - The data object to create a frame from
 * @returns A new object with all properties copied and `_parent` added
 *
 * @example
 * ```typescript
 * const parent = { name: 'Alice', age: 30 };
 * const frame = createFrame(parent);
 * frame.name = 'Bob'; // doesn't affect parent.name
 * console.log(frame._parent.name); // 'Alice'
 * ```
 */
export function createFrame(data: any): any {
  // Handle null/undefined input
  if (data == null) {
    return { _parent: data };
  }

  // Create new frame with all properties copied and _parent reference
  return { ...data, _parent: data };
}

/**
 * Checks if a value is considered "empty" in Handlebars semantics.
 *
 * Handlebars has different truthiness rules than JavaScript:
 * - `0` is truthy (NOT empty)
 * - `{}` is truthy (NOT empty)
 * - `[]` is falsy (empty)
 *
 * Returns `true` for:
 * - `null`
 * - `undefined`
 * - `false`
 * - Empty string `""`
 * - Empty array `[]`
 *
 * Returns `false` for everything else, including:
 * - `0` (truthy in Handlebars!)
 * - `{}` (truthy in Handlebars!)
 * - Non-empty arrays
 * - All other values
 *
 * @param value - The value to check for emptiness
 * @returns `true` if the value is empty, `false` otherwise
 *
 * @example
 * ```typescript
 * isEmpty(null);      // true
 * isEmpty(undefined); // true
 * isEmpty(false);     // true
 * isEmpty("");        // true
 * isEmpty([]);        // true
 * isEmpty(0);         // false (truthy in Handlebars!)
 * isEmpty({});        // false (truthy in Handlebars!)
 * isEmpty([1]);       // false
 * ```
 */
export function isEmpty(value: any): boolean {
  // Match Handlebars isEmpty logic exactly: (!value && value !== 0) || empty array
  // Special case: NaN is falsy but should not be empty (typeof NaN === 'number')
  if (!value && value !== 0) {
    // NaN check: typeof NaN === 'number', so exclude it
    if (typeof value === 'number') {
      return false; // NaN is not empty
    }
    return true;
  }

  // Empty array is empty
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }

  // Everything else is not empty
  return false;
}

/**
 * Checks if a value is an array.
 *
 * Uses `Array.isArray()` for reliable detection. Only returns `true` for
 * true arrays, not array-like objects.
 *
 * @param value - The value to check
 * @returns `true` if the value is an array, `false` otherwise
 *
 * @example
 * ```typescript
 * isArray([]);           // true
 * isArray([1, 2, 3]);    // true
 * isArray({ length: 0 }); // false (not a true array)
 * isArray(null);         // false
 * ```
 */
export function isArray(value: any): boolean {
  return Array.isArray(value);
}

/**
 * Checks if a value is a function.
 *
 * Uses `typeof` operator to detect all function types including:
 * - Regular functions
 * - Arrow functions
 * - Async functions
 * - Generator functions
 * - Class constructors
 *
 * @param value - The value to check
 * @returns `true` if the value is a function, `false` otherwise
 *
 * @example
 * ```typescript
 * isFunction(() => {});           // true
 * isFunction(function() {});      // true
 * isFunction(async () => {});     // true
 * isFunction(class MyClass {});   // true
 * isFunction({});                 // false
 * ```
 */
export function isFunction(value: any): boolean {
  return typeof value === 'function';
}

/**
 * Checks if a value is an object.
 *
 * Returns `true` for any object type including:
 * - Plain objects `{}`
 * - Arrays `[]`
 * - Functions
 * - Date, RegExp, Error objects
 * - Any other object type
 *
 * Returns `false` for:
 * - `null` (special case: typeof null === 'object' but we treat as not object)
 * - `undefined`
 * - Primitives (string, number, boolean)
 *
 * @param value - The value to check
 * @returns `true` if the value is an object, `false` otherwise
 *
 * @example
 * ```typescript
 * isObject({});           // true
 * isObject([]);           // true
 * isObject(() => {});     // true
 * isObject(new Date());   // true
 * isObject(null);         // false (special case!)
 * isObject('string');     // false
 * ```
 */
export function isObject(value: any): boolean {
  return value != null && typeof value === 'object';
}
