/**
 * Task definition builder - Ergonomic helper for creating task definitions
 *
 * Returns a plain typed object that matches CreateTask.
 * Steps can embed actions for automatic creation by createWorkflow.
 */

import { type EmbeddedAction, type EmbeddedStep, type EmbeddedTask, TASK_DEF } from './embedded';

/**
 * Create a step for a task definition
 *
 * @example
 * // With action ID (references existing action, uses latest version)
 * const myStep = step({
 *   ref: 'call_llm',
 *   ordinal: 0,
 *   actionId: 'my-action-id',
 *   inputMapping: { prompt: '$.input.prompt' },
 *   outputMapping: { response: '$.result.text' },
 * });
 *
 * // With embedded action (auto-created by createWorkflow)
 * const myStep = step({
 *   ref: 'call_llm',
 *   ordinal: 0,
 *   action: action({...}),  // will be created automatically
 * });
 */
export function step(config: {
  ref: string;
  ordinal: number;
  actionId?: string;
  action?: EmbeddedAction;
  inputMapping?: Record<string, unknown> | null;
  outputMapping?: Record<string, unknown> | null;
  onFailure?: 'abort' | 'retry' | 'continue';
  condition?: {
    if: string;
    then: 'continue' | 'skip' | 'succeed' | 'fail';
    else: 'continue' | 'skip' | 'succeed' | 'fail';
  } | null;
}): EmbeddedStep {
  if (!config.actionId && !config.action) {
    throw new Error('Step must have either actionId or action');
  }
  return {
    ref: config.ref,
    ordinal: config.ordinal,
    actionId: config.actionId,
    action: config.action,
    inputMapping: config.inputMapping ?? null,
    outputMapping: config.outputMapping ?? null,
    onFailure: config.onFailure ?? 'abort',
    condition: config.condition ?? null,
  };
}

/**
 * Create a task definition
 *
 * @example
 * // With action IDs (references existing action, uses latest version)
 * const myTask = taskDef({
 *   name: 'Write File Verified',
 *   description: 'Write file with read-back verification',
 *   projectId: 'my-project-id',
 *   inputSchema: schema.object({ path: schema.string(), content: schema.string() }),
 *   outputSchema: schema.object({ success: schema.boolean() }),
 *   steps: [
 *     step({ ref: 'write', ordinal: 0, actionId: 'write-action' }),
 *   ]
 * });
 *
 * // With embedded actions (auto-created by createWorkflow)
 * const myTask = taskDef({
 *   name: 'Summarize',
 *   inputSchema: schema.object({ text: schema.string() }),
 *   outputSchema: schema.object({ summary: schema.string() }),
 *   steps: [
 *     step({
 *       ref: 'summarize',
 *       ordinal: 0,
 *       action: action({
 *         promptSpec: promptSpec({...}),
 *         ...
 *       }),
 *     }),
 *   ]
 * });
 */
export function task(config: {
  name: string;
  description?: string;
  version?: number;
  projectId?: string;
  libraryId?: string;
  tags?: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  steps: EmbeddedStep[];
  retry?: {
    maxAttempts: number;
    backoff: 'none' | 'linear' | 'exponential';
    initialDelayMs: number;
    maxDelayMs?: number | null;
  };
  timeoutMs?: number;
}): EmbeddedTask {
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
    [TASK_DEF]: true,
    name: config.name,
    description: config.description,
    version: config.version ?? 1,
    projectId: config.projectId,
    libraryId: config.libraryId,
    tags: config.tags,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    steps: config.steps,
    retry: config.retry
      ? {
          ...config.retry,
          maxDelayMs: config.retry.maxDelayMs ?? null,
        }
      : undefined,
    timeoutMs: config.timeoutMs,
  };
}
