/**
 * Executor Event Emitter
 *
 * Creates trace event emitter for executor observability.
 * Uses same pattern as coordinator but with simpler context (no SQL/DO state).
 */

import { createEmitter, type Emitter } from '@wonder/events';

export interface ExecutorEmitterContext {
  workflow_run_id: string;
  project_id: string;
  token_id: string;
}

/**
 * Create an emitter for executor trace events
 *
 * Unlike CoordinatorEmitter, this is simpler because:
 * - Context is passed in (not loaded from SQL)
 * - No lazy initialization needed
 * - Lifecycle tied to task execution, not DO
 */
export function createExecutorEmitter(
  eventsService: Env['EVENTS'],
  context: ExecutorEmitterContext,
  options: { traceEnabled: 'true' | 'false' },
): Emitter {
  return createEmitter(
    eventsService,
    {
      workflow_run_id: context.workflow_run_id,
      project_id: context.project_id,
      // Executor doesn't have workflow_def_id readily available, but trace events don't require it
      workflow_def_id: '', // Will be filtered by workflow_run_id
      parent_run_id: null,
    },
    options,
  );
}
