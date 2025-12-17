/**
 * Task Dispatch
 *
 * Handles dispatching tokens to the executor and processing task results.
 *
 * Key responsibilities:
 * - Dispatch tokens to executor service
 * - Process task results (output mapping, routing, synchronization)
 * - Handle pass-through nodes (no task)
 */

import {
  applyInputMapping,
  decideRouting,
  extractFinalOutput,
  getTransitionsWithSynchronization,
} from '../planning/index';
import type { TaskResult } from '../types';
import { applyDecisions, type DispatchContext } from './apply';
import { handleBranchOutput, processSynchronization } from './fan';

// ============================================================================
// Task Dispatch
// ============================================================================

/**
 * Dispatch token to Executor
 *
 * Per the 5-layer execution model (WorkflowDef → Node → TaskDef → Step → ActionDef):
 * - Coordinator just sends { task_id, task_version, input, resources } to Executor
 * - Executor handles everything: loading TaskDef, iterating Steps, executing Actions
 */
export async function dispatchToken(ctx: DispatchContext, tokenId: string): Promise<void> {
  const token = ctx.tokens.get(tokenId);
  const node = ctx.defs.getNode(token.node_id);

  ctx.emitter.emitTrace({
    type: 'dispatch.batch.start',
    payload: { decision_count: 1 },
  });

  // Update token status to executing
  ctx.tokens.updateStatus(tokenId, 'executing');

  // Emit workflow event for task dispatch
  ctx.emitter.emit({
    event_type: 'task.dispatched',
    message: 'Task dispatched to executor',
    metadata: {
      token_id: tokenId,
      task_id: node.task_id ?? 'none',
      node_id: node.id,
    },
  });

  // Get context for input mapping
  const context = ctx.context.getSnapshot();

  ctx.emitter.emitTrace({
    type: 'dispatch.task.input_mapping.context',
    token_id: tokenId,
    node_id: node.id,
    payload: {
      context_keys: {
        input: Object.keys(context.input),
        state: Object.keys(context.state),
        output: Object.keys(context.output),
      },
    },
  });

  // If node has no task, complete immediately (e.g., pass-through nodes)
  if (!node.task_id) {
    await processTaskResult(ctx, tokenId, { output_data: {} });
    return;
  }

  // Apply input mapping to get task input (pure function from planning/completion)
  const taskInput = applyInputMapping(node.input_mapping as Record<string, string> | null, context);

  ctx.emitter.emitTrace({
    type: 'dispatch.task.input_mapping.applied',
    token_id: tokenId,
    node_id: node.id,
    payload: {
      input_mapping: node.input_mapping,
      task_input: taskInput,
    },
  });

  // Resolve resource bindings from node to workflow resources
  const resolvedResources = resolveResourceBindings(
    ctx,
    node.resource_bindings as Record<string, string> | null,
  );

  // Dispatch to Executor (fire-and-forget, Executor calls back)
  ctx.waitUntil(
    ctx.executor.executeTask({
      token_id: tokenId,
      workflow_run_id: token.workflow_run_id,
      task_id: node.task_id,
      task_version: node.task_version ?? 1,
      input: taskInput,
      resources: resolvedResources,
    }),
  );
}

// ============================================================================
// Task Result Processing
// ============================================================================

/**
 * Process task result from Executor
 *
 * For linear flows: Apply node's output_mapping to write directly to context
 * For fan-out flows: Write to branch table, then check if siblings can merge
 *
 * The distinction is determined by whether this token has fan_out_transition_id:
 * - No fan-out: Linear flow, use output_mapping to write to context
 * - Has fan-out: Branch flow, output goes to branch table for later merge
 */
