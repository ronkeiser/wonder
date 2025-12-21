/**
 * Transformation functions for workflow definition data.
 *
 * Transforms ref-based input data into ID-based database data.
 * All refs are resolved to IDs at this boundary.
 * Expression strings are parsed into ASTs at this boundary.
 */

import { parse } from '@wonder/expressions';
import { ulid } from 'ulid';
import { nodes, transitions } from '../../schema';
import type { SynchronizationConfig } from '../../schema/types';
import type { NodeInput, TransitionInput, WorkflowDefInput } from './types';

// ============================================================================
// Types (inferred from schema)
// ============================================================================

/** Transformed node ready for database insertion (inferred from schema) */
export type TransformedNode = Omit<typeof nodes.$inferInsert, 'workflowDefId' | 'workflowDefVersion'>;

/** Transformed transition ready for database insertion (inferred from schema) */
export type TransformedTransition = Omit<typeof transitions.$inferInsert, 'workflowDefId' | 'workflowDefVersion'>;

/** Result of transformation */
export type TransformResult = {
  workflowDefId: string;
  initialNodeId: string;
  nodes: TransformedNode[];
  transitions: TransformedTransition[];
};

// ============================================================================
// Transformation
// ============================================================================

/**
 * Transforms workflow definition input into database-ready format.
 *
 * Single-pass transformation:
 * 1. Generate workflow def ID
 * 2. Transform nodes (generating IDs inline)
 * 3. Build ref→id mapping from transformed nodes
 * 4. Transform transitions using that mapping
 */
export function transformWorkflowDef(data: WorkflowDefInput): TransformResult {
  const workflowDefId = ulid();

  // Transform nodes with inline ID generation
  const transformedNodes = data.nodes.map((node) => transformNode(node));

  // Build ref→id map from transformed nodes (guaranteed complete since we just built it)
  const nodeIdByRef: Record<string, string> = {};
  for (const node of transformedNodes) {
    nodeIdByRef[node.ref] = node.id;
  }

  // Transform transitions using the map
  const transformedTransitions = (data.transitions ?? []).map((transition) =>
    transformTransition(transition, nodeIdByRef),
  );

  return {
    workflowDefId,
    initialNodeId: nodeIdByRef[data.initialNodeRef],
    nodes: transformedNodes,
    transitions: transformedTransitions,
  };
}

/**
 * Transforms a single node from input format to database format.
 */
function transformNode(node: NodeInput): TransformedNode {
  return {
    id: ulid(),
    ref: node.ref,
    name: node.name,
    taskId: node.taskId,
    taskVersion: node.taskVersion,
    inputMapping: node.inputMapping,
    outputMapping: node.outputMapping,
    resourceBindings: node.resourceBindings,
  };
}

/**
 * Transforms a single transition from input format to database format.
 * Parses condition expression strings into ASTs.
 */
function transformTransition(
  transition: TransitionInput,
  nodeIdByRef: Record<string, string>,
): TransformedTransition {
  return {
    id: ulid(),
    ref: transition.ref,
    fromNodeId: nodeIdByRef[transition.fromNodeRef],
    toNodeId: nodeIdByRef[transition.toNodeRef],
    priority: transition.priority,
    condition: transition.condition ? parse(transition.condition) : undefined,
    spawnCount: transition.spawnCount,
    siblingGroup: transition.siblingGroup,
    foreach: transition.foreach,
    synchronization: transformSynchronization(transition.synchronization),
    loopConfig: transition.loopConfig,
  };
}

/**
 * Transforms synchronization config.
 * Strategy is parsed from string format into typed format.
 */
function transformSynchronization(
  sync: TransitionInput['synchronization'],
): SynchronizationConfig | undefined {
  if (!sync) {
    return undefined;
  }

  return {
    strategy: parseStrategy(sync.strategy),
    siblingGroup: sync.siblingGroup,
    merge: sync.merge,
    timeoutMs: sync.timeoutMs,
    onTimeout: sync.onTimeout,
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
function parseStrategy(strategy: string): SynchronizationConfig['strategy'] {
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