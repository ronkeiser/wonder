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
  processTaskError,
  processTaskResult,
  startWorkflow,
  type DispatchContext,
  type TaskErrorResult,
} from './dispatch';
import { ContextManager } from './operations/context';
import { DefinitionManager } from './operations/defs';
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.logger = createLogger(this.ctx, this.env.LOGS, {
      service: this.env.SERVICE,
      environment: this.env.ENVIRONMENT,
    });

    // Initialize DefinitionManager first
    this.defs = new DefinitionManager(ctx, this.env);

    // Initialize emitter with lazy context (deferred until first emit)
    // Context comes from defs.getWorkflowRun() after initialize() is called
    this.emitter = createEmitter(
      this.env.STREAMER,
      () => {
        const run = this.defs.getWorkflowRun();
        return {
          workflowRunId: run.id,
          projectId: run.projectId,
          workflowDefId: run.workflowDefId,
          parentRunId: run.parentRunId,
        };
      },
      { traceEnabled: this.env.TRACE_EVENTS_ENABLED === 'true' },
    );

    this.context = new ContextManager(ctx.storage.sql, this.defs, this.emitter);
    this.tokens = new TokenManager(ctx, this.defs, this.emitter);
  }

  /**
   * Build dispatch context for all operations
   *
   * This bundles all dependencies needed by dispatch functions.
   */
  private getDispatchContext(workflowRunId: string): DispatchContext {
    return {
      tokens: this.tokens,
      context: this.context,
      defs: this.defs,
      emitter: this.emitter,
      logger: this.logger,
      workflowRunId,
      resources: this.env.RESOURCES,
      executor: this.env.EXECUTOR,
      waitUntil: (promise) => this.ctx.waitUntil(promise),
    };
  }

  /**
   * Start workflow execution
   *
   * Note: workflowRunId must be passed because ctx.id.name is undefined inside DO
   * (see https://github.com/cloudflare/workerd/issues/2240)
   */
  async start(workflowRunId: string): Promise<void> {
    try {
      // Initialize definition manager (loads/fetches definitions)
      await this.defs.initialize(workflowRunId);

      // Delegate to lifecycle module
      const ctx = this.getDispatchContext(workflowRunId);
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
      this.tokens.updateStatus(tokenId, 'executing');
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
}

/**
 * Worker entrypoint
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('OK');
  },
};
