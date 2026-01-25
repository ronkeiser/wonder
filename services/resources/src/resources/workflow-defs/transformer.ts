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
import type { TransitionInput, WorkflowDefInput } from './types';

// ============================================================================
// Types (inferred from schema)
// ============================================================================

/** Transformed node ready for database insertion (inferred from schema) */
export type TransformedNode = Omit<typeof nodes.$inferInsert, 'definitionId' | 'definitionVersion'>;

/** Transformed transition ready for database insertion (inferred from schema) */
export type TransformedTransition = Omit<typeof transitions.$inferInsert, 'definitionId' | 'definitionVersion'>;

/** Result of transformation */
export type TransformResult = {
  definitionId: string;
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
  const definitionId = ulid();

  // Add IDs to nodes
  const transformedNodes = data.nodes.map((node) => ({ id: ulid(), ...node }));

  // Build ref→id map
  const nodeIdByRef: Record<string, string> = {};
  for (const node of transformedNodes) {
    nodeIdByRef[node.ref] = node.id;
  }

  // Transform transitions (resolve refs to IDs, parse conditions)
  const transformedTransitions = (data.transitions ?? []).map((transition) =>
    transformTransition(transition, nodeIdByRef),
  );

  return {
    definitionId,
    initialNodeId: nodeIdByRef[data.initialNodeRef],
    nodes: transformedNodes,
    transitions: transformedTransitions,
  };
}

/**
 * Transforms a single transition from input format to database format.
 * Resolves refs to IDs, parses condition strings into ASTs.
 */
function transformTransition(
  transition: TransitionInput,
  nodeIdByRef: Record<string, string>,
): TransformedTransition {
  const { fromNodeRef, toNodeRef, condition, synchronization, ...rest } = transition;
  return {
    id: ulid(),
    ...rest,
    fromNodeId: nodeIdByRef[fromNodeRef],
    toNodeId: nodeIdByRef[toNodeRef],
    condition: condition ? parse(condition) : undefined,
    synchronization: transformSynchronization(synchronization),
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