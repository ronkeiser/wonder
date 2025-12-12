/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle via RPC.
 */
import type { Emitter } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import { ContextManager } from './operations/context.js';
import { CoordinatorEmitter } from './operations/events.js';
import { initialize } from './operations/initialize.js';
import * as tokenOps from './operations/tokens.js';
import * as workflowOps from './operations/workflows.js';
import type { TaskResult, WorkflowDef, WorkflowRun } from './types.js';

/**
 * WorkflowCoordinator Durable Object
 *
 * Each instance coordinates a single workflow run.
 */
export class WorkflowCoordinator extends DurableObject {
  private workflowRun: WorkflowRun;
  private workflowDef: WorkflowDef;
  private emitter: Emitter;
  private logger: Logger;
  private contextManager: ContextManager;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    let metadata: { workflowRun: WorkflowRun; workflowDef: WorkflowDef } | undefined;

    this.ctx.blockConcurrencyWhile(async () => {
      metadata = await initialize(this.ctx.storage.sql, this.env, this.ctx.id.toString());
    });

    if (!metadata) {
      throw new Error('Failed to initialize metadata');
    }

    this.workflowRun = metadata.workflowRun;
    this.workflowDef = metadata.workflowDef;

    this.emitter = new CoordinatorEmitter(
      ctx.storage.sql,
      this.env.EVENTS,
      this.env.TRACE_EVENTS_ENABLED === 'true',
    );

    this.logger = createLogger(this.ctx, this.env.LOGS, {
      service: 'coordinator',
      environment: 'development',
    });

    this.contextManager = new ContextManager(ctx.storage.sql, this.emitter);
  }

  /**
   * Start workflow execution
   */
  async start(input: Record<string, unknown>): Promise<void> {
    try {
      const sql = this.ctx.storage.sql;

      // Emit workflow started event
      this.emitter.emit({
        event_type: 'workflow_started',
        message: 'Workflow started',
        metadata: { input },
      });

      // Initialize storage tables
      tokenOps.initializeTable(sql);

      // Initialize context tables and store input
      this.contextManager.initialize();
      this.contextManager.initializeWithInput(input);

      // Create initial token
      const tokenId = tokenOps.create(
        sql,
        {
          workflow_run_id: this.workflowRun.id,
          node_id: this.workflowDef.initial_node_id,
          parent_token_id: null,
          path_id: 'root',
          fan_out_transition_id: null,
          branch_index: 0,
          branch_total: 1,
        },
        this.emitter,
      );

      // Dispatch token (start execution)
      await this.dispatchToken(tokenId);
    } catch (error) {
      this.logger.error({
        event_type: 'coordinator_start_failed',
        message: 'Critical error in start()',
        trace_id: this.workflowRun.id,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          input,
        },
      });
      throw error;
    }
  }

  /**
   * Handle task result from Executor
   */
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void> {
    try {
      const sql = this.ctx.storage.sql;

      // Mark token as completed
      tokenOps.updateStatus(sql, tokenId, 'completed', this.emitter);
      const token = tokenOps.get(sql, tokenId);

      // Emit node completed event
      this.emitter.emit({
        event_type: 'node_completed',
        node_id: token.node_id,
        token_id: tokenId,
        message: 'Node completed',
        metadata: { output: result.output_data },
      });

      // Check if workflow is complete (no more active tokens)
      const activeCount = tokenOps.getActiveCount(sql, token.workflow_run_id);

      this.emitter.emitTrace({
        type: 'decision.sync.check_condition',
        strategy: 'completion_check',
        completed: 1,
        required: activeCount,
      });

      if (activeCount === 0) {
        await this.finalizeWorkflow(token.workflow_run_id);
      }

      // For Chunk 1, we don't route to next nodes - single node only
    } catch (error) {
      this.logger.error({
        event_type: 'coordinator_task_result_failed',
        message: 'Critical error in handleTaskResult()',
        trace_id: this.workflowRun.id,
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
   * Dispatch token to Executor
   */
  private async dispatchToken(tokenId: string): Promise<void> {
    this.emitter.emitTrace({
      type: 'dispatch.batch.start',
      decision_count: 1,
    });

    const sql = this.ctx.storage.sql;

    // Update token status to executing
    tokenOps.updateStatus(sql, tokenId, 'executing', this.emitter);

    // For Chunk 1, immediately complete the token with empty output
    // In future chunks, we'll dispatch to the Executor service
    await this.handleTaskResult(tokenId, { output_data: {} });
  }

  /**
   * Finalize workflow and extract output
   */
  private async finalizeWorkflow(workflowRunId: string): Promise<void> {
    try {
      this.emitter.emitTrace({
        type: 'decision.sync.activate',
        merge_config: { workflow_run_id: workflowRunId },
      });

      // Get context snapshot
      const context = this.contextManager.getSnapshot();

      // Extract output (simplified for Chunk 2 - just use current output or input)
      // Future chunks: apply output_mapping from workflow def
      const finalOutput = Object.keys(context.output).length > 0 ? context.output : context.input; // Fallback to input if no output set

      // Write final output to context
      if (Object.keys(finalOutput).length > 0) {
        this.contextManager.set('output', finalOutput);
      }

      this.emitter.emitTrace({
        type: 'operation.context.read',
        path: 'output',
        value: finalOutput,
      });

      // Emit workflow completed event
      this.emitter.emit({
        event_type: 'workflow_completed',
        message: 'Workflow completed',
        metadata: { output: finalOutput },
      });
    } catch (error) {
      this.logger.error({
        event_type: 'coordinator_finalize_failed',
        message: 'Critical error in finalizeWorkflow()',
        trace_id: this.workflowRun.id,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          workflowRunId,
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
