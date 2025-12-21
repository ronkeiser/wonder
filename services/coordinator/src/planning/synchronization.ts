/**
 * Synchronization Decision Logic
 *
 * Pure planning module that determines fan-in synchronization behavior
 * when tokens arrive at nodes with synchronization requirements.
 *
 * Key concepts:
 * - Sibling group: Tokens that share the same siblingGroup identifier
 * - Strategy: 'any' (first wins), 'all' (wait for all), m_of_n (quorum)
 * - Returns { decisions, events } tuple for dispatch to execute and emit
 */

import type { TraceEventInput } from '@wonder/events';

import type { TokenRow } from '../operations/tokens';
import type {
  Decision,
  MergeConfig,
  PlanningResult,
  SiblingCounts,
  SynchronizationConfig,
  Transition,
} from '../types';

// ============================================================================
// Main Synchronization Entry Point
// ============================================================================

/**
 * Decide synchronization behavior for a token arriving at a sync point.
 *
 * Scenarios:
 * 1. Token not in sibling group → pass through (MARK_FOR_DISPATCH)
 * 2. Strategy 'any' → dispatch immediately (MARK_FOR_DISPATCH)
 * 3. Strategy 'all' or m_of_n:
 *    - Condition met → ACTIVATE_FAN_IN (merge and proceed)
 *    - Not met → MARK_WAITING
 */
export function decideSynchronization(params: {
  token: TokenRow;
  transition: Transition;
  siblingCounts: SiblingCounts;
  workflowRunId: string;
}): PlanningResult {
  const { token, transition, siblingCounts, workflowRunId } = params;

  const events: TraceEventInput[] = [];

  // Emit sync start event
  events.push({
    type: 'decision.sync.start',
    tokenId: token.id,
    payload: { siblingCount: siblingCounts.total },
  });

  // No synchronization config → pass through
  if (!transition.synchronization) {
    return { decisions: [{ type: 'MARK_FOR_DISPATCH', tokenId: token.id }], events };
  }

  const sync = transition.synchronization;

  // Emit siblingGroup comparison event for tracing
  events.push({
    type: 'decision.sync.siblingGroup_check',
    payload: {
      tokenSiblingGroup: token.siblingGroup,
      syncSiblingGroup: sync.siblingGroup,
      matches: token.siblingGroup === sync.siblingGroup,
    },
  });

  // Token not in the specified sibling group → pass through
  if (token.siblingGroup !== sync.siblingGroup) {
    events.push({
      type: 'decision.sync.skipped_wrong_siblingGroup',
      payload: {
        tokenSiblingGroup: token.siblingGroup,
        syncSiblingGroup: sync.siblingGroup,
      },
    });
    return { decisions: [{ type: 'MARK_FOR_DISPATCH', tokenId: token.id }], events };
  }

  // 'any' strategy → first arrival activates fan-in (same as m_of_n with m=1)
  // Uses ACTIVATE_FAN_IN to go through race-protected path - only first arrival wins
  if (sync.strategy === 'any') {
    events.push({
      type: 'decision.sync.activate',
      payload: { mergeConfig: sync.merge ?? null, strategy: 'any' },
    });

    return {
      decisions: [
        {
          type: 'ACTIVATE_FAN_IN',
          workflowRunId,
          nodeId: transition.toNodeId,
          fanInPath: buildFanInPath(token.siblingGroup!, transition.toNodeId),
          mergedTokenIds: [],
        },
      ],
      events,
    };
  }

  // Check if synchronization condition is met
  const strategyStr =
    typeof sync.strategy === 'object' ? `m_of_n(${sync.strategy.mOfN})` : sync.strategy;
  const required =
    sync.strategy === 'all' ? token.branchTotal : (sync.strategy as { mOfN: number }).mOfN;
  const conditionMet = checkSyncCondition(sync.strategy, siblingCounts, token.branchTotal);

  // Emit condition check event
  events.push({
    type: 'decision.sync.check_condition',
    payload: {
      strategy: strategyStr,
      completed: siblingCounts.completed,
      required,
    },
  });

  if (conditionMet) {
    // Condition met → activate fan-in
    events.push({
      type: 'decision.sync.activate',
      payload: { mergeConfig: sync.merge ?? null },
    });

    return {
      decisions: [
        {
          type: 'ACTIVATE_FAN_IN',
          workflowRunId,
          nodeId: transition.toNodeId,
          fanInPath: buildFanInPath(token.siblingGroup!, transition.toNodeId),
          // Note: mergedTokenIds is intentionally empty here. Planning is pure and
          // cannot query state. The dispatch layer (activateFanIn) queries the actual
          // completed siblings and performs the merge. This field exists for future
          // use cases where the caller might pre-compute the list.
          mergedTokenIds: [],
        },
      ],
      events,
    };
  }

  // Condition not met → wait
  events.push({
    type: 'decision.sync.wait',
    payload: { reason: `waiting for ${required - siblingCounts.completed} more siblings` },
  });

  return {
    decisions: [
      {
        type: 'MARK_WAITING',
        tokenId: token.id,
        arrivedAt: new Date(),
      },
    ],
    events,
  };
}

