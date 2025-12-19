/**
 * Routing Decision Logic
 *
 * Pure planning module that determines which transitions to follow
 * when a token completes execution.
 *
 * Key principles:
 * - No side effects (pure functions)
 * - Returns { decisions, events } tuple for dispatch to execute and emit
 * - Priority tiers: same priority = parallel, different = sequential
 * - Spawn count from transition config or foreach collection
 */

import type { TraceEventInput } from '@wonder/events';

import type { TransitionRow } from '../operations/defs';
import type { TokenRow } from '../operations/tokens';
import { evaluateCondition, getNestedValueByParts } from '../shared';
import type {
  Condition,
  ContextSnapshot,
  Decision,
  ForeachConfig,
  PlanningResult,
  SynchronizationConfig,
  TransitionDef,
} from '../types';

// ============================================================================
// Main Routing Entry Point
// ============================================================================

/**
 * Determine routing decisions after a token completes.
 *
 * Algorithm:
 * 1. Group transitions by priority
 * 2. Evaluate tiers in priority order (lower = higher priority)
 * 3. First tier with ANY matches wins; follow ALL matches in that tier
 * 4. For each matched transition, determine spawn count
 * 5. Generate CREATE_TOKEN decisions
 */
export function decideRouting(params: {
  completedToken: TokenRow;
  workflowRunId: string;
  nodeId: string;
  transitions: TransitionRow[];
  context: ContextSnapshot;
}): PlanningResult {
  const { completedToken, workflowRunId, nodeId, transitions, context } = params;
  const completedTokenId = completedToken.id;
  const completedTokenPath = completedToken.path_id;

  const events: TraceEventInput[] = [];
  const decisions: Decision[] = [];

  // Emit routing start event
  events.push({
    type: 'decision.routing.start',
    token_id: completedTokenId,
    node_id: nodeId,
  });

  // Group by priority tier
  const grouped = groupByPriority(transitions);
  const sortedPriorities = Array.from(grouped.keys()).sort((a, b) => a - b);

  // Find first tier with matches
  let matchedTransitions: TransitionRow[] = [];
  for (const priority of sortedPriorities) {
    const tier = grouped.get(priority) ?? [];

    for (const t of tier) {
      // Emit evaluation event for each transition
      events.push({
        type: 'decision.routing.evaluate_transition',
        payload: {
          transition_id: t.id,
          condition: t.condition,
        },
      });

      const matched = evaluateCondition(t.condition as Condition | null, context);

      if (matched) {
        matchedTransitions.push(t);
      }
    }

    if (matchedTransitions.length > 0) {
      break; // First tier with matches wins
    }
  }

  // No matches = no routing (caller handles workflow completion check)
  if (matchedTransitions.length === 0) {
    events.push({
      type: 'decision.routing.complete',
      payload: { decisions: [] },
    });
    return { decisions: [], events };
  }

  // Pre-compute total tokens per sibling_group for fan-out transitions
  const siblingGroupTotals = new Map<string, number>();
  for (const t of matchedTransitions) {
    if (t.sibling_group) {
      const count = determineSpawnCount(t, context);
      siblingGroupTotals.set(t.sibling_group, (siblingGroupTotals.get(t.sibling_group) ?? 0) + count);
    }
  }

  // Track branch_index per sibling_group for sequential indexing during fan-out
  const siblingGroupIndices = new Map<string, number>();

  for (const transition of matchedTransitions) {
    const spawnCount = determineSpawnCount(transition, context);

    // Fan-out origin: transition declares sibling_group
    // Continuation: inherit sibling identity from parent token
    const siblingGroup = transition.sibling_group ?? completedToken.sibling_group ?? null;
    const isFanOutOrigin = transition.sibling_group !== null;

    // branch_total: from pre-computed totals for fan-out, otherwise inherit
    const branchTotal = isFanOutOrigin
      ? siblingGroupTotals.get(transition.sibling_group!)!
      : completedToken.branch_total;

    events.push({
      type: 'decision.routing.transition_matched',
      payload: {
        transition_id: transition.id,
        spawn_count: spawnCount,
      },
    });

    for (let i = 0; i < spawnCount; i++) {
      // branch_index: sequential for fan-out origin, inherited for continuation
      let branchIndex: number;
      if (isFanOutOrigin) {
        branchIndex = siblingGroupIndices.get(transition.sibling_group!) ?? 0;
        siblingGroupIndices.set(transition.sibling_group!, branchIndex + 1);
      } else {
        branchIndex = completedToken.branch_index;
      }

      const pathId = buildPathId(completedTokenPath, nodeId, branchIndex, branchTotal);

      decisions.push({
        type: 'CREATE_TOKEN',
        params: {
          workflow_run_id: workflowRunId,
          node_id: transition.to_node_id,
          parent_token_id: completedTokenId,
          path_id: pathId,
          sibling_group: siblingGroup,
          branch_index: branchIndex,
          branch_total: branchTotal,
        },
      });
    }
  }

  // Emit routing complete event
  events.push({
    type: 'decision.routing.complete',
    payload: { decisions },
  });

  return { decisions, events };
}

