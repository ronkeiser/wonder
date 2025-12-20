/**
 * Path Utilities
 *
 * Shared utilities for navigating and extracting values from nested objects.
 * Consolidates duplicated implementations from routing.ts, context.ts, and completion.ts.
 */

import type { ContextSnapshot } from '../types';

// ============================================================================
// Nested Value Access
// ============================================================================

/** Navigate nested object by path parts array. */
export function getNestedValueByParts(obj: unknown, parts: string[]): unknown {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Navigate nested object by dot-separated path string. */
export function getNestedValue(obj: unknown, path: string): unknown {
  return getNestedValueByParts(obj, path.split('.'));
}

/** Set nested value in object by path parts array (immutable). */
export function setNestedValue(
  obj: Record<string, unknown>,
  pathParts: string[],
  value: unknown,
): Record<string, unknown> {
  if (pathParts.length === 0) {
    return value as Record<string, unknown>;
  }

  const result = { ...obj };
  let current = result;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    } else {
      current[part] = { ...(current[part] as Record<string, unknown>) };
    }
    current = current[part] as Record<string, unknown>;
  }

  current[pathParts[pathParts.length - 1]] = value;
  return result;
}

// ============================================================================
// JSONPath Extraction
// ============================================================================

/** Extract value from object using JSONPath-style path (or return literal). */
export function extractJsonPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path.startsWith('$.')) {
    return path;
  }

  const pathParts = path.slice(2).split('.'); // Remove '$.' prefix
  return getNestedValueByParts(obj, pathParts);
}

// ============================================================================
// Context-Aware Extraction
// ============================================================================

/**
 * Extract value from context using JSONPath-style path.
 *
 * Paths are structured as: $.{section}.{field}[.{nested}...]
 * - $.input.name → context.input.name
 * - $.state.result.data → context.state.result.data
 * - $.output.greeting → context.output.greeting
 *
 * Non-JSONPath values (not starting with $.) are returned as literals.
 */
export function extractFromContext(path: string, context: ContextSnapshot): unknown {
  if (!path.startsWith('$.')) {
    return path;
  }

  const pathParts = path.slice(2).split('.'); // Remove '$.' prefix

  // First part must be input, state, or output
  const section = pathParts[0];
  if (section !== 'input' && section !== 'state' && section !== 'output') {
    return undefined;
  }

  const sectionData = context[section as keyof ContextSnapshot];
  return getNestedValueByParts(sectionData, pathParts.slice(1));
}

/**
 * Resolve a field reference path to its value in context.
 *
 * Unlike extractFromContext, this does NOT expect '$.' prefix.
 * The first segment determines the context section (input/state/output).
 * If not a known section, searches across all sections merged together.
 */
export function resolveFieldPath(fieldPath: string, context: ContextSnapshot): unknown {
  const parts = fieldPath.split('.');
  const section = parts[0];

  let current: unknown;

  switch (section) {
    case 'input':
      current = context.input;
      break;
    case 'state':
      current = context.state;
      break;
    case 'output':
      current = context.output;
      break;
    default:
      // Allow direct access if not a known section - search merged context
      current = { ...context.input, ...context.state, ...context.output };
      return getNestedValueByParts(current, parts);
  }

  // Navigate remaining path (skip section prefix)
  return getNestedValueByParts(current, parts.slice(1));
}

// ============================================================================
// Path Parsing
// ============================================================================

/** Parse a dot-notation path into section and field parts. */
export function parsePath(path: string): { section: string; fieldParts: string[] } {
  const [section, ...fieldParts] = path.split('.');
  return { section, fieldParts };
}

/** Filter an object's entries by key prefix. */
export function filterByKeyPrefix<T>(obj: Record<string, T>, prefix: string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith(prefix)) {
      result[key] = value;
    }
  }
  return result;
}