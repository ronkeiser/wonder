/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle via RPC.
 *
 * This is a thin orchestration layer - the DO handles RPC boundaries
 * and error logging, delegating business logic to the dispatch layer
 * which handles workflow progression, task execution, and fan-out/fan-in.
 */
import { createEmitter, type Emitter } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import {
  applyDecisions,
  checkTimeouts,
  processTaskError,
  processTaskResult,
  startWorkflow,
  type DispatchContext,
  type TaskErrorResult,
} from './dispatch';
import { ChildWorkflowManager } from './operations/child-workflows';
import { ContextManager } from './operations/context';
import { createDb } from './operations/db';
import { DefinitionManager } from './operations/defs';
import { StatusManager } from './operations/status';
import { TokenManager } from './operations/tokens';
import type { TaskResult } from './types';

/**
 * WorkflowCoordinator Durable Object
 *
 * Each instance coordinates a single workflow run.
 */
export class WorkflowCoordinator extends DurableObject {
  private defs: DefinitionManager;
  private emitter: Emitter;
  private logger: Logger;
  private context: ContextManager;
  private tokens: TokenManager;
  private status: StatusManager;
  private childWorkflows: ChildWorkflowManager;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.logger = createLogger(this.ctx, this.env.LOGS, {
      service: this.env.SERVICE,
      environment: this.env.ENVIRONMENT,
    });

    // Create shared database instance
    const db = createDb(ctx);

    // Initialize DefinitionManager first (needs db, ctx for logger, env for resources)
    this.defs = new DefinitionManager(db, ctx, this.env);

    // Initialize emitter with lazy context (deferred until first emit)
    // Context comes from defs.getWorkflowRun() after initialize() is called
    this.emitter = createEmitter(
      this.env.STREAMER,
      () => {
        const run = this.defs.getWorkflowRun();
        return {
          workflowRunId: run.id,
          rootRunId: run.rootRunId,
          projectId: run.projectId,
          workflowDefId: run.workflowDefId,
        };
      },
      { traceEnabled: (this.env.TRACE_EVENTS_ENABLED as string) === 'true' },
    );

