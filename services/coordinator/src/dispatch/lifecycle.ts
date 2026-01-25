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
import { decideOnTimeout, getEarliestTimeoutMs, hasTimedOut } from '../planning/synchronization';
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
 * 2. Initialize workflow (status + context) via decision
 * 3. Plan initial token creation
 * 4. Apply planning decisions
 * 5. Dispatch first token
 */
export async function startWorkflow(ctx: DispatchContext): Promise<void> {
  // Get definitions for token creation and input
  const workflowRun = ctx.defs.getWorkflowRun();
  const workflowDefContent = ctx.defs.getWorkflowDefContent();

  // Extract input from workflow run context
  const runContext = workflowRun.context as {
    input: Record<string, unknown>;
    state: object;
    output: object;
  };
  const input = runContext.input;

  // Initialize workflow via decision (status + context + event)
  await applyDecisions([{ type: 'INITIALIZE_WORKFLOW', input }], ctx);

  // Plan initial token creation (pure function)
  const startResult = decideWorkflowStart({
    workflowRunId: workflowRun.id,
    initialNodeId: workflowDefContent.initialNodeId!,
  });

  // Emit trace events from planning
  for (const event of startResult.events) {
    ctx.emitter.emitTrace(event);
  }

  // Apply planning decisions (creates token)
  const applyResult = await applyDecisions(startResult.decisions, ctx);

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
 * Uses the decision pattern for all state changes.
 */
export async function processTaskError(
  ctx: DispatchContext,
  tokenId: string,
  errorResult: TaskErrorResult,
): Promise<void> {
  const token = ctx.tokens.get(tokenId);
  const node = ctx.defs.getNode(token.nodeId);

  // Emit task failed workflow event
  ctx.emitter.emit({
    eventType: 'task.failed',
    message: `Task failed: ${errorResult.error.message}`,
    metadata: {
      tokenId: tokenId,
      taskId: node.taskId ?? 'none',
      nodeId: token.nodeId,
      error: errorResult.error,
      metrics: errorResult.metrics,
    },
  });

  // TODO: Check retry policy and retry_attempt count
  // For now, mark token as failed and fail the workflow via decisions
  await applyDecisions(
    [
      { type: 'UPDATE_TOKEN_STATUS', tokenId, status: 'failed' },
      { type: 'FAIL_WORKFLOW', error: errorResult.error.message },
    ],
    ctx,
  );
}

// ============================================================================
// Timeout Handling
// ============================================================================

/**
 * Check all waiting tokens for timeouts and handle them.
 *
 * Called by the alarm handler when it fires.
 * Handles two types of timeouts:
 * 1. Fan-in synchronization timeouts (waiting_for_siblings)
 * 2. Sub-workflow timeouts (waiting_for_subworkflow)
 *
 * Automatically schedules the next alarm if there are remaining waiting tokens.
 */
export async function checkTimeouts(ctx: DispatchContext): Promise<void> {
  await checkSiblingTimeouts(ctx);
  await checkSubworkflowTimeouts(ctx);
  await scheduleNextAlarmIfNeeded(ctx);
}

/**
 * Check fan-in synchronization timeouts for tokens waiting for siblings.
 */
async function checkSiblingTimeouts(ctx: DispatchContext): Promise<void> {
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

      // Apply all decisions (including FAIL_WORKFLOW if present)
      await applyDecisions(decisions, ctx);
    }
  }
}

/**
 * Check subworkflow timeouts for tokens waiting for subworkflows.
 */
async function checkSubworkflowTimeouts(ctx: DispatchContext): Promise<void> {
  const runningSubworkflows = ctx.subworkflows.getRunning(ctx.workflowRunId);

  for (const subworkflow of runningSubworkflows) {
    // Skip if no timeout configured
    if (!subworkflow.timeoutMs) continue;

    // Check if timeout has elapsed since subworkflow was created
    const elapsed = Date.now() - subworkflow.createdAt.getTime();
    if (elapsed < subworkflow.timeoutMs) continue;

    // Handle timeout via decision
    await applyDecisions(
      [
        {
          type: 'TIMEOUT_SUBWORKFLOW',
          tokenId: subworkflow.parentTokenId,
          subworkflowRunId: subworkflow.subworkflowRunId,
          timeoutMs: subworkflow.timeoutMs,
          elapsedMs: elapsed,
        },
      ],
      ctx,
    );
  }
}

/**
 * Schedule the next alarm if there are still waiting tokens with timeouts.
 */
async function scheduleNextAlarmIfNeeded(ctx: DispatchContext): Promise<void> {
  const transitions = ctx.defs.getTransitions();

  // Check for sibling waiting tokens
  const stillWaitingForSiblings = ctx.tokens.getOldestWaitingTimestamp();
  if (stillWaitingForSiblings) {
    const nextAlarmMs = getEarliestTimeoutMs(transitions);
    if (nextAlarmMs) {
      await ctx.scheduleAlarm(nextAlarmMs);
      return;
    }
  }

  // Check for subworkflow waiting tokens
  const runningSubworkflows = ctx.subworkflows.getRunning(ctx.workflowRunId);
  let earliestSubworkflowTimeout: number | null = null;

  for (const subworkflow of runningSubworkflows) {
    if (!subworkflow.timeoutMs) continue;
    const elapsed = Date.now() - subworkflow.createdAt.getTime();
    const remaining = subworkflow.timeoutMs - elapsed;
    if (remaining > 0) {
      if (!earliestSubworkflowTimeout || remaining < earliestSubworkflowTimeout) {
        earliestSubworkflowTimeout = remaining;
      }
    }
  }

  if (earliestSubworkflowTimeout) {
    await ctx.scheduleAlarm(earliestSubworkflowTimeout);
  }
}
