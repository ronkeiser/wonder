/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle via RPC.
 */
import type { Emitter } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import { applyDecisions, type DispatchContext } from './dispatch/index.js';
import { ContextManager } from './operations/context.js';
import { DefinitionManager } from './operations/defs.js';
import { CoordinatorEmitter } from './operations/events.js';
import { TokenManager } from './operations/tokens.js';
import { decideRouting, getTransitionsWithSynchronization } from './planning/index.js';
import { decideSynchronization } from './planning/synchronization.js';
import type { TaskResult } from './types.js';

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
   */
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void> {
    const sql = this.ctx.storage.sql;
    let workflow_run_id: string | undefined;

    try {
      // Mark token as completed
      this.tokens.updateStatus(tokenId, 'completed');
      const token = this.tokens.get(tokenId);
      workflow_run_id = token.workflow_run_id;

      // Get node for output mapping
      const node = this.defs.getNode(token.node_id);

      // Apply node's output_mapping to transform raw output
      // e.g., { "greeting": "$.greeting" } extracts result.output_data.greeting -> context.output.greeting
      const mappedOutput = this.applyOutputMapping(
        node.output_mapping as Record<string, string> | null,
        result.output_data,
        node.ref,
      );

      // Apply mapped output to context
      await this.context.applyNodeOutput(mappedOutput);

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

      // If no transitions, check workflow completion
      if (transitions.length === 0) {
        const activeCount = this.tokens.getActiveCount(workflow_run_id);
        if (activeCount === 0) {
          await this.finalizeWorkflow(workflow_run_id);
        }
        return;
      }

      // Get context snapshot for routing decisions
      const contextSnapshot = this.context.getSnapshot();

      // Emit routing start trace
      this.emitter.emitTrace({
        type: 'decision.routing.start',
        token_id: tokenId,
        node_id: token.node_id,
      });

      // Plan routing decisions
      const routingDecisions = decideRouting({
        completedTokenId: tokenId,
        completedTokenPath: token.path_id,
        workflowRunId: workflow_run_id,
        nodeId: token.node_id,
        transitions,
        context: contextSnapshot,
      });

      // Emit routing complete trace
      this.emitter.emitTrace({
        type: 'decision.routing.complete',
        decisions: routingDecisions,
      });

      // If no routing decisions, check workflow completion
      if (routingDecisions.length === 0) {
        const activeCount = this.tokens.getActiveCount(workflow_run_id);
        if (activeCount === 0) {
          await this.finalizeWorkflow(workflow_run_id);
        }
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

      const applyResult = applyDecisions(routingDecisions, dispatchCtx);

      // Check for transitions with synchronization requirements
      const syncTransitions = getTransitionsWithSynchronization(transitions, contextSnapshot);

      // For each created token, check if it needs synchronization
      for (const createdTokenId of applyResult.tokensCreated) {
        const createdToken = this.tokens.get(createdTokenId);

        // Find matching sync transition for this token's target node
        const syncTransition = syncTransitions.find((t) => t.to_node_id === createdToken.node_id);

        if (syncTransition && syncTransition.synchronization) {
          // Get sibling counts for synchronization check
          const siblingGroup = syncTransition.synchronization.sibling_group;
          const siblingCounts = this.tokens.getSiblingCounts(workflow_run_id, siblingGroup);

          // Emit sync start trace
          this.emitter.emitTrace({
            type: 'decision.sync.start',
            token_id: createdTokenId,
            sibling_count: siblingCounts.total,
          });

          // Plan synchronization decisions
          const syncDecisions = decideSynchronization({
            token: createdToken,
            transition: syncTransition,
            siblingCounts,
            workflowRunId: workflow_run_id,
          });

          // Apply sync decisions
          applyDecisions(syncDecisions, dispatchCtx);
        } else {
          // No synchronization - mark for dispatch
          this.tokens.updateStatus(createdTokenId, 'dispatched');
        }
      }

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

      // Check workflow completion after all routing
      const activeCount = this.tokens.getActiveCount(workflow_run_id);
      if (activeCount === 0) {
        await this.finalizeWorkflow(workflow_run_id);
      }
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
      this.logger.info({
        event_type: 'dispatch_no_task',
        message: 'Node has no task, completing immediately',
        trace_id: token.workflow_run_id,
        metadata: { tokenId, nodeId: node.id },
      });
      await this.handleTaskResult(tokenId, { output_data: {} });
      return;
    }

    // Apply input mapping to get task input
    const taskInput = this.applyInputMapping(
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

    this.logger.info({
      event_type: 'dispatch_task',
      message: 'Dispatching task to Executor',
      trace_id: token.workflow_run_id,
      metadata: {
        tokenId,
        nodeId: node.id,
        nodeRef: node.ref,
        taskId: node.task_id,
        taskVersion: node.task_version,
        inputKeys: Object.keys(taskInput),
        hasResources: Object.keys(resolvedResources).length > 0,
      },
    });

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
   * Apply input mapping to context to extract action input
   *
   * Mappings are JSONPath-style: { "actionField": "$.context.path" }
   * e.g., { "name": "$.input.name" } extracts context.input.name
   */
  private applyInputMapping(
    mapping: Record<string, string> | null,
    context: {
      input: Record<string, unknown>;
      state: Record<string, unknown>;
      output: Record<string, unknown>;
    },
  ): Record<string, unknown> {
    if (!mapping) return {};

    const result: Record<string, unknown> = {};

    for (const [targetField, sourcePath] of Object.entries(mapping)) {
      // Parse JSONPath-style path: $.input.name -> ['input', 'name']
      if (!sourcePath.startsWith('$.')) {
        // Literal value
        result[targetField] = sourcePath;
        continue;
      }

      const pathParts = sourcePath.slice(2).split('.'); // Remove '$.' prefix
      let value: unknown = context;

      for (const part of pathParts) {
        if (value && typeof value === 'object' && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          value = undefined;
          break;
        }
      }

      result[targetField] = value;
    }

    return result;
  }

  /**
   * Apply output mapping to transform raw task output
   *
   * Mappings are JSONPath-style: { "contextField": "$.rawField" }
   * e.g., { "greeting": "$.response.greeting" } extracts output.response.greeting
   *
   * Output is stored with node ref as prefix to avoid collisions:
   * { "greeting": "Hello" } -> context.output.greet_node.greeting
   */
  private applyOutputMapping(
    mapping: Record<string, string> | null,
    rawOutput: Record<string, unknown>,
    nodeRef: string,
  ): Record<string, unknown> {
    // If no mapping, store raw output under node ref
    if (!mapping) {
      return { [nodeRef]: rawOutput };
    }

    const result: Record<string, unknown> = {};

    for (const [targetField, sourcePath] of Object.entries(mapping)) {
      // Parse JSONPath-style path: $.response.greeting -> ['response', 'greeting']
      if (!sourcePath.startsWith('$.')) {
        // Literal value
        result[targetField] = sourcePath;
        continue;
      }

      const pathParts = sourcePath.slice(2).split('.'); // Remove '$.' prefix
      let value: unknown = rawOutput;

      for (const part of pathParts) {
        if (value && typeof value === 'object' && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          value = undefined;
          break;
        }
      }

      result[targetField] = value;
    }

    // Store mapped output under node ref
    return { [nodeRef]: result };
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

      // Get workflow def for output_mapping
      const workflowDef = this.defs.getWorkflowDef();

      // Apply workflow output_mapping to extract final output
      // e.g., { "result": "$.output.greeting" } extracts context.output.greeting -> finalOutput.result
      const finalOutput = this.applyInputMapping(
        workflowDef.output_mapping as Record<string, string> | null,
        context,
      );

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
