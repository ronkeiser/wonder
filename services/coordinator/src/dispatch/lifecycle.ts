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
import { applyDecisions, type DispatchContext } from './apply';
import { dispatchToken } from './task';

// ============================================================================
// Types
// ============================================================================

/** Task error result from executor */
export type TaskErrorResult = {
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
};

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
    event_type: 'workflow.started',
    message: 'Workflow started',
    metadata: { input },
  });

  // Initialize context tables and store input
  await ctx.context.initialize(input);

  // Plan initial token creation (pure function)
  const startResult = decideWorkflowStart({
    workflowRunId: workflowRun.id,
    initialNodeId: workflowDef.initial_node_id!,
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
export function processTaskError(
  ctx: DispatchContext,
  tokenId: string,
  errorResult: TaskErrorResult,
): void {
  const token = ctx.tokens.get(tokenId);
  const _node = ctx.defs.getNode(token.node_id);

  // TODO: Check retry policy and retry_attempt count
  // For now, just fail the workflow
  ctx.tokens.updateStatus(tokenId, 'failed');

  // Emit task failed workflow event
  ctx.emitter.emit({
    event_type: 'task.failed',
    message: `Task failed: ${errorResult.error.message}`,
    metadata: {
      token_id: tokenId,
      task_id: _node.task_id ?? 'none',
      node_id: token.node_id,
      error: errorResult.error,
      metrics: errorResult.metrics,
    },
  });

  // Check if we should fail the workflow
  // For now, any error fails the workflow
  failWorkflow(ctx, errorResult.error.message);
}

// ============================================================================
// Workflow Failure
// ============================================================================

/**
 * Fail workflow due to unrecoverable error
 */
export function failWorkflow(ctx: DispatchContext, errorMessage: string): void {
  ctx.emitter.emit({
    event_type: 'workflow.failed',
    message: `Workflow failed: ${errorMessage}`,
    metadata: { error: errorMessage },
  });
}
