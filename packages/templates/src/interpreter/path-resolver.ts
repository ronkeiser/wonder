/**
 * Path Resolution
 *
 * Functions for resolving PathExpressions by walking property chains
 * using secure lookupProperty access.
 */

import type { PathExpression } from '../parser/ast-nodes.js';
import { lookupProperty } from '../runtime/utils.js';
import type { ContextStack } from './context-stack.js';
import type { DataStack } from './data-stack.js';

/**
 * Resolve a path by walking through parts sequentially.
 *
 * Uses lookupProperty for secure property access. Returns undefined
 * if any intermediate value is null/undefined, or if the final value
 * doesn't exist.
 *
 * @param context - The object to resolve the path from
 * @param parts - Array of property names to walk through
 * @param prefixFirstPart - Optional string to prepend to the first part (e.g., '@' for data variables)
 * @returns The resolved value, or undefined if not found
 *
 * @example
 * ```typescript
 * resolvePath({foo: {bar: 'baz'}}, ['foo', 'bar']); // 'baz'
 * resolvePath({foo: null}, ['foo', 'bar']); // undefined
 * resolvePath({foo: 'bar'}, []); // {foo: 'bar'} (empty parts = this)
 * resolvePath(dataFrame, ['root', 'items', '0'], '@'); // dataFrame['@root'].items[0]
 * ```
 */
export function resolvePath(context: any, parts: string[], prefixFirstPart?: string): any {
  // Empty parts means {{this}} - return context as-is
  if (parts.length === 0) {
    return context;
  }

  // Start with the provided context
  let current = context;

  // Walk through each part
  for (let i = 0; i < parts.length; i++) {
    // If current is null or undefined, can't continue
    if (current == null) {
      return undefined;
    }

    // For the first part, prepend the prefix if provided
    const part = i === 0 && prefixFirstPart ? prefixFirstPart + parts[i] : parts[i];

    // Special case: Allow accessing 'length' on string primitives for Handlebars compatibility
    // This is safe since length is just a number, not a method
    if (typeof current === 'string' && part === 'length') {
      current = current.length;
    } else {
      // Use lookupProperty for security (prevents prototype pollution)
      current = lookupProperty(current, part);
    }

    // If we got undefined, stop here
    // Note: null is a valid intermediate value and should continue
    // but lookupProperty will return undefined for null parent on next iteration
  }

  return current;
}

/**
 * Resolve a PathExpression using context and data stacks.
 *
 * Handles both regular variables (from context) and data variables (@-prefixed).
 * Supports parent scope access via depth (../, ../../, etc.).
 *
 * @param pathExpr - The PathExpression to resolve
 * @param contextStack - Stack of context objects
 * @param dataStack - Stack of data frames
 * @returns The resolved value, or undefined if not found
 *
 * @example
 * ```typescript
 * // Regular variable: {{foo}}
 * resolvePathExpression(
 *   { type: 'PathExpression', data: false, depth: 0, parts: ['foo'], original: 'foo', loc: null },
 *   contextStack,
 *   dataStack
 * ); // Returns current context's foo property
 *
 * // Parent variable: {{../parent}}
 * resolvePathExpression(
 *   { type: 'PathExpression', data: false, depth: 1, parts: ['parent'], original: '../parent', loc: null },
 *   contextStack,
 *   dataStack
 * ); // Returns parent context's parent property
 *
 * // Data variable: {{@index}}
 * resolvePathExpression(
 *   { type: 'PathExpression', data: true, depth: 0, parts: ['index'], original: '@index', loc: null },
 *   contextStack,
 *   dataStack
 * ); // Returns current data frame's @index
 * ```
 */
export function resolvePathExpression(
  pathExpr: PathExpression,
  contextStack: ContextStack,
  dataStack: DataStack,
): any {
  // Data variables (@foo) cannot use parent scope references (../)
  // This is a Handlebars security/consistency restriction
  // Check both depth > 0 and ".." in parts (parser may leave .. as a part)
  if (pathExpr.data && (pathExpr.depth > 0 || pathExpr.parts.includes('..'))) {
    throw new Error(
      `Data variables cannot access parent scopes. Invalid path: ${pathExpr.original}`,
    );
  }

  // Determine which stack to use based on data flag
  const stack = pathExpr.data ? dataStack : contextStack;

  // Get the starting point based on depth
  const startContext = stack.getAtDepth(pathExpr.depth);

  // If stack is empty or context is undefined, return undefined
  if (startContext === undefined) {
    return undefined;
  }

  // For data variables, prepend @ to the first part (e.g., 'root' -> '@root')
  // Subsequent parts are normal property access (e.g., '@root.items.0')
  const prefix = pathExpr.data ? '@' : undefined;

  // Walk the path parts from the starting context
  return resolvePath(startContext, pathExpr.parts, prefix);
}