// ============================================================================
// Synchronization Condition Evaluation
// ============================================================================

/** Check if synchronization condition is met based on strategy. */
function checkSyncCondition(
  strategy: SynchronizationConfig['strategy'],
  counts: SiblingCounts,
  branchTotal: number,
): boolean {
  if (strategy === 'any') {
    // 'any' always passes (handled separately for clarity)
    return true;
  }

  if (strategy === 'all') {
    // All siblings must be in terminal state
    return counts.terminal >= branchTotal;
  }

  // mOfN quorum
  const required = strategy.mOfN;

  // Count successful completions (not failed/cancelled)
  // For quorum, typically we want completed (successful) tokens
  return counts.completed >= required;
}

/**
 * Build the fan-in path from siblingGroup and target node ID.
 *
 * Uses siblingGroup:targetNodeId so all transitions in the same sibling group
 * going to the same target node share one fan-in coordination path. This ensures
 * the SQL UNIQUE constraint properly prevents duplicate activations even when
 * multiple transitions exist (explicit fan-out pattern).
 */
function buildFanInPath(siblingGroup: string, targetNodeId: string): string {
  return `${siblingGroup}:${targetNodeId}`;
}

// ============================================================================
// Merge Strategy Helpers
// ============================================================================

/** Determine if branch merge is needed. */
export function needsMerge(transition: Transition): boolean {
  return transition.synchronization?.merge !== undefined;
}

/** Get merge configuration from transition. */
export function getMergeConfig(transition: Transition): MergeConfig | null {
  return transition.synchronization?.merge ?? null;
}

// ============================================================================
// Timeout Handling
// ============================================================================

/** Decide how to handle synchronization timeout based on policy. */
export function decideOnTimeout(params: {
  waitingTokens: TokenRow[];
  transition: Transition;
  workflowRunId: string;
}): Decision[] {
  const { waitingTokens, transition, workflowRunId } = params;

  if (!transition.synchronization) {
    return [];
  }

  const sync = transition.synchronization;
  const onTimeout = sync.onTimeout ?? 'fail';

  if (onTimeout === 'fail') {
    // Fail all waiting tokens
    const decisions: Decision[] = [];
    for (const token of waitingTokens) {
      decisions.push({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: token.id,
        status: 'timed_out',
      });
    }

    // Optionally fail the entire workflow
    decisions.push({
      type: 'FAIL_WORKFLOW',
      error: `Synchronization timeout for sibling group '${sync.siblingGroup}'`,
    });

    return decisions;
  }

  // 'proceed_with_available' - merge what we have
  if (waitingTokens.length > 0) {
    const winnerToken = waitingTokens[0];

    const decisions: Decision[] = [
      {
        type: 'ACTIVATE_FAN_IN',
        workflowRunId,
        nodeId: transition.toNodeId,
        fanInPath: buildFanInPath(winnerToken.siblingGroup!, transition.toNodeId),
        mergedTokenIds: [], // Dispatch populates with available completed siblings
      },
    ];

    // Mark remaining waiting tokens as timed out
    for (let i = 1; i < waitingTokens.length; i++) {
      decisions.push({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: waitingTokens[i].id,
        status: 'timed_out',
      });
    }

    return decisions;
  }

  return [];
}

/** Check if a timeout is configured and has elapsed. */
export function hasTimedOut(
  transition: Transition,
  oldestWaitingTimestamp: Date | null,
): boolean {
  if (!transition.synchronization?.timeoutMs) {
    return false;
  }

  if (!oldestWaitingTimestamp) {
    return false;
  }

  const elapsedMs = Date.now() - oldestWaitingTimestamp.getTime();
  return elapsedMs >= transition.synchronization.timeoutMs;
}

// ============================================================================
// Fan-In Continuation
// ============================================================================

/** Decide fan-in continuation token creation after merge. */
export function decideFanInContinuation(params: {
  workflowRunId: string;
  nodeId: string;
  fanInPath: string;
  parentTokenId: string;
  parentIterationCounts?: Record<string, number>;
}): PlanningResult {
  const { workflowRunId, nodeId, fanInPath, parentTokenId, parentIterationCounts } = params;

  const events: TraceEventInput[] = [];
  const decisions: Decision[] = [];

  // Emit fan-in continuation planning event
  events.push({
    type: 'decision.sync.continuation',
    nodeId: nodeId,
    payload: {
      workflowRunId: workflowRunId,
      fanInPath: fanInPath,
    },
  });

  // Create continuation token to proceed after merge
  // Inherits iterationCounts from fan-out origin (parent of siblings), not from siblings
  decisions.push({
    type: 'CREATE_TOKEN',
    params: {
      workflowRunId: workflowRunId,
      nodeId: nodeId,
      parentTokenId: parentTokenId,
      pathId: fanInPath,
      siblingGroup: null, // Merged token is not part of a fan-out
      branchIndex: 0,
      branchTotal: 1,
      iterationCounts: parentIterationCounts ?? null,
    },
  });

  return { decisions, events };
}
