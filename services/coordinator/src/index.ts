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
import { SubworkflowManager } from './operations/subworkflows';
import { ContextManager } from './operations/context';
import { createDb } from './operations/db';
import { DefinitionManager, type SubworkflowParams } from './operations/defs';
import { StatusManager } from './operations/status';
import { TokenManager } from './operations/tokens';
import { errorDetails, errorMessage } from './shared';
import type { PendingDispatch, TaskResult } from './types';

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
  private subworkflows: SubworkflowManager;

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
          streamId: run.rootRunId, // Workflows use rootRunId as the outer boundary
          executionId: run.id, // The specific workflow run
          executionType: 'workflow' as const,
          projectId: run.projectId,
        };
      },
      { traceEnabled: (this.env.TRACE_EVENTS_ENABLED as string) === 'true' },
    );

    // All managers share the same db instance
    this.context = new ContextManager(ctx.storage.sql, this.defs, this.emitter);
    this.tokens = new TokenManager(db, this.emitter);
    this.status = new StatusManager(db, this.emitter);
    this.subworkflows = new SubworkflowManager(db, this.emitter);
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
      subworkflows: this.subworkflows,
      emitter: this.emitter,
      logger: this.logger,
      workflowRunId,
      rootRunId: run.rootRunId,
      resources: this.env.RESOURCES,
      executor: this.env.EXECUTOR,
      coordinator: this.env.COORDINATOR,
      agent: this.env.AGENT,
      enableTraceEvents: options?.enableTraceEvents,
      waitUntil: (promise) => this.ctx.waitUntil(promise),
      scheduleAlarm: (delayMs) => this.scheduleAlarm(delayMs),
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
  async start(workflowRunId: string, options?: { enableTraceEvents?: boolean }): Promise<void> {
    try {
      // Override trace events setting if explicitly specified
      if (options?.enableTraceEvents !== undefined) {
        this.emitter.setTraceEnabled(options.enableTraceEvents);
      }

      // Initialize definition manager (loads/fetches definitions from D1)
      await this.defs.initializeWorkflow(workflowRunId);

      // Delegate to lifecycle module
      const ctx = this.getDispatchContext(workflowRunId, options);
      await startWorkflow(ctx);
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.start.failed',
        message: 'Critical error in start()',
        traceId: workflowRunId,
        metadata: errorDetails(error),
      });
      throw error;
    }
  }

  /**
   * Start an ephemeral subworkflow (no D1 record).
   *
   * Called by parent coordinator when dispatching a subworkflow node.
   * The subworkflow runs to completion and calls back to parent via
   * handleSubworkflowResult() or handleSubworkflowError().
   *
   * Uses alarm-based trampolining to break subrequest depth chain.
   *
   * Note: The runId is passed from the parent (dispatchSubworkflow) and must
   * match the DO ID used to create this coordinator instance. This ensures
   * the executor can callback to the correct coordinator using workflowRunId.
   */
  async startSubworkflow(params: SubworkflowParams): Promise<void> {
    await this.queuePendingDispatch({
      id: crypto.randomUUID(),
      type: 'startSubworkflow',
      payload: params,
      createdAt: Date.now(),
    });
  }

  /**
   * Execute startSubworkflow after trampolining via alarm.
   */
  private async executeStartSubworkflow(params: SubworkflowParams): Promise<void> {
    const { runId } = params;

    try {
      this.logger.info({
        eventType: 'coordinator.subworkflow.starting',
        message: 'Starting ephemeral subworkflow',
        traceId: runId,
        metadata: {
          workflowId: params.workflowId,
          rootRunId: params.rootRunId,
          parentRunId: params.parentRunId,
          parentTokenId: params.parentTokenId,
        },
      });

      // Initialize definitions (loads workflow def, creates synthetic run record)
      await this.defs.initializeSubworkflow({ ...params, runId });

      // Delegate to lifecycle module (same as root workflow)
      const ctx = this.getDispatchContext(runId);
      await startWorkflow(ctx);
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.subworkflow.start_failed',
        message: 'Failed to start subworkflow',
        traceId: runId,
        metadata: {
          workflowId: params.workflowId,
          parentRunId: params.parentRunId,
          parentTokenId: params.parentTokenId,
          ...errorDetails(error),
        },
      });

      // Notify parent of failure
      try {
        const parentCoordinatorId = this.env.COORDINATOR.idFromName(params.parentRunId);
        const parentCoordinator = this.env.COORDINATOR.get(parentCoordinatorId);
        await parentCoordinator.handleSubworkflowError(params.parentTokenId, errorMessage(error));
      } catch (callbackError) {
        this.logger.error({
          eventType: 'coordinator.subworkflow.callback_failed',
          message: 'Failed to notify parent of subworkflow failure',
          traceId: runId,
          metadata: {
            parentRunId: params.parentRunId,
            parentTokenId: params.parentTokenId,
            ...errorDetails(callbackError),
          },
        });
      }

      throw error;
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
          ...errorDetails(error),
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
          ...errorDetails(error),
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
      await applyDecisions([{ type: 'UPDATE_TOKEN_STATUS', tokenId, status: 'executing' }], ctx);
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.mark_executing.failed',
        message: 'Failed to mark token as executing',
        traceId: token.workflowRunId,
        metadata: {
          ...errorDetails(error),
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
          ...errorDetails(error),
          tokenId,
          errorResult,
        },
      });
      throw error;
    }
  }

  /**
   * Handle successful subworkflow completion.
   * Called by subworkflow coordinator when it completes successfully.
   *
   * Uses alarm-based trampolining to break subrequest depth chain.
   */
  async handleSubworkflowResult(
    tokenId: string,
    subworkflowOutput: Record<string, unknown>,
  ): Promise<void> {
    await this.queuePendingDispatch({
      id: crypto.randomUUID(),
      type: 'handleSubworkflowResult',
      payload: { tokenId, output: subworkflowOutput },
      createdAt: Date.now(),
    });
  }

  /**
   * Execute handleSubworkflowResult after trampolining via alarm.
   */
  private async executeHandleSubworkflowResult(
    tokenId: string,
    subworkflowOutput: Record<string, unknown>,
  ): Promise<void> {
    try {
      const token = this.tokens.get(tokenId);

      // State guard: only handle results for tokens waiting for subworkflow
      if (token.status !== 'waiting_for_subworkflow') {
        this.logger.warn({
          eventType: 'coordinator.subworkflow_result.invalid_state',
          message: `Token not waiting for subworkflow: ${token.status}`,
          traceId: token.workflowRunId,
          metadata: { tokenId, status: token.status },
        });
        return; // Idempotent: no-op if already resumed
      }

      this.logger.info({
        eventType: 'coordinator.subworkflow_result.started',
        message: 'Handling subworkflow result',
        traceId: token.workflowRunId,
        metadata: { tokenId, outputKeys: Object.keys(subworkflowOutput) },
      });

      const ctx = this.getDispatchContext(token.workflowRunId);
      await applyDecisions(
        [
          {
            type: 'RESUME_FROM_SUBWORKFLOW',
            tokenId,
            output: subworkflowOutput,
          },
        ],
        ctx,
      );
    } catch (error) {
      this.logger.error({
        eventType: 'coordinator.subworkflow_result.failed',
        message: 'Failed to handle subworkflow result',
        metadata: {
          tokenId,
          ...errorDetails(error),
        },
      });
      throw error;
    }
  }

  /**
   * Handle agent result.
   * Called by ConversationRunner when a workflow-invoked agent completes.
   *
   * Uses alarm-based trampolining to break subrequest depth chain.
   *
   * TODO: Full implementation requires:
   * - 'waiting_for_agent' token status
   * - 'RESUME_FROM_AGENT' decision type
   * - Token tracking for agent dispatch
   */
  async handleAgentResult(nodeId: string, output: { response: string }): Promise<void> {
    await this.queuePendingDispatch({
      id: crypto.randomUUID(),
      type: 'handleAgentResult',
      payload: { nodeId, output },
      createdAt: Date.now(),
    });
  }

  /**
   * Execute handleAgentResult after trampolining via alarm.
   */
  private async executeHandleAgentResult(nodeId: string, output: { response: string }): Promise<void> {
    this.logger.info({
      eventType: 'coordinator.agent_result.received',
      message: 'Received agent result',
      metadata: { nodeId, hasResponse: !!output.response },
    });

    // TODO: Implement full agent result handling
    // For now, log and acknowledge - full implementation needs token tracking
  }

  /**
   * Handle agent error.
   * Called by ConversationRunner when a workflow-invoked agent fails.
   *
   * Uses alarm-based trampolining to break subrequest depth chain.
   *
   * TODO: Full implementation requires:
   * - 'waiting_for_agent' token status
   * - 'FAIL_FROM_AGENT' decision type
   * - Token tracking for agent dispatch
   */
  async handleAgentError(nodeId: string, error: string): Promise<void> {
    await this.queuePendingDispatch({
      id: crypto.randomUUID(),
      type: 'handleAgentError',
      payload: { nodeId, error },
      createdAt: Date.now(),
    });
  }

  /**
   * Execute handleAgentError after trampolining via alarm.
   */
  private async executeHandleAgentError(nodeId: string, error: string): Promise<void> {
    this.logger.warn({
      eventType: 'coordinator.agent_error.received',
      message: 'Received agent error',
      metadata: { nodeId, error },
    });

    // TODO: Implement full agent error handling
    // For now, log and acknowledge - full implementation needs token tracking
  }

  /**
   * Handle subworkflow failure.
   * Called by subworkflow coordinator when it fails.
   *
   * Uses alarm-based trampolining to break subrequest depth chain.
   */
  async handleSubworkflowError(tokenId: string, error: string): Promise<void> {
    await this.queuePendingDispatch({
      id: crypto.randomUUID(),
      type: 'handleSubworkflowError',
      payload: { tokenId, error },
      createdAt: Date.now(),
    });
  }

  /**
   * Execute handleSubworkflowError after trampolining via alarm.
   */
  private async executeHandleSubworkflowError(tokenId: string, error: string): Promise<void> {
    try {
      const token = this.tokens.get(tokenId);

      // State guard: only handle errors for tokens waiting for subworkflow
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
        message: 'Handling subworkflow failure',
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
        message: 'Failed to handle subworkflow error',
        metadata: {
          tokenId,
          originalError: error,
          handlerError: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  // ============================================================================
  // Pending Dispatch Management (alarm-based trampolining)
  // ============================================================================

  /**
   * Queue a pending dispatch and schedule an immediate alarm.
   *
   * This breaks the subrequest depth chain by deferring execution
   * until the alarm fires (which starts a fresh request context).
   */
  private async queuePendingDispatch(dispatch: PendingDispatch): Promise<void> {
    await this.ctx.storage.put(`pending:${dispatch.id}`, dispatch);

    // Schedule immediate alarm to process the dispatch
    const existingAlarm = await this.ctx.storage.getAlarm();
    const now = Date.now();
    if (!existingAlarm || now < existingAlarm) {
      await this.ctx.storage.setAlarm(now);
    }

    this.logger.debug({
      eventType: 'coordinator.pending_dispatch.queued',
      message: `Queued pending dispatch: ${dispatch.type}`,
      metadata: { dispatchId: dispatch.id, type: dispatch.type },
    });
  }

  /**
   * Process all pending dispatches.
   *
   * Called from alarm() handler after depth has been reset.
   */
  private async processPendingDispatches(): Promise<void> {
    const pending = await this.ctx.storage.list<PendingDispatch>({ prefix: 'pending:' });

    if (pending.size === 0) {
      return;
    }

    // Sort by createdAt to maintain FIFO order
    const dispatches = [...pending.entries()].sort(([, a], [, b]) => a.createdAt - b.createdAt);

    this.logger.info({
      eventType: 'coordinator.pending_dispatch.processing',
      message: `Processing ${dispatches.length} pending dispatch(es)`,
      metadata: { count: dispatches.length, types: dispatches.map(([, d]) => d.type) },
    });

    for (const [key, dispatch] of dispatches) {
      try {
        await this.executePendingDispatch(dispatch);
        await this.ctx.storage.delete(key);
      } catch (error) {
        this.logger.error({
          eventType: 'coordinator.pending_dispatch.failed',
          message: `Failed to process pending dispatch: ${dispatch.type}`,
          metadata: {
            dispatchId: dispatch.id,
            type: dispatch.type,
            ...errorDetails(error),
          },
        });
        // Delete failed dispatch to avoid infinite retry loop
        // Errors will surface through workflow failure states
        await this.ctx.storage.delete(key);
      }
    }
  }

  /**
   * Execute a single pending dispatch.
   */
  private async executePendingDispatch(dispatch: PendingDispatch): Promise<void> {
    switch (dispatch.type) {
      case 'startSubworkflow':
        await this.executeStartSubworkflow(dispatch.payload);
        break;
      case 'handleSubworkflowResult':
        await this.executeHandleSubworkflowResult(
          dispatch.payload.tokenId,
          dispatch.payload.output,
        );
        break;
      case 'handleSubworkflowError':
        await this.executeHandleSubworkflowError(dispatch.payload.tokenId, dispatch.payload.error);
        break;
      case 'handleAgentResult':
        await this.executeHandleAgentResult(dispatch.payload.nodeId, dispatch.payload.output);
        break;
      case 'handleAgentError':
        await this.executeHandleAgentError(dispatch.payload.nodeId, dispatch.payload.error);
        break;
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
   * Handles two responsibilities:
   * 1. Process pending dispatches (alarm-based trampolining)
   * 2. Check waiting tokens for timeouts
   */
  async alarm(): Promise<void> {
    // First, process any pending dispatches (this is the trampoline)
    // These take priority because they represent work that needs to be done
    await this.processPendingDispatches();

    // Then check for timeouts (only if we have an initialized workflow)
    try {
      const run = this.defs.getWorkflowRun();
      const ctx = this.getDispatchContext(run.id);

      this.logger.debug({
        eventType: 'coordinator.alarm.checking_timeouts',
        message: 'Checking for timeouts',
        traceId: run.id,
      });

      await checkTimeouts(ctx);
    } catch (error) {
      // If getWorkflowRun() fails, the workflow isn't initialized yet
      // This can happen if alarm fires before initialization completes
      // (e.g., pending dispatch for startSubworkflow)
      if (error instanceof Error && error.message.includes('not initialized')) {
        this.logger.debug({
          eventType: 'coordinator.alarm.no_workflow',
          message: 'No workflow initialized, skipping timeout check',
        });
        return;
      }

      this.logger.error({
        eventType: 'coordinator.alarm.failed',
        message: 'Error in alarm handler',
        metadata: errorDetails(error),
      });
      throw error; // Rethrow to trigger retry
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
