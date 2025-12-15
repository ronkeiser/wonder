/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle via RPC.
 */
import type { Emitter } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import type { JSONSchema } from '@wonder/schemas';
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
  toTransitionDef,
} from './planning/index';
import { decideSynchronization } from './planning/synchronization';
import type { Decision, TaskResult, TransitionDef } from './types';

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
   * For fan-out flows: Write to branch table, then check if siblings can merge
   *
   * The distinction is determined by whether this token has fan_out_transition_id:
   * - No fan-out: Linear flow, use output_mapping to write to context
   * - Has fan-out: Branch flow, output goes to branch table for later merge
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

      // Handle output based on flow type
      if (token.fan_out_transition_id) {
        // Fan-out flow: Write to branch table
        await this.handleBranchOutput(token, node, result.output_data);
      } else {
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
        completedToken: token,
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
      await this.processSynchronization(applyResult.tokensCreated, syncTransitions, dispatchCtx);

      // Dispatch any tokens marked for dispatch
      const dispatchedTokens = this.tokens.getMany(
        applyResult.tokensCreated.filter((id) => {
          const t = this.tokens.get(id);
          return t.status === 'dispatched';
        }),
      );

      await Promise.all(dispatchedTokens.map((token) => this.dispatchToken(token.id)));

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
   * Handle branch output for fan-out tokens
   *
   * 1. Fetch TaskDef to get output_schema
   * 2. Initialize branch table (lazy - creates if not exists)
   * 3. Write task output to branch table
   * 4. Check if sibling completion triggers fan-in
   */
  private async handleBranchOutput(
    token: ReturnType<TokenManager['get']>,
    node: ReturnType<DefinitionManager['getNode']>,
    output: Record<string, unknown>,
  ): Promise<void> {
    // Fetch TaskDef to get output schema
    if (!node.task_id) {
      this.logger.debug({
        event_type: 'branch_output_skip',
        message: 'No task_id on node - skipping branch output',
        metadata: { token_id: token.id, node_id: node.id },
      });
      return;
    }

    const taskDefsResource = this.env.RESOURCES.taskDefs();
    const { task_def: taskDef } = await taskDefsResource.get(node.task_id, node.task_version ?? 1);

    if (!taskDef.output_schema) {
      this.logger.debug({
        event_type: 'branch_output_skip',
        message: 'No output_schema on TaskDef - skipping branch output',
        metadata: { token_id: token.id, task_id: taskDef.id },
      });
      return;
    }

    // Initialize branch table (creates if not exists)
    this.context.initializeBranchTable(token.id, taskDef.output_schema as JSONSchema);

    // Write output to branch table
    this.context.applyBranchOutput(token.id, output);

    this.emitter.emitTrace({
      type: 'operation.context.branch.write',
      token_id: token.id,
      output,
    });

    // Check if this completion triggers fan-in for waiting siblings
    await this.checkSiblingCompletion(token);
  }

  /**
   * Check if a completed branch token triggers fan-in for waiting siblings
   *
   * When a fan-out token completes:
   * 1. Find tokens waiting for this sibling group
   * 2. Re-evaluate synchronization condition
   * 3. If condition now met, trigger fan-in activation
   */
  private async checkSiblingCompletion(
    completedToken: ReturnType<TokenManager['get']>,
  ): Promise<void> {
    if (!completedToken.fan_out_transition_id) {
      return; // Not a fan-out token, nothing to check
    }

    const workflowRunId = completedToken.workflow_run_id;

    // Get the transition that spawned this fan-out
    const fanOutTransition = this.defs.getTransition(completedToken.fan_out_transition_id);
    if (!fanOutTransition) {
      return;
    }

    // Find the next transition (from the same source node) that has synchronization
    const outboundTransitions = this.defs.getTransitionsFrom(fanOutTransition.from_node_id);
    const syncTransitionRow = outboundTransitions.find((t) => {
      const sync = t.synchronization as { sibling_group?: string } | null;
      return sync?.sibling_group === fanOutTransition.id;
    });

    if (!syncTransitionRow || !syncTransitionRow.synchronization) {
      return; // No sync transition for this fan-out group
    }

    // Cast synchronization to typed config
    const syncTransition = toTransitionDef(syncTransitionRow);
    const siblingGroup = syncTransition.synchronization!.sibling_group;

    // Check for tokens waiting for this sibling group
    const waitingTokens = this.tokens.getWaitingTokens(workflowRunId, siblingGroup);
    if (waitingTokens.length === 0) {
      return; // No one waiting yet
    }

    // Re-evaluate synchronization with current sibling counts
    const siblingCounts = this.tokens.getSiblingCounts(workflowRunId, siblingGroup);

    const dispatchCtx: DispatchContext = {
      tokens: this.tokens,
      context: this.context,
      defs: this.defs,
      emitter: this.emitter,
      workflowRunId,
    };

    // Check if any waiting token should now activate fan-in
    // We only need to check one (they all have the same view of siblings)
    const waitingToken = waitingTokens[0];

    const syncResult = decideSynchronization({
      token: waitingToken,
      transition: syncTransition,
      siblingCounts,
      workflowRunId,
    });

    // Emit trace events
    for (const event of syncResult.events) {
      this.emitter.emitTrace(event);
    }

    // Process any ACTIVATE_FAN_IN decisions
    for (const decision of syncResult.decisions) {
      if (decision.type === 'ACTIVATE_FAN_IN') {
        await this.handleActivateFanIn(decision, syncTransition, dispatchCtx, waitingToken.id);
      }
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
  private async processSynchronization(
    createdTokenIds: string[],
    syncTransitions: ReturnType<typeof getTransitionsWithSynchronization>,
    dispatchCtx: DispatchContext,
  ): Promise<void> {
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

        // Process decisions - handle ACTIVATE_FAN_IN specially (needs async operations)
        for (const decision of syncResult.decisions) {
          if (decision.type === 'ACTIVATE_FAN_IN') {
            await this.handleActivateFanIn(decision, syncTransition, dispatchCtx, createdTokenId);
          } else {
            applyDecisions([decision], dispatchCtx);
          }
        }
      } else {
        // No synchronization - mark for dispatch
        this.tokens.updateStatus(createdTokenId, 'dispatched');
      }
    }
  }

  /**
   * Handle ACTIVATE_FAN_IN decision
   *
   * This is called when synchronization condition is met:
   * 1. Try to activate (race-safe via SQL constraint)
   * 2. If won the race:
   *    - Query all completed siblings
   *    - Fetch TaskDef for output schema
   *    - Merge branch outputs
   *    - Drop branch tables
   *    - Create continuation token
   *    - Mark waiting siblings as completed
   */
  private async handleActivateFanIn(
    decision: Extract<Decision, { type: 'ACTIVATE_FAN_IN' }>,
    transition: TransitionDef,
    dispatchCtx: DispatchContext,
    triggeringTokenId: string,
  ): Promise<void> {
    const { workflowRunId, nodeId, fanInPath } = decision;

    this.emitter.emitTrace({
      type: 'debug.fan_in.start',
      workflow_run_id: workflowRunId,
      node_id: nodeId,
      fan_in_path: fanInPath,
    });

    // First ensure the fan-in record exists (create if not present)
    // This handles the race where all tokens arrive at sync point simultaneously
    this.tokens.tryCreateFanIn({
      workflowRunId,
      nodeId,
      fanInPath,
      transitionId: transition.id,
      tokenId: triggeringTokenId,
    });

    // Try to activate - first caller wins
    // Use the triggering token ID for race-safe deduplication
    const activated = this.tokens.tryActivateFanIn({
      workflowRunId,
      fanInPath,
      activatedByTokenId: triggeringTokenId,
    });

    this.emitter.emitTrace({
      type: 'debug.fan_in.try_activate_result',
      activated,
    });

    if (!activated) {
      // Another token already activated this fan-in
      // Mark the triggering token as completed (absorbed by the winning token's fan-in)
      this.tokens.updateStatus(triggeringTokenId, 'completed');
      this.logger.debug({
        event_type: 'fan_in_race_lost',
        message: 'Another token already activated this fan-in',
        metadata: { fan_in_path: fanInPath },
      });
      return;
    }

    // We won the race - proceed with merge
    this.emitter.emitTrace({
      type: 'dispatch.sync.fan_in_activated',
      fan_in_path: fanInPath,
      node_id: nodeId,
      merged_count: decision.mergedTokenIds.length,
    });

    const sync = transition.synchronization;
    if (!sync) {
      return; // Should not happen
    }

    // Get all completed siblings
    const siblings = this.tokens.getSiblings(workflowRunId, sync.sibling_group);
    const completedSiblings = siblings.filter((s) => s.status === 'completed');
    const waitingSiblings = siblings.filter((s) => s.status === 'waiting_for_siblings');

    if (completedSiblings.length === 0) {
      this.logger.debug({
        event_type: 'fan_in_no_completed',
        message: 'No completed siblings found',
        metadata: { fan_in_path: fanInPath },
      });
      return;
    }

    // Get merge config
    const mergeConfig = sync.merge;
    if (mergeConfig) {
      // Fetch TaskDef to get output schema (from the source node of the fan-out transition)
      const sourceNode = this.defs.getNode(transition.from_node_id);

      if (sourceNode.task_id) {
        const taskDefsResource = this.env.RESOURCES.taskDefs();
        const { task_def: taskDef } = await taskDefsResource.get(
          sourceNode.task_id,
          sourceNode.task_version ?? 1,
        );

        if (taskDef.output_schema) {
          // Get branch outputs
          const branchOutputs = this.context.getBranchOutputs(
            completedSiblings.map((s) => s.id),
            completedSiblings.map((s) => s.branch_index),
            taskDef.output_schema as JSONSchema,
          );

          // Merge into context
          this.context.mergeBranches(branchOutputs, mergeConfig);

          this.emitter.emitTrace({
            type: 'dispatch.branch.merged',
            token_ids: completedSiblings.map((s) => s.id),
            target: mergeConfig.target,
            strategy: mergeConfig.strategy,
          });
        }
      }

      // Drop branch tables
      this.context.dropBranchTables(completedSiblings.map((s) => s.id));
    }

    // Mark waiting siblings as completed (absorbed by merge)
    if (waitingSiblings.length > 0) {
      this.tokens.completeMany(waitingSiblings.map((s) => s.id));
    }

    // Mark the triggering token as completed (it activated the fan-in but is now absorbed)
    this.tokens.updateStatus(triggeringTokenId, 'completed');

    // Create continuation token to proceed to next node
    const firstSibling = completedSiblings[0];
    const continuationTokenId = this.tokens.create({
      workflow_run_id: workflowRunId,
      node_id: nodeId,
      parent_token_id: firstSibling.parent_token_id,
      path_id: fanInPath,
      fan_out_transition_id: null, // Merged token is not part of a fan-out
      branch_index: 0,
      branch_total: 1,
    });

    this.emitter.emitTrace({
      type: 'dispatch.token.created',
      token_id: continuationTokenId,
      node_id: nodeId,
    });

    // Actually dispatch the token to the executor
    await this.dispatchToken(continuationTokenId);
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
    this.ctx.waitUntil(
      this.env.EXECUTOR.executeTask({
        token_id: tokenId,
        workflow_run_id: token.workflow_run_id,
        task_id: node.task_id,
        task_version: node.task_version ?? 1,
        input: taskInput,
        resources: resolvedResources,
      }),
    );
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
