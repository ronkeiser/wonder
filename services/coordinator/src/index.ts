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
import { MetadataManager } from './operations/metadata.js';
import * as tokenOps from './operations/tokens.js';
import * as workflowOps from './operations/workflows.js';
import type { TaskResult, WorkflowDef, WorkflowRun } from './types.js';

/**
 * WorkflowCoordinator Durable Object
 *
 * Each instance coordinates a single workflow run.
 */
export class WorkflowCoordinator extends DurableObject {
  private metadata: MetadataManager;
  private emitter: Emitter;
  private logger: Logger;
  private context: ContextManager;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.logger = createLogger(this.ctx, this.env.LOGS, {
      service: 'coordinator',
      environment: 'development',
    });

    // Initialize MetadataManager first
    this.metadata = new MetadataManager(ctx, ctx.storage.sql, this.env);

    // Initialize emitter with MetadataManager
    this.emitter = new CoordinatorEmitter(
      this.metadata,
      this.env.EVENTS,
      this.env.TRACE_EVENTS_ENABLED === 'true',
    );

    this.context = new ContextManager(ctx.storage.sql, this.metadata, this.emitter);
  }

  /**
   * Start workflow execution
   */
  async start(workflow_run_id: string): Promise<void> {
    try {
      const sql = this.ctx.storage.sql;

      // Initialize metadata manager (loads/fetches metadata)
      await this.metadata.initialize(workflow_run_id);

      // Get metadata for token creation and input
      const workflowRun = await this.metadata.getWorkflowRun();
      const workflowDef = await this.metadata.getWorkflowDef();

      // Extract input from workflow run context
      const context = workflowRun.context as {
        input: Record<string, unknown>;
        state: object;
        output: object;
      };
      const input = context.input;

      // Emit workflow started event
      this.emitter.emit({
        event_type: 'workflow_started',
        message: 'Workflow started',
        metadata: { input },
      });

      // Initialize storage tables
      tokenOps.initializeTable(sql);

      // Initialize context tables and store input
      await this.context.initialize();
      await this.context.initializeWithInput(input);

      // Create initial token
      const tokenId = tokenOps.create(
        sql,
        {
          workflow_run_id: workflowRun.id,
          node_id: workflowDef.initial_node_id,
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
   */
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void> {
    const sql = this.ctx.storage.sql;
    let workflow_run_id: string | undefined;

    try {
      // Mark token as completed
      tokenOps.updateStatus(sql, tokenId, 'completed', this.emitter);
      const token = tokenOps.get(sql, tokenId);
      workflow_run_id = token.workflow_run_id;

      // Emit node completed event
      this.emitter.emit({
        event_type: 'node_completed',
        node_id: token.node_id,
        token_id: tokenId,
        message: 'Node completed',
        metadata: { output: result.output_data },
      });

      // Check if workflow is complete (no more active tokens)
      const activeCount = tokenOps.getActiveCount(sql, workflow_run_id);

      this.emitter.emitTrace({
        type: 'decision.sync.check_condition',
        strategy: 'completion_check',
        completed: 1,
        required: activeCount,
      });

      if (activeCount === 0) {
        await this.finalizeWorkflow(workflow_run_id);
      }

      // For Chunk 1, we don't route to next nodes - single node only
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
      const context = this.context.getSnapshot();

      // For now, output is already in context.output if tasks produced any
      // Future chunks: apply output_mapping from workflow def
      const finalOutput = context.output;

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
        trace_id: workflowRunId,
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
