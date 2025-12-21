/**
 * Transformation functions for workflow definition data.
 *
 * Transforms ref-based input data into ID-based database data.
 * All refs are resolved to IDs at this boundary.
 * Expression strings are parsed into ASTs at this boundary.
 */

import { parse, type Expression } from '@wonder/expressions';
import { ulid } from 'ulid';
import type { NodeInput, TransitionInput, WorkflowDefInput } from './validator';

/** Pre-generated IDs for all entities */
export type GeneratedIds = {
  workflowDefId: string;
  nodeIds: Map<string, string>; // ref → id
  transitionIds: Map<string, string>; // ref → id (for transitions with refs)
};

/** Transformed node ready for database insertion */
export type TransformedNode = {
  id: string;
  ref: string;
  name: string;
  taskId: string | null;
  taskVersion: number | null;
  inputMapping: object | null;
  outputMapping: object | null;
  resourceBindings: Record<string, string> | null;
};

/** Strategy type after parsing - 'any', 'all', or m_of_n quorum */
export type SynchronizationStrategy = 'any' | 'all' | { mOfN: number };

/** Transformed transition ready for database insertion */
export type TransformedTransition = {
  id: string;
  ref: string | null;
  fromNodeId: string;
  toNodeId: string;
  priority: number;
  condition: Expression | null; // Parsed AST from expression string
  spawnCount: number | null;
  siblingGroup: string | null; // Named sibling group for fan-in coordination
  foreach: object | null;
  synchronization: {
    strategy: SynchronizationStrategy;
    siblingGroup: string; // Must reference a declared siblingGroup
    merge?: object;
  } | null;
  loopConfig: object | null;
};

/** Result of transformation */
export type TransformResult = {
  ids: GeneratedIds;
  initialNodeId: string;
  nodes: TransformedNode[];
  transitions: TransformedTransition[];
};

/**
 * Pre-generates all IDs and builds ref→ID maps.
 * This must be called before any database operations so we know all IDs upfront.
 */
export function generateIds(data: WorkflowDefInput): GeneratedIds {
  const workflowDefId = ulid();

  // Generate node IDs
  const nodeIds = new Map<string, string>();
  for (const node of data.nodes) {
    nodeIds.set(node.ref, ulid());
  }

  // Generate transition IDs
  // IMPORTANT: We need to map ALL transitions by ref, not just ones with refs,
  // because synchronization.siblingGroup references transitions by ref
  const transitionIds = new Map<string, string>();
  for (const transition of data.transitions ?? []) {
    if (transition.ref) {
      transitionIds.set(transition.ref, ulid());
    }
  }

  return { workflowDefId, nodeIds, transitionIds };
}

/**
 * Transforms all ref-based input data into ID-based data.
 * All refs are resolved to IDs at this boundary.
 */
export function transformWorkflowDef(data: WorkflowDefInput, ids: GeneratedIds): TransformResult {
  const initialNodeId = ids.nodeIds.get(data.initialNodeRef)!;

  const nodes = transformNodes(data.nodes, ids.nodeIds);
  const transitions = transformTransitions(data.transitions ?? [], ids);

  return {
    ids,
    initialNodeId,
    nodes,
    transitions,
  };
}

/**
 * Transforms nodes from input format to database format.
 */
function transformNodes(nodes: NodeInput[], nodeIds: Map<string, string>): TransformedNode[] {
  return nodes.map((node) => ({
    id: nodeIds.get(node.ref)!,
    ref: node.ref,
    name: node.name,
    taskId: node.taskId ?? null,
    taskVersion: node.taskVersion ?? null,
    inputMapping: node.inputMapping ?? null,
    outputMapping: node.outputMapping ?? null,
    resourceBindings: node.resourceBindings ?? null,
  }));
}

/**
 * Transforms transitions from input format to database format.
 * Parses condition expression strings into ASTs.
 */
function transformTransitions(
  transitions: TransitionInput[],
  ids: GeneratedIds,
): TransformedTransition[] {
  return transitions.map((transition) => {
    // Get or generate the transition ID
    const transitionId = transition.ref ? ids.transitionIds.get(transition.ref)! : ulid();

    // Parse condition string into AST (throws on syntax error)
    const condition = transition.condition ? parse(transition.condition) : null;

    return {
      id: transitionId,
      ref: transition.ref ?? null,
      fromNodeId: ids.nodeIds.get(transition.fromNodeRef)!,
      toNodeId: ids.nodeIds.get(transition.toNodeRef)!,
      priority: transition.priority,
      condition,
      spawnCount: transition.spawnCount ?? null,
      siblingGroup: transition.siblingGroup ?? null,
      foreach: transition.foreach ?? null,
      synchronization: transformSynchronization(transition.synchronization),
      loopConfig: transition.loopConfig ?? null,
    };
  });
}

/**
 * Transforms synchronization config.
 * siblingGroup is passed through as-is - it's a string identifier declared on transitions.
 * Strategy is parsed from string format into typed format.
 */
function transformSynchronization(
  sync: TransitionInput['synchronization'],
): TransformedTransition['synchronization'] {
  if (!sync) {
    return null;
  }

  return {
    strategy: parseStrategy(sync.strategy),
    siblingGroup: sync.siblingGroup,
    merge: sync.merge,
  };
}

/**
 * Parse strategy string into typed format.
 *
 * Formats:
 * - "any" → "any"
 * - "all" → "all"
 * - "m_of_n:N" → { mOfN: N } (e.g., "m_of_n:2" → { mOfN: 2 })
 */
function parseStrategy(strategy: string): SynchronizationStrategy {
  if (strategy === 'any' || strategy === 'all') {
    return strategy;
  }

  // Parse m_of_n:N format
  const match = strategy.match(/^m_of_n:(\d+)$/);
  if (match) {
    const n = parseInt(match[1], 10);
    return { mOfN: n };
  }

  // Invalid strategy - should be caught by validator, but provide fallback
  throw new Error(`Invalid synchronization strategy: ${strategy}`);
}
