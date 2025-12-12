/**
 * Event Operations
 *
 * Coordinator-specific event emitter that loads context from SQL on-demand.
 * Wraps @wonder/events Emitter with lazy context initialization.
 */

import { createEmitter, type Emitter } from '@wonder/events';
import { getWorkflowRun } from './initialize.js';

/**
 * CoordinatorEmitter wraps the standard Emitter with SQL-backed context loading
 *
 * Context is loaded lazily on first emit and cached for subsequent emissions.
 * This allows the emitter to be constructed in the DO constructor before
 * metadata is available, matching the pattern used by ContextManager.
 */
export class CoordinatorEmitter implements Emitter {
  private readonly sql: SqlStorage;
  private readonly eventsService: Env['EVENTS'];
  private readonly traceEnabled: 'true' | 'false';
  private cachedEmitter: Emitter | null = null;

  constructor(sql: SqlStorage, eventsService: Env['EVENTS'], traceEnabled: boolean) {
    this.sql = sql;
    this.eventsService = eventsService;
    this.traceEnabled = traceEnabled ? 'true' : 'false';
  }

  /**
   * Load event context from metadata table (lazy initialization with caching)
   */
  private getEmitter(): Emitter {
    if (this.cachedEmitter) {
      return this.cachedEmitter;
    }

    try {
      console.log('[CoordinatorEmitter] loading context from metadata');

      // Use shared utility from initialize.ts
      const workflowRun = getWorkflowRun(this.sql);

      console.log('[CoordinatorEmitter] context loaded', {
        workflow_run_id: workflowRun.id,
        workspace_id: workflowRun.workspace_id,
        project_id: workflowRun.project_id,
      });

      this.cachedEmitter = createEmitter(
        this.eventsService,
        {
          workflow_run_id: workflowRun.id,
          workspace_id: workflowRun.workspace_id,
          project_id: workflowRun.project_id,
          workflow_def_id: workflowRun.workflow_def_id,
          parent_run_id: workflowRun.parent_run_id,
        },
        {
          traceEnabled: this.traceEnabled,
        },
      );

      return this.cachedEmitter;
    } catch (error) {
      console.error('[CoordinatorEmitter] FATAL: Failed to load context from metadata:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Emit a workflow event
   */
  emit(event: Parameters<Emitter['emit']>[0]): void {
    this.getEmitter().emit(event);
  }

  /**
   * Emit trace event(s) for debugging
   */
  emitTrace(event: Parameters<Emitter['emitTrace']>[0]): void {
    this.getEmitter().emitTrace(event);
  }
}
