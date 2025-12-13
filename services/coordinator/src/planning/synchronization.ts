/**
 * Synchronization Decision Logic
 *
 * Pure planning module that determines fan-in synchronization behavior
 * when tokens arrive at nodes with synchronization requirements.
 *
 * Key concepts:
 * - Sibling group: Tokens spawned from the same fan-out transition
 * - Strategy: 'any' (first wins), 'all' (wait for all), m_of_n (quorum)
 * - Returns Decision[] for dispatch to execute
 */

import type { SiblingCounts, TokenRow } from '../operations/tokens';
import type { Decision, MergeConfig, SynchronizationConfig, TransitionDef } from '../types';

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
 */
export function decideSynchronization(params: {
  token: TokenRow;
  transition: TransitionDef;
  siblingCounts: SiblingCounts;
  workflowRunId: string;
}): Decision[] {
  const { token, transition, siblingCounts, workflowRunId } = params;

  // No synchronization config → pass through
  if (!transition.synchronization) {
    return [{ type: 'MARK_FOR_DISPATCH', tokenId: token.id }];
  }

  const sync = transition.synchronization;

  // Token not in the specified sibling group → pass through
  if (token.fan_out_transition_id !== sync.sibling_group) {
    return [{ type: 'MARK_FOR_DISPATCH', tokenId: token.id }];
  }

  // 'any' strategy → first arrival proceeds immediately
  if (sync.strategy === 'any') {
    return [{ type: 'MARK_FOR_DISPATCH', tokenId: token.id }];
  }

  // Check if synchronization condition is met
  const conditionMet = checkSyncCondition(sync.strategy, siblingCounts, token.branch_total);

  if (conditionMet) {
    // Condition met → activate fan-in
    return [
      {
        type: 'ACTIVATE_FAN_IN',
        workflowRunId,
        nodeId: transition.to_node_id,
        fanInPath: buildFanInPath(token.path_id),
        mergedTokenIds: [], // Will be populated by dispatch layer with actual sibling IDs
      },
    ];
  }

  // Condition not met → wait
  return [
    {
      type: 'MARK_WAITING',
      tokenId: token.id,
      arrivedAt: new Date(),
    },
  ];
}

/**
 * Re-evaluate synchronization when a sibling completes.
 * Called when a token transitions to terminal state and siblings are waiting.
 */
export function decideOnSiblingCompletion(params: {
  completedToken: TokenRow;
  waitingTokens: TokenRow[];
  transition: TransitionDef;
  siblingCounts: SiblingCounts;
  workflowRunId: string;
}): Decision[] {
  const { completedToken, waitingTokens, transition, siblingCounts, workflowRunId } = params;

  if (!transition.synchronization) {
    return [];
  }

  const sync = transition.synchronization;

  // Only process if completed token is part of this sibling group
  if (completedToken.fan_out_transition_id !== sync.sibling_group) {
    return [];
  }

  // Check if condition is now met
  const conditionMet = checkSyncCondition(
    sync.strategy,
    siblingCounts,
    completedToken.branch_total,
  );

  if (!conditionMet) {
    // Still waiting
    return [];
  }

  // Condition met → activate fan-in for waiting tokens
  // Pick one waiting token to become the "winner" that proceeds
  if (waitingTokens.length === 0) {
    // No waiting tokens means the completing token should trigger fan-in
    return [
      {
        type: 'ACTIVATE_FAN_IN',
        workflowRunId,
        nodeId: transition.to_node_id,
        fanInPath: buildFanInPath(completedToken.path_id),
        mergedTokenIds: [], // Dispatch layer populates with all sibling IDs
      },
    ];
  }

  // Use first waiting token as the one to proceed
  const winnerToken = waitingTokens[0];

  const decisions: Decision[] = [
    {
      type: 'ACTIVATE_FAN_IN',
      workflowRunId,
      nodeId: transition.to_node_id,
      fanInPath: buildFanInPath(winnerToken.path_id),
      mergedTokenIds: [], // Dispatch layer populates
    },
  ];

  // Cancel remaining waiting tokens (they were absorbed by merge)
  for (let i = 1; i < waitingTokens.length; i++) {
    decisions.push({
      type: 'UPDATE_TOKEN_STATUS',
      tokenId: waitingTokens[i].id,
      status: 'cancelled',
    });
  }

  return decisions;
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
 * Build the fan-in path from a token's path.
 * The fan-in path represents the common ancestor for all siblings.
 *
 * Example: Token path 'root.A.0.B.2' → Fan-in path 'root.A.0'
 * (strips the last .nodeId.branchIndex segment)
 */
function buildFanInPath(tokenPath: string): string {
  const parts = tokenPath.split('.');

  // Path format: root[.nodeId.branchIndex]*
  // To get fan-in path, remove last two segments (nodeId and branchIndex)
  if (parts.length >= 3) {
    return parts.slice(0, -2).join('.');
  }

  // Root level or malformed path
  return parts[0] ?? 'root';
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

/**
 * Create decisions for merging branch outputs.
 * Called by dispatch layer after ACTIVATE_FAN_IN.
 */
export function decideMerge(params: {
  siblingTokenIds: string[];
  branchIndices: number[];
  merge: MergeConfig;
  outputSchema: object;
}): Decision[] {
  const { siblingTokenIds, branchIndices, merge, outputSchema } = params;

  return [
    {
      type: 'MERGE_BRANCHES',
      tokenIds: siblingTokenIds,
      branchIndices,
      outputSchema,
      merge,
    },
    {
      type: 'DROP_BRANCH_TABLES',
      tokenIds: siblingTokenIds,
    },
  ];
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
  siblingCounts: SiblingCounts;
  workflowRunId: string;
}): Decision[] {
  const { waitingTokens, transition, siblingCounts, workflowRunId } = params;

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
        fanInPath: buildFanInPath(winnerToken.path_id),
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
