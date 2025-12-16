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

import type { DecisionEvent } from '@wonder/events';
import type { TransitionRow } from '../operations/defs';
import type { TokenRow } from '../operations/tokens';
import type {
  Condition,
  ContextSnapshot,
  Decision,
  FieldRef,
  ForeachConfig,
  Literal,
  MergeConfig,
  SynchronizationConfig,
  TransitionDef,
} from '../types';

/** Result from planning functions - decisions to apply and events to emit */
export type PlanningResult = {
  decisions: Decision[];
  events: DecisionEvent[];
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

  const events: DecisionEvent[] = [];
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
        transition_id: t.id,
        condition: t.condition,
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
      decisions: [],
    });
    return { decisions: [], events };
  }

  // Generate CREATE_TOKEN decisions for each match
  for (const transition of matchedTransitions) {
    const spawnCount = determineSpawnCount(transition, context);

    // Determine if this creates a new sibling group or inherits parent's
    const isNewFanOut = spawnCount > 1;
    const fanOutTransitionId = isNewFanOut ? transition.id : completedToken.fan_out_transition_id;
    const branchTotal = isNewFanOut ? spawnCount : completedToken.branch_total;

    // Emit transition matched event
    events.push({
      type: 'decision.routing.transition_matched',
      transition_id: transition.id,
      spawn_count: spawnCount,
    });

    for (let i = 0; i < spawnCount; i++) {
      const pathId = buildPathId(completedTokenPath, nodeId, i, spawnCount);

      decisions.push({
        type: 'CREATE_TOKEN',
        params: {
          workflow_run_id: workflowRunId,
          node_id: transition.to_node_id,
          parent_token_id: completedTokenId,
          path_id: pathId,
          fan_out_transition_id: fanOutTransitionId,
          branch_index: i,
          branch_total: branchTotal,
        },
      });
    }
  }

  // Emit routing complete event
  events.push({
    type: 'decision.routing.complete',
    decisions,
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
    foreach: row.foreach as ForeachConfig | null,
    synchronization: row.synchronization as SynchronizationConfig | null,
  };
}

/**
 * Extract merge config from transition synchronization.
 * Useful for dispatch layer when merging branches.
 */
export function getMergeConfig(transition: TransitionDef): MergeConfig | null {
  return transition.synchronization?.merge ?? null;
}