/** Get transitions that have synchronization requirements. */
export function getTransitionsWithSynchronization(
  transitions: TransitionRow[],
  context: ContextSnapshot,
): TransitionDef[] {
  // Group by priority tier
  const grouped = groupByPriority(transitions);
  const sortedPriorities = Array.from(grouped.keys()).sort((a, b) => a - b);

  // Find first tier with matches
  for (const priority of sortedPriorities) {
    const tier = grouped.get(priority) ?? [];
    const matches = tier.filter((t) => evaluateCondition(t.condition as Condition | null, context));

    if (matches.length > 0) {
      // Return only transitions that have synchronization config
      return matches.filter((t) => t.synchronization !== null).map((t) => toTransitionDef(t));
    }
  }

  return [];
}

// Note: evaluateCondition is now imported from '../shared/condition-evaluator'


// ============================================================================
// Spawn Count
// ============================================================================

/** Determine how many tokens to spawn for a transition. */
function determineSpawnCount(transition: TransitionRow, context: ContextSnapshot): number {
  const foreachConfig = transition.foreach as ForeachConfig | null;

  if (foreachConfig) {
    // Dynamic: count items in collection
    const collection = getNestedValueByParts(
      { input: context.input, state: context.state, output: context.output },
      foreachConfig.collection.split('.'),
    );

    if (Array.isArray(collection)) {
      return collection.length;
    }
    // Non-array or missing: spawn 1 (graceful degradation)
    return 1;
  }

  // Static: use spawn_count or default to 1
  return transition.spawn_count ?? 1;
}

// ============================================================================
// Path Building
// ============================================================================

/** Build token path ID for lineage tracking. */
export function buildPathId(
  parentPath: string,
  nodeId: string,
  branchIndex: number,
  branchTotal: number,
): string {
  if (branchTotal > 1) {
    return `${parentPath}.${nodeId}.${branchIndex}`;
  }
  // No fan-out: keep parent path unchanged
  return parentPath;
}

// ============================================================================
// Helpers
// ============================================================================

/** Group transitions by priority. */
function groupByPriority(transitions: TransitionRow[]): Map<number, TransitionRow[]> {
  const grouped = new Map<number, TransitionRow[]>();

  for (const t of transitions) {
    const existing = grouped.get(t.priority) ?? [];
    existing.push(t);
    grouped.set(t.priority, existing);
  }

  return grouped;
}

/** Convert TransitionRow to TransitionDef for type-safe planning. */
export function toTransitionDef(row: TransitionRow): TransitionDef {
  return {
    id: row.id,
    ref: row.ref,
    from_node_id: row.from_node_id,
    to_node_id: row.to_node_id,
    priority: row.priority,
    condition: row.condition as Condition | null,
    spawn_count: row.spawn_count,
    sibling_group: row.sibling_group ?? null,
    foreach: row.foreach as ForeachConfig | null,
    synchronization: row.synchronization as SynchronizationConfig | null,
  };
}

