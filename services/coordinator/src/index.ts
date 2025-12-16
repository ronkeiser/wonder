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
import type { Emitter } from '@wonder/events';
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
import { CoordinatorEmitter } from './operations/events';
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

    // Initialize emitter with DefinitionManager
    this.emitter = new CoordinatorEmitter(
      this.logger,
      this.defs,
      this.env.EVENTS,
      this.env.TRACE_EVENTS_ENABLED,
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
   * Note: workflow_run_id must be passed because ctx.id.name is undefined inside DO
   * (see https://github.com/cloudflare/workerd/issues/2240)
   */
  async start(workflow_run_id: string): Promise<void> {
    try {
      // Initialize definition manager (loads/fetches definitions)
      await this.defs.initialize(workflow_run_id);

      // Delegate to lifecycle module
      const ctx = this.getDispatchContext(workflow_run_id);
      await startWorkflow(ctx);
    } catch (error) {
      this.logger.error({
        event_type: 'coordinator_start_failed',
        message: 'Critical error in start()',
        trace_id: workflow_run_id,
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
    let workflow_run_id: string | undefined;

    try {
      // Get workflow_run_id from token for context
      const token = this.tokens.get(tokenId);
      workflow_run_id = token.workflow_run_id;

      // Delegate to task module
      const ctx = this.getDispatchContext(workflow_run_id);
      await processTaskResult(ctx, tokenId, result);
    } catch (error) {
      this.logger.error({
        event_type: 'coordinator_task_result_failed',
        message: 'Critical error in handleTaskResult()',
        trace_id: workflow_run_id,
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
   * Handle task error from Executor
   *
   * Called when task execution fails. May trigger retry based on error type.
   */
  async handleTaskError(tokenId: string, errorResult: TaskErrorResult): Promise<void> {
    let workflow_run_id: string | undefined;

    try {
      // Get workflow_run_id from token for context
      const token = this.tokens.get(tokenId);
      workflow_run_id = token.workflow_run_id;

      // Delegate to lifecycle module
      const ctx = this.getDispatchContext(workflow_run_id);
      processTaskError(ctx, tokenId, errorResult);
    } catch (error) {
      this.logger.error({
        event_type: 'coordinator_task_error_failed',
        message: 'Critical error in handleTaskError()',
        trace_id: workflow_run_id,
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
    return new Response('OK', {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
