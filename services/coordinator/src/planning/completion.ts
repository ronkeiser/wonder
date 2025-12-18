/**
 * Completion Planning
 *
 * Pure planning module for workflow finalization.
 * Determines final output by applying workflow's output_mapping to context.
 *
 * Key principles:
 * - No side effects (pure functions)
 * - Returns data, not decisions (completion is final)
 * - Same logic as input/output mapping elsewhere
 */

import type { TraceEventInput } from '@wonder/events';
import { extractFromContext } from '../shared';
import type { ContextSnapshot } from '../types';

/** Result from completion planning */
export type CompletionResult = {
  output: Record<string, unknown>;
  events: TraceEventInput[];
};

// ============================================================================
// Main Completion Entry Point
// ============================================================================

/** Extract final workflow output by applying output_mapping to context. */
export function extractFinalOutput(
  outputMapping: Record<string, string> | null,
  context: ContextSnapshot,
): CompletionResult {
  const events: TraceEventInput[] = [];

  events.push({
    type: 'decision.completion.start',
    payload: {
      output_mapping: outputMapping,
      context_keys: {
        input: Object.keys(context.input),
        state: Object.keys(context.state),
        output: Object.keys(context.output),
      },
    },
  });

  if (!outputMapping) {
    // No mapping - return empty output
    events.push({
      type: 'decision.completion.no_mapping',
    });
    return { output: {}, events };
  }

  const output: Record<string, unknown> = {};

  for (const [targetField, sourcePath] of Object.entries(outputMapping)) {
    const value = extractFromContext(sourcePath, context);

    events.push({
      type: 'decision.completion.extract',
      payload: {
        target_field: targetField,
        source_path: sourcePath,
        extracted_value: value,
      },
    });

    output[targetField] = value;
  }

  events.push({
    type: 'decision.completion.complete',
    payload: { final_output: output },
  });

  return { output, events };
}

// ============================================================================
// Pure Helpers
// ============================================================================


/** Apply input mapping to extract task/action input from context. */
export function applyInputMapping(
  mapping: Record<string, string> | null,
  context: ContextSnapshot,
): Record<string, unknown> {
  if (!mapping) return {};

  const result: Record<string, unknown> = {};

  for (const [targetField, sourcePath] of Object.entries(mapping)) {
    result[targetField] = extractFromContext(sourcePath, context);
  }

  return result;
}
