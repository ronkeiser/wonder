/**
 * Condition Evaluation
 *
 * Pure functions for evaluating workflow transition conditions.
 * Extracted from routing.ts for reuse and testability.
 */

import type { Condition, ContextSnapshot, FieldRef, Literal } from '../types';
import { resolveFieldPath } from './path';

// ============================================================================
// Main Entry Point
// ============================================================================

// TODO: Implement CEL expression evaluation. Spec (branching.md) says
// "CEL expressions available as fallback for complex logic not covered
// by structured conditions." Currently throws "not yet supported".

/** Evaluate a condition against context. Returns true if condition is null. */
export function evaluateCondition(
  condition: Condition | null | undefined,
  context: ContextSnapshot,
): boolean {
  if (condition === null || condition === undefined) {
    return true; // Unconditional
  }

  switch (condition.type) {
    case 'comparison':
      return evaluateComparison(condition, context);

    case 'exists':
      return evaluateExists(condition, context);

    case 'in_set':
      return evaluateInSet(condition, context);

    case 'array_length':
      return evaluateArrayLength(condition, context);

    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, context));

    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, context));

    case 'not':
      return !evaluateCondition(condition.condition, context);

    case 'cel':
      // CEL expressions require runtime evaluation - placeholder for now
      throw new Error(`CEL expressions not yet supported: ${condition.expression}`);

    default: {
      // Exhaustive check
      const _exhaustive: never = condition;
      throw new Error(`Unknown condition type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ============================================================================
// Condition Type Evaluators
// ============================================================================

function evaluateComparison(
  condition: Extract<Condition, { type: 'comparison' }>,
  context: ContextSnapshot,
): boolean {
  const left = resolveValue(condition.left, context);
  const right = resolveValue(condition.right, context);

  switch (condition.operator) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
      return (left as number) > (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '<':
      return (left as number) < (right as number);
    case '<=':
      return (left as number) <= (right as number);
    default: {
      const _exhaustive: never = condition.operator;
      throw new Error(`Unknown operator: ${_exhaustive}`);
    }
  }
}

function evaluateExists(
  condition: Extract<Condition, { type: 'exists' }>,
  context: ContextSnapshot,
): boolean {
  const value = resolveField(condition.field, context);
  return value !== undefined && value !== null;
}

function evaluateInSet(
  condition: Extract<Condition, { type: 'in_set' }>,
  context: ContextSnapshot,
): boolean {
  const value = resolveField(condition.field, context);
  return condition.values.includes(value);
}

function evaluateArrayLength(
  condition: Extract<Condition, { type: 'array_length' }>,
  context: ContextSnapshot,
): boolean {
  const value = resolveField(condition.field, context);
  if (!Array.isArray(value)) {
    return false;
  }

  const length = value.length;
  const target = condition.value;

  switch (condition.operator) {
    case '==':
      return length === target;
    case '!=':
      return length !== target;
    case '>':
      return length > target;
    case '>=':
      return length >= target;
    case '<':
      return length < target;
    case '<=':
      return length <= target;
    default: {
      const _exhaustive: never = condition.operator;
      throw new Error(`Unknown operator: ${_exhaustive}`);
    }
  }
}

// ============================================================================
// Value Resolution
// ============================================================================

/** Resolve a field reference or literal to its value. */
function resolveValue(ref: FieldRef | Literal, context: ContextSnapshot): unknown {
  if ('literal' in ref) {
    return ref.literal;
  }
  return resolveField(ref, context);
}

/** Resolve a field path to its value in context. */
function resolveField(ref: FieldRef, context: ContextSnapshot): unknown {
  return resolveFieldPath(ref.field, context);
}
