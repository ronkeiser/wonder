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
  LoopConfig,
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
  const completedTokenPath = completedToken.pathId;

  const events: TraceEventInput[] = [];
  const decisions: Decision[] = [];

  // Emit routing start event
  events.push({
    type: 'decision.routing.start',
    tokenId: completedTokenId,
    nodeId: nodeId,
  });

  // Group by priority tier
  const grouped = groupByPriority(transitions);
  const sortedPriorities = Array.from(grouped.keys()).sort((a, b) => a - b);

  // Find first tier with matches
  let matchedTransitions: TransitionRow[] = [];
  for (const priority of sortedPriorities) {
    const tier = grouped.get(priority) ?? [];

    for (const t of tier) {
      // Check loopConfig.maxIterations before evaluating condition
      const loopConfig = t.loopConfig as LoopConfig | null;
      if (loopConfig?.maxIterations) {
        const currentCount = completedToken.iterationCounts?.[t.id] ?? 0;
        if (currentCount >= loopConfig.maxIterations) {
          // Skip this transition - max iterations reached
          events.push({
            type: 'decision.routing.loop_limit_reached',
            payload: {
              transitionId: t.id,
              currentCount: currentCount,
              maxIterations: loopConfig.maxIterations,
            },
          });
          continue;
        }
      }

      // Emit evaluation event for each transition
      events.push({
        type: 'decision.routing.evaluate_transition',
        payload: {
          transitionId: t.id,
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

  // Pre-compute total tokens per siblingGroup for fan-out transitions
  const siblingGroupTotals = new Map<string, number>();
  for (const t of matchedTransitions) {
    if (t.siblingGroup) {
      const count = determineSpawnCount(t, context);
      siblingGroupTotals.set(t.siblingGroup, (siblingGroupTotals.get(t.siblingGroup) ?? 0) + count);
    }
  }

  // Track branchIndex per siblingGroup for sequential indexing during fan-out
  const siblingGroupIndices = new Map<string, number>();

  for (const transition of matchedTransitions) {
    const spawnCount = determineSpawnCount(transition, context);

    // Fan-out origin: transition declares siblingGroup
    // Continuation: inherit sibling identity from parent token
    const siblingGroup = transition.siblingGroup ?? completedToken.siblingGroup ?? null;
    const isFanOutOrigin = transition.siblingGroup !== null;

    // branchTotal: from pre-computed totals for fan-out, otherwise inherit
    const branchTotal = isFanOutOrigin
      ? siblingGroupTotals.get(transition.siblingGroup!)!
      : completedToken.branchTotal;

    events.push({
      type: 'decision.routing.transition_matched',
      payload: {
        transitionId: transition.id,
        spawnCount: spawnCount,
      },
    });

    // Build iterationCounts for child tokens: copy parent's counts and increment for this transition
    const parentCounts = completedToken.iterationCounts ?? {};
    const childIterationCounts: Record<string, number> = {
      ...parentCounts,
      [transition.id]: (parentCounts[transition.id] ?? 0) + 1,
    };

    for (let i = 0; i < spawnCount; i++) {
      // branchIndex: sequential for fan-out origin, inherited for continuation
      let branchIndex: number;
      if (isFanOutOrigin) {
        branchIndex = siblingGroupIndices.get(transition.siblingGroup!) ?? 0;
        siblingGroupIndices.set(transition.siblingGroup!, branchIndex + 1);
      } else {
        branchIndex = completedToken.branchIndex;
      }

      const pathId = buildPathId(completedTokenPath, nodeId, branchIndex, branchTotal);

      decisions.push({
        type: 'CREATE_TOKEN',
        params: {
          workflowRunId: workflowRunId,
          nodeId: transition.toNodeId,
          parentTokenId: completedTokenId,
          pathId: pathId,
          siblingGroup: siblingGroup,
          branchIndex: branchIndex,
          branchTotal: branchTotal,
          iterationCounts: childIterationCounts,
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

  // Static: use spawnCount or default to 1
  return transition.spawnCount ?? 1;
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
    ref: row.ref ?? undefined,
    fromNodeId: row.fromNodeId,
    toNodeId: row.toNodeId,
    priority: row.priority,
    condition: row.condition as Condition | undefined,
    spawnCount: row.spawnCount ?? undefined,
    siblingGroup: row.siblingGroup ?? undefined,
    foreach: row.foreach as ForeachConfig | undefined,
    synchronization: row.synchronization as SynchronizationConfig | undefined,
  };
}

