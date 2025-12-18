/**
 * Synchronization Decision Logic
 *
 * Pure planning module that determines fan-in synchronization behavior
 * when tokens arrive at nodes with synchronization requirements.
 *
 * Key concepts:
 * - Sibling group: Tokens that share the same sibling_group identifier
 * - Strategy: 'any' (first wins), 'all' (wait for all), m_of_n (quorum)
 * - Returns { decisions, events } tuple for dispatch to execute and emit
 */

import type { TraceEventInput } from '@wonder/events';
import type { SiblingCounts, TokenRow } from '../operations/tokens';
import type { Decision, MergeConfig, SynchronizationConfig, TransitionDef } from '../types';
import type { PlanningResult } from './routing';

// ============================================================================
// Main Synchronization Entry Point
// ============================================================================

/**
 * Decide synchronization behavior for a newly created token arriving
 * at a node with synchronization requirements.
 *
 * Scenarios:
 * 1. Token not in sibling group → pass through (MARK_FOR_DISPATCH)
 * 2. Strategy 'any' → dispatch immediately (MARK_FOR_DISPATCH)
 * 3. Strategy 'all' or m_of_n:
 *    - Condition met → ACTIVATE_FAN_IN (merge and proceed)
 *    - Not met → MARK_WAITING
 *
 * Returns both decisions and trace events for observability.
 */
export function decideSynchronization(params: {
  token: TokenRow;
  transition: TransitionDef;
  siblingCounts: SiblingCounts;
  workflowRunId: string;
}): PlanningResult {
  const { token, transition, siblingCounts, workflowRunId } = params;

  const events: TraceEventInput[] = [];

  // Emit sync start event
  events.push({
    type: 'decision.sync.start',
    token_id: token.id,
    payload: { sibling_count: siblingCounts.total },
  });

  // No synchronization config → pass through
  if (!transition.synchronization) {
    return { decisions: [{ type: 'MARK_FOR_DISPATCH', tokenId: token.id }], events };
  }

  const sync = transition.synchronization;

  // Emit sibling_group comparison event for tracing
  events.push({
    type: 'decision.sync.sibling_group_check',
    payload: {
      token_sibling_group: token.sibling_group,
      sync_sibling_group: sync.sibling_group,
      matches: token.sibling_group === sync.sibling_group,
    },
  });

  // Token not in the specified sibling group → pass through
  if (token.sibling_group !== sync.sibling_group) {
    events.push({
      type: 'decision.sync.skipped_wrong_sibling_group',
      payload: {
        token_sibling_group: token.sibling_group,
        sync_sibling_group: sync.sibling_group,
      },
    });
    return { decisions: [{ type: 'MARK_FOR_DISPATCH', tokenId: token.id }], events };
  }

  // 'any' strategy → first arrival proceeds immediately
  if (sync.strategy === 'any') {
    return { decisions: [{ type: 'MARK_FOR_DISPATCH', tokenId: token.id }], events };
  }

  // Check if synchronization condition is met
  const strategyStr =
    typeof sync.strategy === 'object' ? `m_of_n(${sync.strategy.m_of_n})` : sync.strategy;
  const required =
    sync.strategy === 'all' ? token.branch_total : (sync.strategy as { m_of_n: number }).m_of_n;
  const conditionMet = checkSyncCondition(sync.strategy, siblingCounts, token.branch_total);

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
      payload: { merge_config: sync.merge ?? null },
    });

    return {
      decisions: [
        {
          type: 'ACTIVATE_FAN_IN',
          workflowRunId,
          nodeId: transition.to_node_id,
          fanInPath: buildFanInPath(token.sibling_group!, transition.to_node_id),
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

/**
 * Check if synchronization condition is met based on strategy.
 *
 * @param strategy - 'all' or { m_of_n: number }
 * @param counts - Current sibling state counts
 * @param branchTotal - Total expected siblings
 */
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

  // m_of_n quorum
  const required = strategy.m_of_n;

  // Count successful completions (not failed/cancelled)
  // For quorum, typically we want completed (successful) tokens
  return counts.completed >= required;
}

/**
 * Build the fan-in path from a token's sibling_group and target node ID.
 * The fan-in path must be unique per synchronization point.
 *
 * Uses sibling_group:target_node_id so all transitions in the same sibling group
 * going to the same target node share one fan-in coordination path.
 * This ensures the SQL UNIQUE constraint properly prevents duplicate activations
 * even when multiple transitions exist (explicit fan-out pattern).
 *
 * Example: sibling_group 'phase1_fanin', target 'bridge' → Fan-in path 'phase1_fanin:bridge'
 */
function buildFanInPath(siblingGroup: string, targetNodeId: string): string {
  return `${siblingGroup}:${targetNodeId}`;
}

// ============================================================================
// Merge Strategy Helpers
// ============================================================================

/**
 * Determine if branch merge is needed.
 */
export function needsMerge(transition: TransitionDef): boolean {
  return transition.synchronization?.merge !== undefined;
}

/**
 * Get merge configuration from transition.
 */
export function getMergeConfig(transition: TransitionDef): MergeConfig | null {
  return transition.synchronization?.merge ?? null;
}

// ============================================================================
// Timeout Handling
// ============================================================================

/**
 * Check if synchronization has timed out.
 * Returns decisions based on on_timeout policy.
 */
export function decideOnTimeout(params: {
  waitingTokens: TokenRow[];
  transition: TransitionDef;
  workflowRunId: string;
}): Decision[] {
  const { waitingTokens, transition, workflowRunId } = params;

  if (!transition.synchronization) {
    return [];
  }

  const sync = transition.synchronization;
  const onTimeout = sync.on_timeout ?? 'fail';

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
      error: `Synchronization timeout for sibling group '${sync.sibling_group}'`,
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
        nodeId: transition.to_node_id,
        fanInPath: buildFanInPath(winnerToken.sibling_group!, transition.to_node_id),
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

/**
 * Check if a timeout is configured and has elapsed.
 */
export function hasTimedOut(
  transition: TransitionDef,
  oldestWaitingTimestamp: Date | null,
): boolean {
  if (!transition.synchronization?.timeout_ms) {
    return false;
  }

  if (!oldestWaitingTimestamp) {
    return false;
  }

  const elapsedMs = Date.now() - oldestWaitingTimestamp.getTime();
  return elapsedMs >= transition.synchronization.timeout_ms;
}

// ============================================================================
// Fan-In Continuation
// ============================================================================

/**
 * Decide fan-in continuation token creation.
 *
 * After fan-in merges sibling tokens, create a continuation token
 * to proceed execution at the target node.
 *
 * Returns both decisions and trace events for observability.
 */
export function decideFanInContinuation(params: {
  workflowRunId: string;
  nodeId: string;
  fanInPath: string;
  parentTokenId: string;
}): PlanningResult {
  const { workflowRunId, nodeId, fanInPath, parentTokenId } = params;

  const events: TraceEventInput[] = [];
  const decisions: Decision[] = [];

  // Emit fan-in continuation planning event
  events.push({
    type: 'decision.sync.continuation',
    node_id: nodeId,
    payload: {
      workflow_run_id: workflowRunId,
      fan_in_path: fanInPath,
    },
  });

  // Create continuation token to proceed after merge
  decisions.push({
    type: 'CREATE_TOKEN',
    params: {
      workflow_run_id: workflowRunId,
      node_id: nodeId,
      parent_token_id: parentTokenId,
      path_id: fanInPath,
      sibling_group: null, // Merged token is not part of a fan-out
      branch_index: 0,
      branch_total: 1,
    },
  });

  return { decisions, events };
}
