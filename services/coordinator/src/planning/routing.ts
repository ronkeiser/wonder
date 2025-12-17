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
import type {
  Condition,
  ContextSnapshot,
  Decision,
  FieldRef,
  ForeachConfig,
  Literal,
  SynchronizationConfig,
  TransitionDef,
} from '../types';

/** Result from planning functions - decisions to apply and events to emit */
export type PlanningResult = {
  decisions: Decision[];
  events: TraceEventInput[];
};

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
 *
 * Returns both decisions and trace events for observability.
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

  // Count total tokens per sibling_group for fan-out patterns
  // Handles both:
  // 1. Explicit sibling_group: multiple transitions share the same named group
  // 2. spawn_count without explicit sibling_group: uses transition ref as implicit group
  const siblingGroupTotals = new Map<string, number>();
  for (const t of matchedTransitions) {
    const count = determineSpawnCount(t, context);
    const sg = t.sibling_group ?? null;
    if (sg !== null) {
      // Explicit sibling_group
      siblingGroupTotals.set(sg, (siblingGroupTotals.get(sg) ?? 0) + count);
    } else if (count > 1) {
      // spawn_count fan-out: use transition ref as implicit sibling_group
      const implicitSg = t.ref ?? t.id;
      siblingGroupTotals.set(implicitSg, (siblingGroupTotals.get(implicitSg) ?? 0) + count);
    }
  }

  // Generate CREATE_TOKEN decisions for each match
  // Track branch_index per sibling_group for correct indexing
  const siblingGroupIndices = new Map<string, number>();

  for (const transition of matchedTransitions) {
    const spawnCount = determineSpawnCount(transition, context);

    // Determine sibling group membership
    // Two patterns for fan-out:
    // 1. Explicit sibling_group on transition: use that value
    // 2. spawn_count > 1 without explicit sibling_group: use transition ref as sibling_group
    // For continuations (spawn_count == 1, no sibling_group): inherit from parent
    const transitionSiblingGroup = transition.sibling_group ?? null;
    const hasExplicitSiblingGroup = transitionSiblingGroup !== null;
    const isSpawnCountFanOut = spawnCount > 1;

    let siblingGroup: string | null;
    if (hasExplicitSiblingGroup) {
      // Explicit sibling_group declared on transition
      siblingGroup = transitionSiblingGroup;
    } else if (isSpawnCountFanOut) {
      // spawn_count fan-out: use transition ref as implicit sibling_group
      siblingGroup = transition.ref ?? transition.id;
    } else {
      // Continuation: inherit from parent
      siblingGroup = completedToken.sibling_group ?? null;
    }

    // Determine branch_total:
    // 1. For fan-out (explicit or spawn_count): look up total from siblingGroupTotals
    // 2. For continuation: inherit from parent
    let branchTotal: number;
    if (siblingGroup !== null && siblingGroupTotals.has(siblingGroup)) {
      branchTotal = siblingGroupTotals.get(siblingGroup)!;
    } else {
      branchTotal = completedToken.branch_total;
    }

    // Emit transition matched event
    events.push({
      type: 'decision.routing.transition_matched',
      payload: {
        transition_id: transition.id,
        spawn_count: spawnCount,
      },
    });

    for (let i = 0; i < spawnCount; i++) {
      // Determine branch_index:
      // 1. Fan-out (siblingGroup is set): use global index across all tokens in the group
      // 2. Continuation (siblingGroup inherited/null): inherit from parent
      let branchIndex: number;
      if (siblingGroup !== null && siblingGroupTotals.has(siblingGroup)) {
        // Fan-out: track global index across all matched transitions in this group
        branchIndex = siblingGroupIndices.get(siblingGroup) ?? 0;
        siblingGroupIndices.set(siblingGroup, branchIndex + 1);
      } else {
        // Continuation: inherit branch_index from parent to maintain sibling identity
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

/**
 * Get transitions that need synchronization checks.
 * Returns TransitionDef objects for each created token's target transition.
 */
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

// ============================================================================
// Condition Evaluation
// ============================================================================

// TODO: Implement CEL expression evaluation. Spec (branching.md) says
// "CEL expressions available as fallback for complex logic not covered
// by structured conditions." Currently throws "not yet supported".

/**
 * Evaluate a condition against context.
 * Returns true if condition is null/undefined (unconditional).
 */
export function evaluateCondition(
  condition: Condition | null | undefined,
  context: ContextSnapshot,
): boolean {
  if (condition === null || condition === undefined) {
    return true; // Unconditional
  }

  switch (condition.type) {
    case 'comparison':
      return evaluateComparison(condition, context);

    case 'exists':
      return evaluateExists(condition, context);

    case 'in_set':
      return evaluateInSet(condition, context);

    case 'array_length':
      return evaluateArrayLength(condition, context);

    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, context));

    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, context));

    case 'not':
      return !evaluateCondition(condition.condition, context);

    case 'cel':
      // CEL expressions require runtime evaluation - placeholder for now
      throw new Error(`CEL expressions not yet supported: ${condition.expression}`);

    default: {
      // Exhaustive check
      const _exhaustive: never = condition;
      throw new Error(`Unknown condition type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function evaluateComparison(
  condition: Extract<Condition, { type: 'comparison' }>,
  context: ContextSnapshot,
): boolean {
  const left = resolveValue(condition.left, context);
  const right = resolveValue(condition.right, context);

  switch (condition.operator) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
      return (left as number) > (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '<':
      return (left as number) < (right as number);
    case '<=':
      return (left as number) <= (right as number);
    default: {
      const _exhaustive: never = condition.operator;
      throw new Error(`Unknown operator: ${_exhaustive}`);
    }
  }
}

function evaluateExists(
  condition: Extract<Condition, { type: 'exists' }>,
  context: ContextSnapshot,
): boolean {
  const value = resolveField(condition.field, context);
  return value !== undefined && value !== null;
}

function evaluateInSet(
  condition: Extract<Condition, { type: 'in_set' }>,
  context: ContextSnapshot,
): boolean {
  const value = resolveField(condition.field, context);
  return condition.values.includes(value);
}

function evaluateArrayLength(
  condition: Extract<Condition, { type: 'array_length' }>,
  context: ContextSnapshot,
): boolean {
  const value = resolveField(condition.field, context);
  if (!Array.isArray(value)) {
    return false;
  }

  const length = value.length;
  const target = condition.value;

  switch (condition.operator) {
    case '==':
      return length === target;
    case '!=':
      return length !== target;
    case '>':
      return length > target;
    case '>=':
      return length >= target;
    case '<':
      return length < target;
    case '<=':
      return length <= target;
    default: {
      const _exhaustive: never = condition.operator;
      throw new Error(`Unknown operator: ${_exhaustive}`);
    }
  }
}

// ============================================================================
// Value Resolution
// ============================================================================

/**
 * Resolve a field reference or literal to its value.
 */
function resolveValue(ref: FieldRef | Literal, context: ContextSnapshot): unknown {
  if ('literal' in ref) {
    return ref.literal;
  }
  return resolveField(ref, context);
}

/**
 * Resolve a field path to its value in context.
 * Supports dot notation: 'input.user.name', 'state.score', etc.
 */
function resolveField(ref: FieldRef, context: ContextSnapshot): unknown {
  const path = ref.field;
  const parts = path.split('.');

  // First part determines which context section
  const section = parts[0];
  let current: unknown;

  switch (section) {
    case 'input':
      current = context.input;
      break;
    case 'state':
      current = context.state;
      break;
    case 'output':
      current = context.output;
      break;
    default:
      // Allow direct access if not a known section
      current = { ...context.input, ...context.state, ...context.output };
      // Don't skip the first part
      return getNestedValue(current, parts);
  }

  // Navigate remaining path
  return getNestedValue(current, parts.slice(1));
}

/**
 * Navigate nested object by path parts.
 */
function getNestedValue(obj: unknown, parts: string[]): unknown {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ============================================================================
// Spawn Count
// ============================================================================

/**
 * Determine how many tokens to spawn for a transition.
 */
function determineSpawnCount(transition: TransitionRow, context: ContextSnapshot): number {
  const foreachConfig = transition.foreach as ForeachConfig | null;

  if (foreachConfig) {
    // Dynamic: count items in collection
    const collection = getNestedValue(
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

/**
 * Build token path ID for lineage tracking.
 *
 * Format: parent_path[.nodeId.branchIndex]
 * Only appends when there's fan-out (multiple branches).
 */
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

/**
 * Group transitions by priority.
 */
function groupByPriority(transitions: TransitionRow[]): Map<number, TransitionRow[]> {
  const grouped = new Map<number, TransitionRow[]>();

  for (const t of transitions) {
    const existing = grouped.get(t.priority) ?? [];
    existing.push(t);
    grouped.set(t.priority, existing);
  }

  return grouped;
}

/**
 * Convert TransitionRow to TransitionDef for type-safe planning.
 */
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
