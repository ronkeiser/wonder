/** Type definitions for workflow definitions */

import { nodes, transitions, workflowDefs } from '../../schema';
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

/** WorkflowDef entity — inferred from database schema. */
export type WorkflowDef = typeof workflowDefs.$inferSelect;

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
  force?: boolean;
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

