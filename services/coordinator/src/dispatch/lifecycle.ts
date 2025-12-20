/**
 * Workflow Lifecycle Dispatch
 *
 * Handles workflow start, error handling, and failure.
 *
 * Key responsibilities:
 * - Initialize workflow and dispatch first token
 * - Handle task errors and retries
 * - Fail workflow on unrecoverable errors
 */

import { decideWorkflowStart } from '../planning/index';
import type { DispatchContext, TaskErrorResult } from '../types';
import { applyDecisions } from './apply';
import { dispatchToken } from './task';

// ============================================================================
// Workflow Start
// ============================================================================

/**
 * Start workflow execution
 *
 * 1. Get workflow run and definition
 * 2. Initialize context tables with input
 * 3. Plan initial token creation
 * 4. Apply planning decisions
 * 5. Dispatch first token
 */
export async function startWorkflow(ctx: DispatchContext): Promise<void> {
  // Get definitions for token creation and input
  const workflowRun = ctx.defs.getWorkflowRun();
  const workflowDef = ctx.defs.getWorkflowDef();

  // Extract input from workflow run context
  const runContext = workflowRun.context as {
    input: Record<string, unknown>;
    state: object;
    output: object;
  };
  const input = runContext.input;

  // Emit workflow started event
  ctx.emitter.emit({
    eventType: 'workflow.started',
    message: 'Workflow started',
    metadata: { input },
  });

  // Initialize context tables and store input
  await ctx.context.initialize(input);

  // Plan initial token creation (pure function)
  const startResult = decideWorkflowStart({
    workflowRunId: workflowRun.id,
    initialNodeId: workflowDef.initialNodeId!,
  });

  // Emit trace events from planning
  for (const event of startResult.events) {
    ctx.emitter.emitTrace(event);
  }

  // Apply planning decisions (creates token)
  const applyResult = applyDecisions(startResult.decisions, ctx);

  // Get the created token ID
  if (applyResult.tokensCreated.length === 0) {
    throw new Error('Failed to create initial token');
  }

  const tokenId = applyResult.tokensCreated[0];

  // Dispatch token (start execution)
  await dispatchToken(ctx, tokenId);
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handle task error from Executor
 *
 * Called when task execution fails. May trigger retry based on error type.
 */
export async function processTaskError(
  ctx: DispatchContext,
  tokenId: string,
  errorResult: TaskErrorResult,
): Promise<void> {
  const token = ctx.tokens.get(tokenId);
  const _node = ctx.defs.getNode(token.nodeId);

  // TODO: Check retry policy and retry_attempt count
  // For now, just fail the workflow
  ctx.tokens.updateStatus(tokenId, 'failed');

  // Emit task failed workflow event
  ctx.emitter.emit({
    eventType: 'task.failed',
    message: `Task failed: ${errorResult.error.message}`,
    metadata: {
      tokenId: tokenId,
      taskId: _node.taskId ?? 'none',
      nodeId: token.nodeId,
      error: errorResult.error,
      metrics: errorResult.metrics,
    },
  });

  // Check if we should fail the workflow
  // For now, any error fails the workflow
  await failWorkflow(ctx, errorResult.error.message);
}

// ============================================================================
// Workflow Failure
// ============================================================================

/**
 * Fail workflow due to unrecoverable error
 */
export async function failWorkflow(ctx: DispatchContext, errorMessage: string): Promise<void> {
  ctx.emitter.emit({
    eventType: 'workflow.failed',
    message: `Workflow failed: ${errorMessage}`,
    metadata: { error: errorMessage },
  });

  // Update workflow run status in resources service
  const workflowRunsResource = ctx.resources.workflowRuns();
  await workflowRunsResource.updateStatus(ctx.workflowRunId, 'failed');
}
