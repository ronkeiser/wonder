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

import type { DecisionEvent } from '@wonder/events';
import type { ContextSnapshot } from '../types';

/** Result from completion planning */
export type CompletionResult = {
  output: Record<string, unknown>;
  events: DecisionEvent[];
};

// ============================================================================
// Main Completion Entry Point
// ============================================================================

/**
 * Extract final workflow output by applying output_mapping to context.
 *
 * The workflow's output_mapping defines what to extract from context:
 *   { "result": "$.output.greeting", "status": "$.state.final_status" }
 *
 * This extracts context.output.greeting → finalOutput.result, etc.
 *
 * @param outputMapping - Workflow's output_mapping (target -> source JSONPath)
 * @param context - Current context snapshot
 * @returns Final output object and trace events
 */
export function extractFinalOutput(
  outputMapping: Record<string, string> | null,
  context: ContextSnapshot,
): CompletionResult {
  const events: DecisionEvent[] = [];

  events.push({
    type: 'decision.completion.start',
    output_mapping: outputMapping,
    context_keys: {
      input: Object.keys(context.input),
      state: Object.keys(context.state),
      output: Object.keys(context.output),
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
    const value = extractValueFromContext(sourcePath, context);

    events.push({
      type: 'decision.completion.extract',
      target_field: targetField,
      source_path: sourcePath,
      extracted_value: value,
    });

    output[targetField] = value;
  }

  events.push({
    type: 'decision.completion.complete',
    final_output: output,
  });

  return { output, events };
}

// ============================================================================
// Pure Helpers
// ============================================================================

/**
 * Extract value from context using JSONPath-style path.
 *
 * Paths are structured as: $.{section}.{field}[.{nested}...]
 * - $.input.name → context.input.name
 * - $.state.result.data → context.state.result.data
 * - $.output.greeting → context.output.greeting
 *
 * Non-JSONPath values are treated as literals.
 *
 * @param path - JSONPath-style path (e.g., "$.state.result")
 * @param context - Context snapshot to extract from
 * @returns Extracted value or undefined if path doesn't exist
 */
export function extractValueFromContext(path: string, context: ContextSnapshot): unknown {
  // Handle literal values (not starting with $.)
  if (!path.startsWith('$.')) {
    return path;
  }

  const pathParts = path.slice(2).split('.'); // Remove '$.' prefix

  // First part must be input, state, or output
  const section = pathParts[0];
  if (section !== 'input' && section !== 'state' && section !== 'output') {
    return undefined;
  }

  let value: unknown = context[section as keyof ContextSnapshot];

  // Navigate remaining path parts
  for (let i = 1; i < pathParts.length; i++) {
    const part = pathParts[i];
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Apply input mapping to context to extract task/action input.
 *
 * This is the inverse of output mapping - extracts values FROM context
 * to provide as input to a task or action.
 *
 * Mappings: { "taskField": "$.context.path" }
 * - Keys are target fields in the resulting input object
 * - Values are JSONPath-style paths into context
 *
 * @param mapping - Input mapping (target -> source JSONPath)
 * @param context - Context snapshot to extract from
 * @returns Extracted input object
 */
export function applyInputMapping(
  mapping: Record<string, string> | null,
  context: ContextSnapshot,
): Record<string, unknown> {
  if (!mapping) return {};

  const result: Record<string, unknown> = {};

  for (const [targetField, sourcePath] of Object.entries(mapping)) {
    result[targetField] = extractValueFromContext(sourcePath, context);
  }

  return result;
}
