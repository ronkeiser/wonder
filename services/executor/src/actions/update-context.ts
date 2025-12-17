/**
 * Update Context Action Handler
 *
 * Pure data transformation action. Supports:
 * - Passthrough: returns input as output (default)
 * - Merge: combines input fields into a target field
 *
 * Future: Full expression evaluation via @wonder/expressions
 */

import type { ActionDeps, ActionInput, ActionOutput } from './types';

/**
 * Implementation shape for update_context actions
 */
interface UpdateContextImplementation {
  /**
   * Merge multiple input fields into a single output field.
   * Arrays are concatenated, scalars are wrapped in arrays then concatenated.
   */
  merge?: {
    /** Output field name */
    target: string;
    /** Input field names to merge */
    sources: string[];
  };
}

/**
 * Execute an update_context action
 */
export async function executeUpdateContextAction(
  actionInput: ActionInput,
  deps: ActionDeps,
): Promise<ActionOutput> {
  const { action, input, context } = actionInput;
  const { logger } = deps;
  const startTime = Date.now();

  const implementation = action.implementation as UpdateContextImplementation | undefined;

  // If no implementation or no merge, passthrough
  if (!implementation?.merge) {
    logger.info({
      event_type: 'update_context_passthrough',
      message: 'Update context action (passthrough)',
      trace_id: context.workflowRunId,
      metadata: {
        step_ref: context.stepRef,
        action_id: action.id,
        input_keys: Object.keys(input),
      },
    });

    return {
      success: true,
      output: input,
      metrics: { duration_ms: Date.now() - startTime },
    };
  }

  // Merge mode: combine sources into target
  const { target, sources } = implementation.merge;
  const merged: unknown[] = [];

  for (const source of sources) {
    const value = input[source];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      merged.push(...value);
    } else {
      merged.push(value);
    }
  }

  const output = {
    ...input,
    [target]: merged,
  };

  logger.info({
    event_type: 'update_context_merge',
    message: 'Update context action (merge)',
    trace_id: context.workflowRunId,
    metadata: {
      step_ref: context.stepRef,
      action_id: action.id,
      target,
      sources,
      merged_length: merged.length,
    },
  });

  return {
    success: true,
    output,
    metrics: { duration_ms: Date.now() - startTime },
  };
}
