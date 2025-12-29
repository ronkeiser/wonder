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

import { ulid } from 'ulid';

import {
  applyInputMapping,
  decideRouting,
  extractFinalOutput,
  getTransitionsWithSynchronization,
} from '../planning/index';
import { errorDetails } from '../shared';
import type { DispatchContext, TaskResult } from '../types';
import { applyDecisions } from './apply';
import { handleBranchOutput, processSynchronization } from './fan';

// ============================================================================
// Task Dispatch
// ============================================================================

/**
 * Dispatch token to Executor
 *
 * Per the 5-layer execution model (WorkflowDef → Node → Task → Step → ActionDef):
 * - Coordinator just sends { taskId, taskVersion, input, resources } to Executor
 * - Executor handles everything: loading Task, iterating Steps, executing Actions
 */
export async function dispatchToken(ctx: DispatchContext, tokenId: string): Promise<void> {
  const token = ctx.tokens.get(tokenId);
  const node = ctx.defs.getNode(token.nodeId);

  ctx.emitter.emitTrace({
    type: 'dispatch.batch.start',
    payload: { decisionCount: 1 },
  });

  // Mark token as dispatched (sent to executor, awaiting execution)
  // Executor will call markTokenExecuting when it starts the task
  await applyDecisions([{ type: 'MARK_FOR_DISPATCH', tokenId }], ctx);

  // Emit workflow event for task dispatch
  ctx.emitter.emit({
    eventType: 'task.dispatched',
    message: 'Task dispatched to executor',
    metadata: {
      tokenId: tokenId,
      taskId: node.taskId ?? 'none',
      nodeId: node.id,
    },
  });

  // Get context for input mapping
  const context = ctx.context.getSnapshot();

  ctx.emitter.emitTrace({
    type: 'dispatch.task.inputMapping.context',
    tokenId: tokenId,
    nodeId: node.id,
    payload: {
      contextKeys: {
        input: Object.keys(context.input),
        state: Object.keys(context.state),
        output: Object.keys(context.output),
      },
    },
  });

  // Route based on node type
  if (node.subworkflowId) {
    // Subworkflow node: dispatch to child coordinator
    await dispatchSubworkflow(ctx, tokenId, token, node);
    return;
  }

  // If node has no task (and no subworkflow), complete immediately (e.g., pass-through nodes)
  if (!node.taskId) {
    await processTaskResult(ctx, tokenId, { outputData: {} });
    return;
  }

  // Apply input mapping to get task input (pure function from planning/completion)
  const taskInput = applyInputMapping(node.inputMapping as Record<string, string> | null, context);

  ctx.emitter.emitTrace({
    type: 'dispatch.task.inputMapping.applied',
    tokenId: tokenId,
    nodeId: node.id,
    payload: {
      inputMapping: node.inputMapping,
      taskInput: taskInput,
    },
  });

  // Resolve resource bindings from node to workflow resources
  const resolvedResources = resolveResourceBindings(
    ctx,
    node.resourceBindings as Record<string, string> | null,
  );

  // Emit trace event for what we're sending to executor
  ctx.emitter.emitTrace({
    type: 'dispatch.task.sent',
    tokenId: tokenId,
    nodeId: node.id,
    payload: {
      taskId: node.taskId,
      taskVersion: node.taskVersion ?? 1,
      resources: resolvedResources,
    },
  });

  // Dispatch to Executor (fire-and-forget, Executor calls back)
  ctx.waitUntil(
    ctx.executor.executeTask({
      tokenId: tokenId,
      workflowRunId: token.workflowRunId,
      rootRunId: ctx.rootRunId,
      projectId: ctx.defs.getWorkflowRun().projectId,
      taskId: node.taskId,
      taskVersion: node.taskVersion ?? 1,
      input: taskInput,
      resources: resolvedResources,
      traceEvents: ctx.enableTraceEvents,
    }),
  );
}

// ============================================================================
// Subworkflow Dispatch
// ============================================================================

/**
 * Dispatch token to subworkflow coordinator for subworkflow execution.
 *
 * Unlike task dispatch, subworkflow dispatch:
 * - Creates a subworkflow coordinator DO
 * - Passes input mapped from context
 * - Marks token as waiting_for_subworkflow
 * - Subworkflow coordinator calls back via handleSubworkflowResult when done
 */
async function dispatchSubworkflow(
  ctx: DispatchContext,
  tokenId: string,
  token: { workflowRunId: string; nodeId: string },
  node: {
    subworkflowId: string | null;
    subworkflowVersion: number | null;
    inputMapping: object | null;
  },
): Promise<void> {
  if (!node.subworkflowId) {
    throw new Error('dispatchSubworkflow called on node without subworkflowId');
  }

  const run = ctx.defs.getWorkflowRun();

  // Apply input mapping to get subworkflow input
  const context = ctx.context.getSnapshot();
  const subworkflowInput = applyInputMapping(
    node.inputMapping as Record<string, string> | null,
    context,
  );

  ctx.emitter.emitTrace({
    type: 'dispatch.subworkflow.inputMapping.applied',
    tokenId: tokenId,
    nodeId: node.subworkflowId,
    payload: {
      inputMapping: node.inputMapping,
      subworkflowInput: subworkflowInput,
    },
  });

  // Generate run ID for the ephemeral subworkflow (ULID for sortability)
  const subworkflowRunId = ulid();

  // Get subworkflow coordinator DO
  const subworkflowCoordinatorId = ctx.coordinator.idFromName(subworkflowRunId);
  const subworkflowCoordinator = ctx.coordinator.get(subworkflowCoordinatorId);

  // Emit workflow event for subworkflow dispatch
  ctx.emitter.emit({
    eventType: 'subworkflow.dispatched',
    message: 'Subworkflow dispatched to coordinator',
    metadata: {
      tokenId: tokenId,
      nodeId: token.nodeId,
      subworkflowId: node.subworkflowId,
      subworkflowRunId: subworkflowRunId,
    },
  });

  // Mark token as waiting for subworkflow
  await applyDecisions(
    [
      {
        type: 'MARK_WAITING_FOR_SUBWORKFLOW',
        tokenId,
        subworkflowRunId,
        timeoutMs: undefined, // TODO: Support timeout on subworkflow nodes
      },
    ],
    ctx,
  );

  // Fire and forget - subworkflow coordinator will call back via handleSubworkflowResult when done
  // IMPORTANT: Pass subworkflowRunId so the subworkflow uses the same ID as its DO address.
  // This ensures executor callbacks (which use workflowRunId) reach the correct coordinator.
  ctx.waitUntil(
    subworkflowCoordinator.startSubworkflow({
      runId: subworkflowRunId,
      workflowId: node.subworkflowId,
      version: node.subworkflowVersion ?? undefined,
      input: subworkflowInput,
      rootRunId: ctx.rootRunId,
      parentRunId: token.workflowRunId,
      parentTokenId: tokenId,
      projectId: run.projectId,
    }),
  );
}

