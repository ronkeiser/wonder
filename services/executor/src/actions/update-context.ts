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
   *
   * Default behavior (mode: 'flatten'):
   *   Arrays are spread into a flat result, scalars are pushed as items.
   *   Example: merge(['a', 'b'], 'c') → ['a', 'b', 'c']
   *
   * Preserve structure mode (mode: 'append'):
   *   Each source is appended as a single element, preserving nested structure.
   *   Example: merge([['a', 'b'], ['c', 'd']], ['e']) → [['a', 'b'], ['c', 'd'], ['e']]
   */
  merge?: {
    /** Output field name */
    target: string;
    /** Input field names to merge */
    sources: string[];
    /** Merge mode: 'flatten' (default) spreads arrays, 'append' preserves structure */
    mode?: 'flatten' | 'append';
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
      eventType: 'update_context_passthrough',
      message: 'Update context action (passthrough)',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
        inputKeys: Object.keys(input),
      },
    });

    return {
      success: true,
      output: input,
      metrics: { durationMs: Date.now() - startTime },
    };
  }

  // Merge mode: combine sources into target
  const { target, sources, mode = 'flatten' } = implementation.merge;
  const merged: unknown[] = [];

  if (mode === 'append') {
    // Append mode: preserve structure, each source becomes one element
    for (const source of sources) {
      const value = input[source];
      if (value === undefined) {
        continue;
      }
      // If the first source is an array, spread it (it's the base)
      // Subsequent sources are appended as elements
      if (merged.length === 0 && Array.isArray(value)) {
        merged.push(...value);
      } else {
        merged.push(value);
      }
    }
  } else {
    // Flatten mode (default): spread arrays, push scalars
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
  }

  const output = {
    ...input,
    [target]: merged,
  };

  logger.info({
    eventType: 'update_context_merge',
    message: 'Update context action (merge)',
    traceId: context.workflowRunId,
    metadata: {
      stepRef: context.stepRef,
      actionId: action.id,
      target,
      sources,
      mode,
      mergedLength: merged.length,
    },
  });

  return {
    success: true,
    output,
    metrics: { durationMs: Date.now() - startTime },
  };
}