export async function processTaskResult(
  ctx: DispatchContext,
  tokenId: string,
  result: TaskResult,
): Promise<void> {
  // Mark token as completed
  ctx.tokens.updateStatus(tokenId, 'completed');
  const token = ctx.tokens.get(tokenId);

  // Get node for output mapping
  const node = ctx.defs.getNode(token.node_id);

  // Handle output based on flow type
  if (token.fan_out_transition_id) {
    // Fan-out flow: Write to branch table
    const continuationTokenId = await handleBranchOutput(ctx, token, node, result.output_data);
    // If fan-in activated, dispatch the continuation token
    if (continuationTokenId) {
      await dispatchToken(ctx, continuationTokenId);
    }
  } else {
    // Linear flow: Apply node's output_mapping to transform and store output
    // e.g., { "state.result": "$.greeting" } writes result.output_data.greeting to context.state.result
    ctx.context.applyOutputMapping(
      node.output_mapping as Record<string, string> | null,
      result.output_data,
    );
  }

  // Get context output after all mappings applied
  const contextOutput = ctx.context.get('output');

  // Emit task completed workflow event
  ctx.emitter.emit({
    event_type: 'task.completed',
    message: 'Task completed successfully',
    metadata: {
      token_id: tokenId,
      task_id: node.task_id ?? 'none',
      node_id: node.id,
      output: result.output_data,
      context_output: contextOutput,
    },
  });

  // Get outgoing transitions from completed node
  const transitions = ctx.defs.getTransitionsFrom(token.node_id);

  // If no transitions, finalize if no active tokens remain
  if (transitions.length === 0) {
    await checkAndFinalizeWorkflow(ctx);
    return;
  }

  // Get context snapshot for routing decisions
  const contextSnapshot = ctx.context.getSnapshot();

  // Plan routing decisions (returns decisions + trace events)
  const routingResult = decideRouting({
    completedToken: token,
    workflowRunId: ctx.workflowRunId,
    nodeId: token.node_id,
    transitions,
    context: contextSnapshot,
  });

  // Emit trace events from routing planning
  for (const event of routingResult.events) {
    ctx.emitter.emitTrace(event);
  }

  // If no routing decisions, finalize if no active tokens remain
  if (routingResult.decisions.length === 0) {
    await checkAndFinalizeWorkflow(ctx);
    return;
  }

  // Apply routing decisions (creates tokens)
  const applyResult = applyDecisions(routingResult.decisions, ctx);

  // Handle synchronization for created tokens
  const syncTransitions = getTransitionsWithSynchronization(transitions, contextSnapshot);
  const fanInContinuationTokenIds = await processSynchronization(
    ctx,
    applyResult.tokensCreated,
    syncTransitions,
  );

  // Dispatch any tokens marked for dispatch
  const dispatchedTokens = ctx.tokens.getMany(
    applyResult.tokensCreated.filter((id) => {
      const t = ctx.tokens.get(id);
      return t.status === 'dispatched';
    }),
  );

  await Promise.all(dispatchedTokens.map((token) => dispatchToken(ctx, token.id)));

  // Dispatch fan-in continuation tokens (these were created by activateFanIn)
  await Promise.all(fanInContinuationTokenIds.map((tokenId) => dispatchToken(ctx, tokenId)));

  // Note: No finalization check here. Dispatched tokens handle their own
  // finalization when they complete (via the no-transitions or no-routing paths).
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if workflow is complete and finalize if so
 */
async function checkAndFinalizeWorkflow(ctx: DispatchContext): Promise<void> {
  const activeCount = ctx.tokens.getActiveCount(ctx.workflowRunId);
  if (activeCount === 0) {
    await finalizeWorkflow(ctx);
  }
}

/**
 * Finalize workflow and extract output
 */

async function finalizeWorkflow(ctx: DispatchContext): Promise<void> {
  try {
    // Get context snapshot and workflow def
    const context = ctx.context.getSnapshot();
    const workflowDef = ctx.defs.getWorkflowDef();

    // Extract final output using pure planning function
    const completionResult = extractFinalOutput(
      workflowDef.output_mapping as Record<string, string> | null,
      context,
    );

    // Emit trace events from completion planning
    for (const event of completionResult.events) {
      ctx.emitter.emitTrace(event);
    }

    const finalOutput = completionResult.output;

    // Emit workflow completed event
    ctx.emitter.emit({
      event_type: 'workflow.completed',
      message: 'Workflow completed',
      metadata: { output: finalOutput },
    });
  } catch (error) {
    ctx.logger.error({
      event_type: 'coordinator.finalize.failed',
      message: 'Critical error in finalizeWorkflow()',
      trace_id: ctx.workflowRunId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        workflowRunId: ctx.workflowRunId,
      },
    });
    throw error;
  }
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
function resolveResourceBindings(
  _ctx: DispatchContext,
  bindings: Record<string, string> | null,
): Record<string, string> {
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
