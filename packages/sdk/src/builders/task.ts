/**
 * Task definition builder - Ergonomic helper for creating task definitions
 *
 * Returns a plain typed object that matches CreateTaskDef.
 */

import type { components } from '../generated/schema';

type CreateTaskDef = components['schemas']['CreateTaskDef'];
type CreateStep = components['schemas']['CreateStep'];

/**
 * Create a step for a task definition
 *
 * @example
 * const myStep = step({
 *   ref: 'call_llm',
 *   ordinal: 0,
 *   action_id: 'my-action-id',
 *   action_version: 1,
 *   input_mapping: { prompt: '$.input.prompt' },
 *   output_mapping: { response: '$.result.text' },
 *   on_failure: 'abort'
 * });
 */
export function step(config: {
  ref: string;
  ordinal: number;
  action_id: string;
  action_version: number;
  input_mapping?: Record<string, unknown> | null;
  output_mapping?: Record<string, unknown> | null;
  on_failure?: 'abort' | 'retry' | 'continue';
  condition?: {
    if: string;
    then: 'continue' | 'skip' | 'succeed' | 'fail';
    else: 'continue' | 'skip' | 'succeed' | 'fail';
  } | null;
}): CreateStep {
  return {
    ref: config.ref,
    ordinal: config.ordinal,
    action_id: config.action_id,
    action_version: config.action_version,
    input_mapping: config.input_mapping ?? null,
    output_mapping: config.output_mapping ?? null,
    on_failure: config.on_failure ?? 'abort',
    condition: config.condition ?? null,
  };
}

/**
 * Create a task definition
 *
 * @example
 * const myTask = taskDef({
 *   name: 'Write File Verified',
 *   description: 'Write file with read-back verification',
 *   project_id: 'my-project-id',
 *   input_schema: schema.object({ path: schema.string(), content: schema.string() }),
 *   output_schema: schema.object({ success: schema.boolean() }),
 *   steps: [
 *     step({ ref: 'write', ordinal: 0, action_id: 'write-action', action_version: 1 }),
 *     step({ ref: 'verify', ordinal: 1, action_id: 'read-action', action_version: 1 })
 *   ]
 * });
 */
export function taskDef(config: {
  name: string;
  description?: string;
  version?: number;
  project_id?: string;
  library_id?: string;
  tags?: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  steps: CreateStep[];
  retry?: {
    max_attempts: number;
    backoff: 'none' | 'linear' | 'exponential';
    initial_delay_ms: number;
    max_delay_ms?: number | null;
  };
  timeout_ms?: number;
}): CreateTaskDef {
  // Validate step ordinals are sequential starting from 0
  const ordinals = config.steps.map((s) => s.ordinal).sort((a, b) => a - b);
  for (let i = 0; i < ordinals.length; i++) {
    if (ordinals[i] !== i) {
      throw new Error(
        `Step ordinals must be sequential starting from 0. Got: ${ordinals.join(', ')}`,
      );
    }
  }

  // Validate step refs are unique
  const refs = new Set<string>();
  for (const s of config.steps) {
    if (refs.has(s.ref)) {
      throw new Error(`Duplicate step ref: ${s.ref}`);
    }
    refs.add(s.ref);
  }

  return {
    name: config.name,
    description: config.description,
    version: config.version ?? 1,
    project_id: config.project_id,
    library_id: config.library_id,
    tags: config.tags,
    input_schema: config.input_schema,
    output_schema: config.output_schema,
    steps: config.steps,
    retry: config.retry
      ? {
          ...config.retry,
          max_delay_ms: config.retry.max_delay_ms ?? null,
        }
      : undefined,
    timeout_ms: config.timeout_ms,
  };
}
