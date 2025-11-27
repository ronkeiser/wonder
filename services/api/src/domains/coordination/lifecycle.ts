/** Workflow lifecycle management */

import type { Logger } from '@wonder/logger';
import type { SchemaType } from '@wonder/schema';
import { ulid } from 'ulid';
import type { EventBuffer } from '../events/buffer';
import type { Context, Token } from '../execution/definitions';
import type { ContextManager } from './context';
import type { TaskDispatcher } from './tasks';
import type { TokenManager } from './tokens';

interface InitializeParams {
  workflowRunId: string;
  workflowDefId: string;
  workflowVersion: number;
  initialNodeId: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  context: Context;
}

/**
 * Manages workflow lifecycle: initialization, completion, and failure.
 * Coordinates between context, tokens, events, and tasks.
 */
export class WorkflowLifecycle {
  private workflowRunId?: string;
  private workflowDefId?: string;
  private durableObjectId?: string;

  constructor(
    private logger: Logger,
    private context: ContextManager,
    private tokens: TokenManager,
    private events: EventBuffer,
    private tasks: TaskDispatcher,
  ) {}

  setDurableObjectId(id: string): void {
    this.durableObjectId = id;
  }

  getWorkflowRunId(): string | undefined {
    return this.workflowRunId;
  }

  /**
   * Initialize workflow run in DO storage.
   * Creates tables, stores initial context, creates initial token, enqueues first task.
   */
  async initialize(request: Request): Promise<Response> {
    const params = (await request.json()) as InitializeParams;

    const {
      workflowRunId,
      workflowDefId,
      workflowVersion,
      initialNodeId,
      inputSchema,
      outputSchema,
      context,
    } = params;

    this.workflowRunId = workflowRunId;
    this.workflowDefId = workflowDefId;

    this.logger.info('workflow_initialization_started', {
      workflow_run_id: workflowRunId,
      durable_object_id: this.durableObjectId,
    });

    // Initialize all managers and create tables
    this.context.initialize(
      workflowRunId,
      workflowDefId,
      inputSchema as SchemaType,
      outputSchema as SchemaType,
    );
    this.tokens.initialize();
    this.events.initialize();

    // Store initial context
    this.context.store(context);

    // Create and store initial token
    const initialToken: Token = {
      id: ulid(),
      workflow_run_id: workflowRunId,
      node_id: initialNodeId,
      status: 'active',
      path_id: workflowRunId,
      parent_token_id: null,
      fan_out_node_id: null,
      branch_index: 0,
      branch_total: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.tokens.store(initialToken);

    // Emit workflow_started event
    this.events.emit('workflow_started', {
      workflow_run_id: workflowRunId,
      workflow_def_id: workflowDefId,
      workflow_version: workflowVersion,
      input: context.input,
    });

    this.logger.info('workflow_initialized', {
      workflow_run_id: workflowRunId,
      initial_token_id: initialToken.id,
    });

    // Enqueue initial token task
    if (!this.durableObjectId) {
      throw new Error('Durable object ID not set');
    }
    this.tasks.enqueue(initialToken, workflowRunId, this.durableObjectId, context);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Complete the workflow.
   * Sets final output, emits completion event.
   */
  complete(): void {
    if (!this.workflowRunId) {
      throw new Error('Workflow not initialized');
    }

    const finalContext = this.context.get();

    // For Stage 0: output = state
    finalContext.output = { ...finalContext.state };

    this.context.update(finalContext);

    // Emit workflow_completed event
    this.events.emit('workflow_completed', {
      workflow_run_id: this.workflowRunId,
      output: finalContext.output,
    });

    this.logger.info('workflow_completed', {
      workflow_run_id: this.workflowRunId,
      output: finalContext.output,
      full_context: finalContext,
    });
  }

  /**
   * Fail the workflow.
   * Emits failure events for both node and workflow.
   */
  fail(tokenId: string, taskId: string, error: string): void {
    if (!this.workflowRunId) {
      throw new Error('Workflow not initialized');
    }

    this.logger.error('task_execution_failed', {
      workflow_run_id: this.workflowRunId,
      task_id: taskId,
      token_id: tokenId,
      error,
    });

    this.events.emit('node_failed', {
      token_id: tokenId,
      error,
    });

    // For Stage 0, workflow fails on any task failure
    this.events.emit('workflow_failed', {
      workflow_run_id: this.workflowRunId,
      error,
    });
  }

  /**
   * Get pending events and final context for D1 persistence.
   */
  async getPendingData(request: Request): Promise<Response> {
    if (!this.workflowRunId) {
      return new Response(JSON.stringify({ events: [], context: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const events = this.events.getPending(this.workflowRunId);
    const finalContext = this.context.get();

    return new Response(JSON.stringify({ events, context: finalContext }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
