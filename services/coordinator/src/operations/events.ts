/**
 * Event Operations
 *
 * Coordinator-specific event emitter that loads context from SQL on-demand.
 * Wraps @wonder/events Emitter with lazy context initialization.
 */

import { createEmitter, type Emitter } from '@wonder/events';
import type { DefinitionManager } from './defs';

/**
 * CoordinatorEmitter wraps the standard Emitter with definition-backed context loading
 *
 * Context is loaded lazily on first emit and cached for subsequent emissions.
 * This allows the emitter to be constructed in the DO constructor before
 * definitions are available, matching the pattern used by ContextManager.
 */
export class CoordinatorEmitter implements Emitter {
  private readonly defs: DefinitionManager;
  private readonly eventsService: Env['EVENTS'];
  private readonly traceEnabled: 'true' | 'false';
  private cachedEmitter: Emitter | null = null;

  constructor(defs: DefinitionManager, eventsService: Env['EVENTS'], traceEnabled: boolean) {
    this.defs = defs;
    this.eventsService = eventsService;
    this.traceEnabled = traceEnabled ? 'true' : 'false';
  }

  /**
   * Load event context from definitions (lazy initialization with caching)
   */
  private async getEmitter(): Promise<Emitter> {
    if (this.cachedEmitter) {
      return this.cachedEmitter;
    }

    try {
      // Get workflow run (initialize() must have been called first)
      const workflowRun = this.defs.getWorkflowRun();

      this.cachedEmitter = createEmitter(
        this.eventsService,
        {
          workflow_run_id: workflowRun.id,
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
      // Can't use this.cachedEmitter.emitTrace here as it's not initialized yet
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
    void this.getEmitter().then((emitter) => emitter.emit(event));
  }

  /**
   * Emit trace event(s) for debugging
   */
  emitTrace(event: Parameters<Emitter['emitTrace']>[0]): void {
    void this.getEmitter().then((emitter) => emitter.emitTrace(event));
  }
}