    // All managers share the same db instance
    this.context = new ContextManager(ctx.storage.sql, this.defs, this.emitter);
    this.tokens = new TokenManager(db, this.emitter);
    this.status = new StatusManager(db, this.emitter);
    this.childWorkflows = new ChildWorkflowManager(db, this.emitter);
  }

  /**
   * Build dispatch context for all operations
   *
   * This bundles all dependencies needed by dispatch functions.
   */
  private getDispatchContext(
    workflowRunId: string,
    options?: { enableTraceEvents?: boolean },
  ): DispatchContext {
    const run = this.defs.getWorkflowRun();
    return {
      tokens: this.tokens,
      context: this.context,
      defs: this.defs,
      status: this.status,
      childWorkflows: this.childWorkflows,
      emitter: this.emitter,
      logger: this.logger,
      workflowRunId,
      rootRunId: run.rootRunId,
      resources: this.env.RESOURCES,
      executor: this.env.EXECUTOR,
      coordinator: this.env.COORDINATOR,
      waitUntil: (promise) => this.ctx.waitUntil(promise),
      scheduleAlarm: (delayMs) => this.scheduleAlarm(delayMs),
      enableTraceEvents: options?.enableTraceEvents,
    };
  }

  /**
   * Start workflow execution
   *
   * Note: workflowRunId must be passed because ctx.id.name is undefined inside DO
   * (see https://github.com/cloudflare/workerd/issues/2240)
   *
   * @param workflowRunId - The workflow run ID
   * @param options - Optional execution options
   * @param options.enableTraceEvents - Enable/disable trace events for this run (overrides env var)
   */
  async start(
    workflowRunId: string,
    options?: { enableTraceEvents?: boolean },
  ): Promise<void> {
    try {
      // Override trace events setting if explicitly specified
      if (options?.enableTraceEvents !== undefined) {
        this.emitter.setTraceEnabled(options.enableTraceEvents);
      }

      // Initialize definition manager (loads/fetches definitions)
      await this.defs.initialize(workflowRunId);

      // Delegate to lifecycle module
      const ctx = this.getDispatchContext(workflowRunId, options);
      await startWorkflow(ctx);
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.start.failed',
        message: 'Critical error in start()',
        traceId: workflowRunId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Handle task result from Executor
   *
   * Called when executor completes a task successfully.
   * Routes to linear flow (output mapping) or fan-out flow (branch table).
   */
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void> {
    let workflowRunId: string | undefined;

    try {
      // Get workflowRunId from token for context
      const token = this.tokens.get(tokenId);
      workflowRunId = token.workflowRunId;

      // Delegate to task module
      const ctx = this.getDispatchContext(workflowRunId);
      await processTaskResult(ctx, tokenId, result);
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.task_result.failed',
        message: 'Critical error in handleTaskResult()',
        traceId: workflowRunId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          tokenId,
          result,
        },
      });
      throw error;
    }
  }

  /**
   * Mark token as executing
   *
   * Called by Executor when it starts running a task.
   * This transition (dispatched → executing) enables observability:
   * a token stuck in 'dispatched' means executor never received it.
   */
  async markTokenExecuting(tokenId: string): Promise<void> {
    const token = this.tokens.get(tokenId);

    // State guard: only transition from dispatched
    if (token.status !== 'dispatched') {
      this.logger.warn({
        eventType: 'coordinator.mark_executing.invalid_state',
        message: `Cannot transition to executing from ${token.status}`,
        traceId: token.workflowRunId,
        metadata: {
          tokenId,
          currentStatus: token.status,
          expectedStatus: 'dispatched',
        },
      });
      return; // Idempotent: no-op if already executing/completed
    }

    try {
      const ctx = this.getDispatchContext(token.workflowRunId);
      await applyDecisions(
        [{ type: 'UPDATE_TOKEN_STATUS', tokenId, status: 'executing' }],
        ctx,
      );
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.mark_executing.failed',
        message: 'Failed to mark token as executing',
        traceId: token.workflowRunId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          tokenId,
        },
      });
      throw error;
    }
  }

  /**
   * Handle task error from Executor
   *
   * Called when task execution fails. May trigger retry based on error type.
   */
  async handleTaskError(tokenId: string, errorResult: TaskErrorResult): Promise<void> {
    let workflowRunId: string | undefined;

    try {
      // Get workflowRunId from token for context
      const token = this.tokens.get(tokenId);
      workflowRunId = token.workflowRunId;

      // Delegate to lifecycle module
      const ctx = this.getDispatchContext(workflowRunId);
      await processTaskError(ctx, tokenId, errorResult);
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.task_error.failed',
        message: 'Critical error in handleTaskError()',
        traceId: workflowRunId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          tokenId,
          errorResult,
        },
      });
      throw error;
    }
  }

  /**
   * Schedule an alarm to fire after delayMs.
   *
   * Only schedules if no alarm exists or the new alarm is earlier.
   */
  async scheduleAlarm(delayMs: number): Promise<void> {
    const existingAlarm = await this.ctx.storage.getAlarm();
    const newAlarmTime = Date.now() + delayMs;

    // Only schedule if no alarm exists or new alarm is earlier
    if (!existingAlarm || newAlarmTime < existingAlarm) {
      await this.ctx.storage.setAlarm(newAlarmTime);

      this.logger.info({
        eventType: 'coordinator.alarm.scheduled',
        message: `Alarm scheduled for ${delayMs}ms from now`,
        metadata: { delayMs, alarmTime: new Date(newAlarmTime).toISOString() },
      });
    }
  }

  /**
   * Alarm handler - called by Cloudflare when the scheduled alarm fires.
   *
   * Checks all waiting tokens for timeouts and applies appropriate actions.
   */
  async alarm(): Promise<void> {
    try {
      const run = this.defs.getWorkflowRun();
      const ctx = this.getDispatchContext(run.id);

      this.logger.info({
        eventType: 'coordinator.alarm.fired',
        message: 'Timeout alarm fired',
        traceId: run.id,
      });

      await checkTimeouts(ctx);
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.alarm.failed',
        message: 'Error in alarm handler',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error; // Rethrow to trigger retry
    }
  }

  /**
   * Resume a token that was waiting for a sub-workflow to complete.
   * Called by child coordinator when it completes successfully.
   */
  async resumeFromSubworkflow(
    tokenId: string,
    childOutput: Record<string, unknown>,
  ): Promise<void> {
    try {
      const token = this.tokens.get(tokenId);

      // State guard: only resume tokens waiting for sub-workflow
      if (token.status !== 'waiting_for_subworkflow') {
        this.logger.warn({
          eventType: 'coordinator.resume_subworkflow.invalid_state',
          message: `Token not waiting for subworkflow: ${token.status}`,
          traceId: token.workflowRunId,
          metadata: { tokenId, status: token.status },
        });
        return; // Idempotent: no-op if already resumed
      }

      this.logger.info({
        eventType: 'coordinator.resume_subworkflow.started',
        message: 'Resuming token from sub-workflow completion',
        traceId: token.workflowRunId,
        metadata: { tokenId, outputKeys: Object.keys(childOutput) },
      });

      const ctx = this.getDispatchContext(token.workflowRunId);
      await applyDecisions(
        [
          {
            type: 'RESUME_FROM_SUBWORKFLOW',
            tokenId,
            output: childOutput,
          },
        ],
        ctx,
      );
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.resume_subworkflow.failed',
        message: 'Failed to resume from sub-workflow',
        metadata: {
          tokenId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Handle sub-workflow failure.
   * Called by child coordinator when it fails.
   */
  async handleSubworkflowError(tokenId: string, error: string): Promise<void> {
    try {
      const token = this.tokens.get(tokenId);

      // State guard: only handle errors for tokens waiting for sub-workflow
      if (token.status !== 'waiting_for_subworkflow') {
        this.logger.warn({
          eventType: 'coordinator.subworkflow_error.invalid_state',
          message: `Token not waiting for subworkflow: ${token.status}`,
          traceId: token.workflowRunId,
          metadata: { tokenId, status: token.status },
        });
        return;
      }

      this.logger.info({
        eventType: 'coordinator.subworkflow_error.started',
        message: 'Handling sub-workflow failure',
        traceId: token.workflowRunId,
        metadata: { tokenId, error },
      });

      const ctx = this.getDispatchContext(token.workflowRunId);
      await applyDecisions(
        [
          {
            type: 'FAIL_FROM_SUBWORKFLOW',
            tokenId,
            error,
          },
        ],
        ctx,
      );
    } catch (err) {
      this.logger.error({
        eventType: 'coordinator.subworkflow_error.failed',
        message: 'Failed to handle sub-workflow error',
        metadata: {
          tokenId,
          originalError: error,
          handlerError: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  /**
   * Cancel this workflow run.
   * Called by parent coordinator when it is cancelled/failed (cascade cancellation).
   */
  async cancel(reason: string): Promise<void> {
    try {
      const run = this.defs.getWorkflowRun();

      this.logger.info({
        eventType: 'coordinator.cancel.started',
        message: 'Cancelling workflow',
        traceId: run.id,
        metadata: { reason },
      });

      const ctx = this.getDispatchContext(run.id);
      await applyDecisions(
        [
          {
            type: 'FAIL_WORKFLOW',
            error: `Cancelled: ${reason}`,
          },
        ],
        ctx,
      );
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.cancel.failed',
        message: 'Failed to cancel workflow',
        metadata: {
          reason,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}

/**
 * Worker entrypoint
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('OK');
  },
};
