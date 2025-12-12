/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle via RPC.
 */
import type { JSONSchema } from '@wonder/context';
import { createEmitter, type Emitter } from '@wonder/events';
import { DurableObject } from 'cloudflare:workers';
import { ContextManager } from './operations/context.js';
import * as tokenOps from './operations/tokens.js';
import * as workflowOps from './operations/workflows.js';
import type { TaskResult, WorkflowDef } from './types.js';

/**
 * WorkflowCoordinator Durable Object
 *
 * Each instance coordinates a single workflow run.
 */
export class WorkflowCoordinator extends DurableObject {
  private emitter?: Emitter;
  private contextManager?: ContextManager;
  private workflowCache: Map<string, WorkflowDef> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /**
   * Start workflow execution
   */
  async start(
    input: Record<string, unknown>,
    context: {
      workflow_run_id: string;
      workspace_id: string;
      project_id: string;
      workflow_def_id: string;
      initial_node_id: string;
      input_schema: JSONSchema;
      context_schema?: JSONSchema;
      output_schema: JSONSchema;
    },
  ): Promise<void> {
    const sql = this.ctx.storage.sql;

    // Initialize emitter with full context
    this.emitter = createEmitter(this.env.EVENTS, context, {
      traceEnabled: this.env.TRACE_EVENTS_ENABLED,
    });

    // Emit workflow started event
    this.emitter.emit({
      event_type: 'workflow_started',
      message: 'Workflow started',
      metadata: { input },
    });

    // Initialize storage tables
    tokenOps.initializeTable(sql);

    // Load workflow definition
    // For Chunk 2, use schemas passed from caller (future: load from RESOURCES)
    const workflow: WorkflowDef = {
      id: context.workflow_def_id,
      version: 1,
      initial_node_id: context.initial_node_id,
      input_schema: context.input_schema,
      context_schema: context.context_schema,
      output_schema: context.output_schema,
    };
    this.workflowCache.set(context.workflow_run_id, workflow);

    // Initialize context manager
    this.contextManager = new ContextManager(
      sql,
      this.emitter,
      workflow.input_schema,
      workflow.context_schema,
    );

    // Initialize context tables and store input
    this.contextManager.initialize();
    this.contextManager.initializeWithInput(input);

    // Create initial token
    const tokenId = tokenOps.create(
      sql,
      {
        workflow_run_id: context.workflow_run_id,
        node_id: workflow.initial_node_id,
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
  }

  /**
   * Handle task result from Executor
   */
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void> {
    if (!this.emitter) {
      throw new Error('Emitter not initialized');
    }
    if (!this.contextManager) {
      throw new Error('ContextManager not initialized');
    }

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
  }

  /**
   * Dispatch token to Executor
   */
  private async dispatchToken(tokenId: string): Promise<void> {
    if (!this.emitter) {
      throw new Error('Emitter not initialized');
    }

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
    if (!this.emitter) {
      throw new Error('Emitter not initialized');
    }
    if (!this.contextManager) {
      throw new Error('ContextManager not initialized');
    }

    this.emitter.emitTrace({
      type: 'decision.sync.activate',
      merge_config: { workflow_run_id: workflowRunId },
    });

    // Get context snapshot
    const context = this.contextManager.getSnapshot();

    // Extract output (simplified for Chunk 2 - just use current output or input)
    // Future chunks: apply output_mapping from workflow def
    const workflow = this.workflowCache.get(workflowRunId);
    const finalOutput = Object.keys(context.output).length > 0 ? context.output : context.input; // Fallback to input if no output set

    // Write final output to context
    if (workflow && Object.keys(finalOutput).length > 0) {
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
