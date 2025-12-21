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
import { decideOnTimeout, hasTimedOut } from '../planning/synchronization';
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

  // Initialize workflow status to 'running'
  ctx.status.initialize(ctx.workflowRunId);

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
 * Fail workflow due to unrecoverable error.
 *
 * This function:
 * 1. Checks if workflow is already in terminal state (guard)
 * 2. Marks workflow status as 'failed' in coordinator DO
 * 3. Cancels all active (non-terminal) tokens
 * 4. Emits workflow.failed event
 * 5. Updates status in resources service
 */
export async function failWorkflow(ctx: DispatchContext, errorMessage: string): Promise<void> {
  // Guard: Check if workflow is already in terminal state
  if (ctx.status.isTerminal(ctx.workflowRunId)) {
    ctx.logger.debug({
      eventType: 'workflow.fail.skipped',
      message: 'Workflow already in terminal state, skipping failure',
      metadata: { workflowRunId: ctx.workflowRunId, error: errorMessage },
    });
    return;
  }

  // Mark workflow as failed in coordinator DO (returns false if already terminal)
  const marked = ctx.status.markFailed(ctx.workflowRunId);
  if (!marked) {
    return;
  }

  // Cancel all active tokens to prevent further processing
  const activeTokens = ctx.tokens.getActiveTokens(ctx.workflowRunId);
  if (activeTokens.length > 0) {
    ctx.tokens.cancelMany(
      activeTokens.map((t) => t.id),
      `workflow failed: ${errorMessage}`,
    );
  }

  // Emit workflow.failed event
  ctx.emitter.emit({
    eventType: 'workflow.failed',
    message: `Workflow failed: ${errorMessage}`,
    metadata: { error: errorMessage },
  });

  // Update workflow run status in resources service
  const workflowRunsResource = ctx.resources.workflowRuns();
  await workflowRunsResource.updateStatus(ctx.workflowRunId, 'failed');
}

// ============================================================================
// Timeout Handling
// ============================================================================

/**
 * Check all waiting tokens for timeouts and handle them.
 *
 * Called by the alarm handler when it fires.
 * Groups waiting tokens by their sibling group, checks each group's
 * transition for timeout, and applies timeout decisions.
 */
export async function checkTimeouts(ctx: DispatchContext): Promise<void> {
  const waitingTokens = ctx.tokens.getAllWaitingTokens();
  if (waitingTokens.length === 0) {
    return;
  }

  // Group waiting tokens by sibling group
  const byGroup = new Map<string, typeof waitingTokens>();
  for (const token of waitingTokens) {
    if (!token.siblingGroup) continue;
    const group = byGroup.get(token.siblingGroup) ?? [];
    group.push(token);
    byGroup.set(token.siblingGroup, group);
  }

  // Check each group for timeout
  const transitions = ctx.defs.getTransitions();
  const workflowRun = ctx.defs.getWorkflowRun();

  for (const [siblingGroup, tokens] of byGroup) {
    // Find the transition with synchronization config for this sibling group
    const transition = transitions.find(
      (t) => t.synchronization?.siblingGroup === siblingGroup,
    );

    if (!transition) continue;

    // Find oldest waiting timestamp for this group
    let oldest: Date | null = null;
    for (const token of tokens) {
      if (token.arrivedAt && (!oldest || token.arrivedAt < oldest)) {
        oldest = token.arrivedAt;
      }
    }

    // Check if timeout has elapsed
    if (hasTimedOut(transition, oldest)) {
      ctx.emitter.emit({
        eventType: 'sync.timeout',
        message: `Synchronization timeout for sibling group '${siblingGroup}'`,
        metadata: {
          siblingGroup,
          waitingCount: tokens.length,
          oldestWaiting: oldest?.toISOString(),
        },
      });

      // Generate timeout decisions
      const decisions = decideOnTimeout({
        waitingTokens: tokens,
        transition,
        workflowRunId: workflowRun.id,
      });

      // Apply decisions (marks waiting tokens as timed_out)
      applyDecisions(decisions, ctx);

      // If workflow should fail, use failWorkflow for proper status management
      const failDecision = decisions.find((d) => d.type === 'FAIL_WORKFLOW');
      if (failDecision && failDecision.type === 'FAIL_WORKFLOW') {
        await failWorkflow(ctx, failDecision.error);
      }
    }
  }
}
