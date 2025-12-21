/**
 * Condition Evaluation
 *
 * Evaluates transition conditions using @wonder/expressions.
 * Conditions are pre-parsed ASTs that are evaluated at runtime.
 */

import { evaluateAst } from '@wonder/expressions';
import type { Condition, ContextSnapshot } from '../types';

/**
 * Evaluate a condition against context.
 *
 * @param condition - Pre-parsed AST or null/undefined
 * @param context - Context snapshot with input, state, output
 * @returns true if condition is null/undefined (unconditional) or evaluates to truthy
 */
export function evaluateCondition(
  condition: Condition | null | undefined,
  context: ContextSnapshot,
): boolean {
  if (condition === null || condition === undefined) {
    return true; // Unconditional
  }

  const result = evaluateAst(condition, {
    input: context.input,
    state: context.state,
    output: context.output,
  });

  return Boolean(result);
}