// ============================================================================
// Task Result Processing
// ============================================================================

/**
 * Process task result from Executor
 *
 * For linear flows: Apply node's outputMapping to write directly to context
 * For fan-out flows: Write to branch table, then check if siblings can merge
 *
 * The distinction is determined by whether this token has siblingGroup:
 * - No siblingGroup: Linear flow, use outputMapping to write to context
 * - Has siblingGroup: Branch flow, output goes to branch table for later merge
 */
export async function processTaskResult(
  ctx: DispatchContext,
  tokenId: string,
  result: TaskResult,
): Promise<void> {
  const token = ctx.tokens.get(tokenId);

  // Guard: Ignore results for tokens that are already in a terminal state.
  // This can happen when a sibling completes and triggers fan-in activation,
  // which cancels in-flight siblings. The executor may still call back with
  // results for those cancelled tokens - we safely ignore them.
  const terminalStates = ['completed', 'failed', 'cancelled', 'timed_out'];
  if (terminalStates.includes(token.status)) {
    ctx.logger.debug({
      eventType: 'task.result.ignored',
      message: `Ignoring task result for token in terminal state: ${token.status}`,
      metadata: { tokenId, status: token.status },
    });
    return;
  }

  // Mark token as completed via decision
  await applyDecisions([{ type: 'COMPLETE_TOKEN', tokenId }], ctx);

  // Get node for output mapping
  const node = ctx.defs.getNode(token.nodeId);

  // Handle output based on flow type
  if (token.siblingGroup) {
    // Fan-out flow: Write to branch table
    // Fan-in activation happens in processSynchronization below, not here
    // This ensures all sync logic goes through a single deterministic path
    await handleBranchOutput(ctx, token, node, result.outputData);
  } else {
    // Linear flow: Apply node's outputMapping to transform and store output
    // e.g., { "state.result": "$.greeting" } writes result.outputData.greeting to context.state.result
    await applyDecisions(
      [
        {
          type: 'APPLY_OUTPUT_MAPPING',
          outputMapping: node.outputMapping as Record<string, string> | null,
          outputData: result.outputData,
        },
      ],
      ctx,
    );
  }

  // Get context output after all mappings applied
  const contextOutput = ctx.context.get('output');

  // Emit task completed workflow event
  ctx.emitter.emit({
    eventType: 'task.completed',
    message: 'Task completed successfully',
    metadata: {
      tokenId: tokenId,
      taskId: node.taskId ?? 'none',
      nodeId: node.id,
      output: result.outputData,
      contextOutput: contextOutput,
    },
  });

  // Get outgoing transitions from completed node
  const transitions = ctx.defs.getTransitionsFrom(token.nodeId);

  // Get context snapshot for routing decisions
  const contextSnapshot = ctx.context.getSnapshot();

  // Plan routing decisions (returns decisions + trace events)
  // Always call decideRouting for consistent tracing, even with no transitions
  const routingResult = decideRouting({
    completedToken: token,
    workflowRunId: ctx.workflowRunId,
    nodeId: token.nodeId,
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
  const applyResult = await applyDecisions(routingResult.decisions, ctx);

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
 * Finalize workflow and extract output.
 *
 * Uses the COMPLETE_WORKFLOW decision which handles:
 * - Terminal state guards
 * - Status marking
 * - Event emission
 * - RESOURCES update
 */
async function finalizeWorkflow(ctx: DispatchContext): Promise<void> {
  try {
    // Get context snapshot and workflow def
    const context = ctx.context.getSnapshot();
    const workflowDef = ctx.defs.getWorkflowDef();

    // Extract final output using pure planning function
    const completionResult = extractFinalOutput(
      workflowDef.outputMapping as Record<string, string> | null,
      context,
    );

    // Emit trace events from completion planning
    for (const event of completionResult.events) {
      ctx.emitter.emitTrace(event);
    }

    // Apply COMPLETE_WORKFLOW decision (handles guards, status, event, RESOURCES)
    await applyDecisions([{ type: 'COMPLETE_WORKFLOW', output: completionResult.output }], ctx);
  } catch (error) {
    ctx.logger.error({
      eventType: 'coordinator.finalize.failed',
      message: 'Critical error in finalizeWorkflow()',
      traceId: ctx.workflowRunId,
      metadata: {
        ...errorDetails(error),
        workflowRunId: ctx.workflowRunId,
      },
    });
    throw error;
  }
}

/**
 * Resolve resource bindings from generic names to actual container DO IDs
 *
 * Node.resourceBindings maps generic names to workflow resource IDs:
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
