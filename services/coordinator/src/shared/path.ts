/**
 * Path Utilities
 *
 * Shared utilities for navigating and extracting values from nested objects.
 * Consolidates duplicated implementations from routing.ts, context.ts, and completion.ts.
 */

import { evaluate } from '@wonder/expressions';

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

/**
 * Extract value from task output using expression evaluation.
 *
 * Expressions are evaluated with `result` bound to the task output:
 * - result.score → taskOutput.score
 * - result.data.items → taskOutput.data.items
 * - 'literal' → string literal
 */
export function extractFromTaskOutput(expression: string, taskOutput: Record<string, unknown>): unknown {
  return evaluate(expression, { result: taskOutput });
}

// ============================================================================
// Context-Aware Extraction
// ============================================================================

/**
 * Extract value from context using expression evaluation.
 *
 * Expressions are evaluated with input, state, and output as context variables:
 * - input.name → context.input.name
 * - state.result.data → context.state.result.data
 * - output.greeting → context.output.greeting
 * - 'literal string' → string literal
 * - state.count * 2 → computed value
 */
export function extractFromContext(expression: string, context: ContextSnapshot): unknown {
  return evaluate(expression, {
    input: context.input,
    state: context.state,
    output: context.output,
  });
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