/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle via RPC.
 */
import type { Emitter } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import { applyDecisions, type DispatchContext } from './dispatch/index';
import { ContextManager } from './operations/context';
import { DefinitionManager } from './operations/defs';
import { CoordinatorEmitter } from './operations/events';
import { TokenManager } from './operations/tokens';
import {
  applyInputMapping,
  decideRouting,
  extractFinalOutput,
  getTransitionsWithSynchronization,
} from './planning/index';
import { decideSynchronization } from './planning/synchronization';
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
      service: 'coordinator',
      environment: 'development',
    });

    // Initialize DefinitionManager first
    this.defs = new DefinitionManager(ctx, this.env);

    // Initialize emitter with DefinitionManager
    this.emitter = new CoordinatorEmitter(
      this.defs,
      this.env.EVENTS,
      this.env.TRACE_EVENTS_ENABLED === 'true',
    );

    this.context = new ContextManager(ctx.storage.sql, this.defs, this.emitter);
    this.tokens = new TokenManager(ctx, this.defs, this.emitter);
  }

  /**
   * Start workflow execution
   * Note: workflow_run_id must be passed because ctx.id.name is undefined inside DO
   * (see https://github.com/cloudflare/workerd/issues/2240)
   */
  async start(workflow_run_id: string): Promise<void> {
    try {
      const sql = this.ctx.storage.sql;

      // Initialize definition manager (loads/fetches definitions)
      await this.defs.initialize(workflow_run_id);

      // Get definitions for token creation and input
      const workflowRun = this.defs.getWorkflowRun();
      const workflowDef = this.defs.getWorkflowDef();

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

      // Initialize context tables and store input
      await this.context.initialize(input);

      // Create initial token
      const tokenId = this.tokens.create({
        workflow_run_id: workflowRun.id,
        node_id: workflowDef.initial_node_id!,
        parent_token_id: null,
        path_id: 'root',
        fan_out_transition_id: null,
        branch_index: 0,
        branch_total: 1,
      });

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
   *
   * For linear flows: Apply node's output_mapping to write directly to context
   * For fan-out flows: Branch output was already written by initializeBranchTable
   *
   * The distinction is determined by whether this token has a branch_id:
   * - No branch: Linear flow, use output_mapping to write to context
   * - Has branch: Fan-out flow, output goes to branch table (handled separately)
   */
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void> {
    let workflow_run_id: string | undefined;

    try {
      // Mark token as completed
      this.tokens.updateStatus(tokenId, 'completed');
      const token = this.tokens.get(tokenId);
      workflow_run_id = token.workflow_run_id;

      // Get node for output mapping
      const node = this.defs.getNode(token.node_id);

      // For linear flows, apply output_mapping to write directly to context
      // For fan-out flows with branch tokens, output is handled via branch tables
      if (!token.fan_out_transition_id) {
        // Linear flow: Apply node's output_mapping to transform and store output
        // e.g., { "state.result": "$.greeting" } writes result.output_data.greeting to context.state.result
        this.emitter.emitTrace({
          type: 'operation.context.output_mapping.input',
          node_ref: node.ref,
          output_mapping: node.output_mapping,
          task_output: result.output_data,
          task_output_keys: Object.keys(result.output_data),
        });
        this.context.applyOutputMapping(
          node.output_mapping as Record<string, string> | null,
          result.output_data,
        );
      }
      // Note: Fan-out branch output is written via applyBranchOutput() which is called
      // during branch creation. The branch output is then merged at synchronization point.

      // Emit node completed event
      this.emitter.emit({
        event_type: 'node_completed',
        node_id: token.node_id,
        token_id: tokenId,
        message: 'Node completed',
        metadata: { output: result.output_data },
      });

      // Get outgoing transitions from completed node
      const transitions = this.defs.getTransitionsFrom(token.node_id);

      // If no transitions, finalize if no active tokens remain
      if (transitions.length === 0) {
        await this.checkAndFinalizeWorkflow(workflow_run_id);
        return;
      }

      // Get context snapshot for routing decisions
      const contextSnapshot = this.context.getSnapshot();

      // Plan routing decisions (returns decisions + trace events)
      const routingResult = decideRouting({
        completedTokenId: tokenId,
        completedTokenPath: token.path_id,
        workflowRunId: workflow_run_id,
        nodeId: token.node_id,
        transitions,
        context: contextSnapshot,
      });

      // Emit trace events from routing planning
      for (const event of routingResult.events) {
        this.emitter.emitTrace(event);
      }

      // If no routing decisions, finalize if no active tokens remain
      if (routingResult.decisions.length === 0) {
        await this.checkAndFinalizeWorkflow(workflow_run_id);
        return;
      }

      // Apply routing decisions (creates tokens)
      const dispatchCtx: DispatchContext = {
        tokens: this.tokens,
        context: this.context,
        defs: this.defs,
        emitter: this.emitter,
        workflowRunId: workflow_run_id,
      };

      const applyResult = applyDecisions(routingResult.decisions, dispatchCtx);

      // Handle synchronization for created tokens
      const syncTransitions = getTransitionsWithSynchronization(transitions, contextSnapshot);
      this.processSynchronization(applyResult.tokensCreated, syncTransitions, dispatchCtx);

      // Dispatch any tokens marked for dispatch
      const dispatchedTokens = this.tokens.getMany(
        applyResult.tokensCreated.filter((id) => {
          const t = this.tokens.get(id);
          return t.status === 'dispatched';
        }),
      );

      for (const dispatchToken of dispatchedTokens) {
        await this.dispatchToken(dispatchToken.id);
      }

      // Note: No finalization check here. Dispatched tokens handle their own
      // finalization when they complete (via the no-transitions or no-routing paths).
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
   * Check if workflow is complete and finalize if so
   */
  private async checkAndFinalizeWorkflow(workflowRunId: string): Promise<void> {
    const activeCount = this.tokens.getActiveCount(workflowRunId);
    if (activeCount === 0) {
      await this.finalizeWorkflow(workflowRunId);
    }
  }

  /**
   * Process synchronization for created tokens
   */
  private processSynchronization(
    createdTokenIds: string[],
    syncTransitions: ReturnType<typeof getTransitionsWithSynchronization>,
    dispatchCtx: DispatchContext,
  ): void {
    for (const createdTokenId of createdTokenIds) {
      const createdToken = this.tokens.get(createdTokenId);

      // Find matching sync transition for this token's target node
      const syncTransition = syncTransitions.find((t) => t.to_node_id === createdToken.node_id);

      if (syncTransition && syncTransition.synchronization) {
        // Get sibling counts for synchronization check
        const siblingGroup = syncTransition.synchronization.sibling_group;
        const siblingCounts = this.tokens.getSiblingCounts(dispatchCtx.workflowRunId, siblingGroup);

        // Plan synchronization decisions (returns decisions + trace events)
        const syncResult = decideSynchronization({
          token: createdToken,
          transition: syncTransition,
          siblingCounts,
          workflowRunId: dispatchCtx.workflowRunId,
        });

        // Emit trace events from sync planning
        for (const event of syncResult.events) {
          this.emitter.emitTrace(event);
        }

        // Apply sync decisions
        applyDecisions(syncResult.decisions, dispatchCtx);
      } else {
        // No synchronization - mark for dispatch
        this.tokens.updateStatus(createdTokenId, 'dispatched');
      }
    }
  }

  /**
   * Handle task error from Executor
   *
   * Called when task execution fails. May trigger retry based on error type.
   */
  async handleTaskError(
    tokenId: string,
    errorResult: {
      error: {
        type: 'step_failure' | 'task_timeout' | 'validation_error';
        step_ref?: string;
        message: string;
        retryable: boolean;
      };
      metrics: {
        duration_ms: number;
        steps_executed: number;
      };
    },
  ): Promise<void> {
    let workflow_run_id: string | undefined;

    try {
      const token = this.tokens.get(tokenId);
      workflow_run_id = token.workflow_run_id;
      const node = this.defs.getNode(token.node_id);

      // TODO: Check retry policy and retry_attempt count
      // For now, just fail the workflow
      this.tokens.updateStatus(tokenId, 'failed');

      this.emitter.emit({
        event_type: 'node_failed',
        node_id: token.node_id,
        token_id: tokenId,
        message: `Task failed: ${errorResult.error.message}`,
        metadata: {
          error: errorResult.error,
          metrics: errorResult.metrics,
        },
      });

      // Check if we should fail the workflow
      // For now, any error fails the workflow
      this.failWorkflow(workflow_run_id, errorResult.error.message);
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

  /**
   * Dispatch token to Executor
   *
   * Per the 5-layer execution model (WorkflowDef → Node → TaskDef → Step → ActionDef):
   * - Coordinator just sends { task_id, task_version, input, resources } to Executor
   * - Executor handles everything: loading TaskDef, iterating Steps, executing Actions
   */
  private async dispatchToken(tokenId: string): Promise<void> {
    const token = this.tokens.get(tokenId);
    const node = this.defs.getNode(token.node_id);

    this.emitter.emitTrace({
      type: 'dispatch.batch.start',
      decision_count: 1,
    });

    // Update token status to executing
    this.tokens.updateStatus(tokenId, 'executing');

    // Get context for input mapping
    const context = this.context.getSnapshot();

    // If node has no task, complete immediately (e.g., pass-through nodes)
    if (!node.task_id) {
      await this.handleTaskResult(tokenId, { output_data: {} });
      return;
    }

    // Apply input mapping to get task input (pure function from planning/completion)
    const taskInput = applyInputMapping(
      node.input_mapping as Record<string, string> | null,
      context,
    );

    // Resolve resource bindings from node to workflow resources
    // node.resource_bindings: { "container": "dev_env" }
    // workflowDef.resources: { "dev_env": { type: "container", ... } }
    // We need to pass the actual container DO IDs (placeholder for now)
    const resolvedResources = this.resolveResourceBindings(
      node.resource_bindings as Record<string, string> | null,
    );

    // Dispatch to Executor (fire-and-forget, Executor calls back)
    await this.env.EXECUTOR.executeTask({
      token_id: tokenId,
      workflow_run_id: token.workflow_run_id,
      task_id: node.task_id,
      task_version: node.task_version ?? 1,
      input: taskInput,
      resources: resolvedResources,
    });
  }

  /**
   * Resolve resource bindings from generic names to actual container DO IDs
   *
   * Node.resource_bindings maps generic names to workflow resource IDs:
   *   { "container": "dev_env" }
   *
   * WorkflowDef.resources defines the actual containers:
   *   { "dev_env": { type: "container", image: "node:20", ... } }
   *
   * At runtime, we resolve to container DO IDs:
   *   { "container": "container-do-abc123" }
   */
  private resolveResourceBindings(bindings: Record<string, string> | null): Record<string, string> {
    if (!bindings) return {};

    // TODO: Implement actual resource resolution
    // For now, return empty - containers not yet implemented
    const resolved: Record<string, string> = {};

    // When containers are implemented, this would:
    // 1. Get workflowDef.resources
    // 2. For each binding, find the workflow resource
    // 3. Resolve to container DO ID

    return resolved;
  }

  /**
   * Fail workflow due to unrecoverable error
   */
  private failWorkflow(workflowRunId: string, errorMessage: string): void {
    this.emitter.emit({
      event_type: 'workflow_failed',
      message: `Workflow failed: ${errorMessage}`,
      metadata: { error: errorMessage },
    });
  }

  /**
   * Finalize workflow and extract output
   */
  private async finalizeWorkflow(workflowRunId: string): Promise<void> {
    try {
      // Get context snapshot and workflow def
      const context = this.context.getSnapshot();
      const workflowDef = this.defs.getWorkflowDef();

      // Extract final output using pure planning function
      const completionResult = extractFinalOutput(
        workflowDef.output_mapping as Record<string, string> | null,
        context,
      );

      // Emit trace events from completion planning
      for (const event of completionResult.events) {
        this.emitter.emitTrace(event);
      }

      const finalOutput = completionResult.output;

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
