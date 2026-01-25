/** Type definitions for workflow definitions */

import { nodes, transitions } from '../../schema';
import type { MergeConfig } from '../../schema/types';

// Re-export schema types for convenience
export type {
  Condition,
  ForeachConfig,
  LoopConfig,
  MergeConfig,
  SynchronizationConfig,
} from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Node entity - inferred from database schema */
export type Node = typeof nodes.$inferSelect;

/** Transition entity - inferred from database schema */
export type Transition = typeof transitions.$inferSelect;

// ============================================================================
// Input Types (for API layer)
// ============================================================================

/**
 * Input for creating a workflow def.
 * Uses refs instead of IDs, includes nested entities.
 */
export type WorkflowDefInput = {
  name: string;
  description?: string;
  reference?: string;
  projectId?: string | null;
  libraryId?: string | null;
  tags?: string[] | null;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  outputMapping?: Record<string, unknown> | null;
  contextSchema?: Record<string, unknown> | null;
  initialNodeRef: string;
  nodes: NodeInput[];
  transitions?: TransitionInput[];
  autoversion?: boolean;
};

/** Node input - uses ref instead of id, omits definition FK fields */
export type NodeInput = Omit<typeof nodes.$inferInsert, 'id' | 'definitionId' | 'definitionVersion'> & {
  ref: string;
};

/**
 * Synchronization input - strategy is a string that gets parsed to typed format.
 * This differs from SynchronizationConfig which has the parsed strategy type.
 */
export type SynchronizationInput = {
  strategy: string; // "any", "all", or "m_of_n:N" - gets parsed to typed format
  siblingGroup: string;
  merge?: MergeConfig;
  timeoutMs?: number;
  onTimeout?: 'proceed_with_available' | 'fail';
};

/** Transition input - uses refs instead of IDs, condition is a string to be parsed */
export type TransitionInput = Omit<
  typeof transitions.$inferInsert,
  'id' | 'definitionId' | 'definitionVersion' | 'fromNodeId' | 'toNodeId' | 'condition' | 'synchronization'
> & {
  ref?: string;
  fromNodeRef: string;
  toNodeRef: string;
  condition?: string; // Expression string (e.g., "state.score >= 80") - gets parsed to AST
  synchronization?: SynchronizationInput;
};

// ============================================================================
// WorkflowDef Entity Type (API-facing shape)
// ============================================================================

/**
 * WorkflowDef entity - the API-facing shape.
 * Internally stored in the unified `definitions` table.
 */
export type WorkflowDef = {
  id: string;
  version: number;
  name: string;
  description: string;
  reference: string;
  projectId: string | null;
  libraryId: string | null;
  tags: string[] | null;
  inputSchema: object;
  outputSchema: object;
  outputMapping: object | null;
  contextSchema: object | null;
  initialNodeId: string | null;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};
