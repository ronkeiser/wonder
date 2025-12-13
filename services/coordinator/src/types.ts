/**
 * Coordinator Type Definitions
 *
 * Core types for coordinator operation:
 * - ContextSnapshot: Read-only context for decision logic
 * - TaskResult: Executor response
 * - Decision: Pure data describing state changes
 * - Transition config types for synchronization
 */

import type { CreateTokenParams } from './operations/tokens.js';
import type { TokenStatus } from './schemas.js';

// ============================================================================
// Context Types
// ============================================================================

/**
 * Context snapshot for read-only access by decision logic
 */
export type ContextSnapshot = {
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  output: Record<string, unknown>;
};

/**
 * Task execution result from Executor
 */
export type TaskResult = {
  output_data: Record<string, unknown>;
};

// ============================================================================
// Transition Configuration Types (from workflow definition)
// ============================================================================

/**
 * Condition for transition evaluation
 * Structured conditions support type-safe evaluation
 */
export type Condition =
  | {
      type: 'comparison';
      left: FieldRef | Literal;
      operator: ComparisonOperator;
      right: FieldRef | Literal;
    }
  | { type: 'exists'; field: FieldRef }
  | { type: 'in_set'; field: FieldRef; values: unknown[] }
  | { type: 'array_length'; field: FieldRef; operator: ComparisonOperator; value: number }
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] }
  | { type: 'not'; condition: Condition }
  | { type: 'cel'; expression: string }; // CEL fallback for complex logic

export type FieldRef = { field: string }; // e.g., { field: 'state.score' }
export type Literal = { literal: unknown }; // e.g., { literal: 80 }
export type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

/**
 * Foreach configuration for dynamic iteration
 */
export type ForeachConfig = {
  collection: string; // Path to array in context (e.g., 'input.judges')
  item_var: string; // Variable name for each item
};

/**
 * Synchronization configuration for fan-in
 */
export type SynchronizationConfig = {
  strategy: 'any' | 'all' | { m_of_n: number };
  sibling_group: string; // fan_out_transition_id to synchronize on
  timeout_ms?: number | null; // Max wait time (null = no timeout)
  on_timeout?: 'proceed_with_available' | 'fail';
  merge?: MergeConfig;
};

/**
 * Merge configuration for combining branch outputs
 */
export type MergeConfig = {
  source: string; // Path in branch output (e.g., '_branch.output', '_branch.output.choice')
  target: string; // Where to write merged result (e.g., 'state.votes')
  strategy: 'append' | 'merge_object' | 'keyed_by_branch' | 'last_wins';
};

/**
 * Transition definition (subset of schema for planning)
 */
export type TransitionDef = {
  id: string;
  ref?: string | null;
  from_node_id: string;
  to_node_id: string;
  priority: number;
  condition?: Condition | null;
  spawn_count?: number | null;
  foreach?: ForeachConfig | null;
  synchronization?: SynchronizationConfig | null;
};

// ============================================================================
// Decision Types (Pure data for state changes)
// ============================================================================

/**
 * Decisions are pure data describing state changes.
 * Planning modules return Decision[], dispatch converts to operations.
 *
 * This separation enables:
 * - Testability: Decision logic tested without actors/SQL/RPC
 * - Debuggability: Decisions are data - log, replay, inspect
 * - Performance: Batch/optimize execution without touching business logic
 */
export type Decision =
  // Token operations
  | { type: 'CREATE_TOKEN'; params: CreateTokenParams }
  | { type: 'UPDATE_TOKEN_STATUS'; tokenId: string; status: TokenStatus }
  | { type: 'MARK_WAITING'; tokenId: string; arrivedAt: Date }
  | { type: 'MARK_FOR_DISPATCH'; tokenId: string }

  // Context operations
  | { type: 'SET_CONTEXT'; path: string; value: unknown }
  | { type: 'APPLY_OUTPUT'; path: string; output: Record<string, unknown> }

  // Branch storage operations
  | { type: 'INIT_BRANCH_TABLE'; tokenId: string; outputSchema: object }
  | { type: 'APPLY_BRANCH_OUTPUT'; tokenId: string; output: Record<string, unknown> }
  | {
      type: 'MERGE_BRANCHES';
      tokenIds: string[];
      branchIndices: number[];
      outputSchema: object;
      merge: MergeConfig;
    }
  | { type: 'DROP_BRANCH_TABLES'; tokenIds: string[] }

  // Synchronization (triggers recursive decision generation)
  | { type: 'CHECK_SYNCHRONIZATION'; tokenId: string; transition: TransitionDef }
  | {
      type: 'ACTIVATE_FAN_IN';
      workflowRunId: string;
      nodeId: string;
      fanInPath: string;
      mergedTokenIds: string[];
    }

  // Workflow lifecycle
  | { type: 'COMPLETE_WORKFLOW'; output: Record<string, unknown> }
  | { type: 'FAIL_WORKFLOW'; error: string }

  // Batched operations (optimization - created by dispatch/batch.ts)
  | { type: 'BATCH_CREATE_TOKENS'; allParams: CreateTokenParams[] }
  | { type: 'BATCH_UPDATE_STATUS'; updates: Array<{ tokenId: string; status: TokenStatus }> };

/**
 * Decision with metadata for tracing
 */
export type TracedDecision = {
  decision: Decision;
  source: string; // Which planning module produced this
  tokenId?: string; // Related token (if any)
  timestamp: number;
};
