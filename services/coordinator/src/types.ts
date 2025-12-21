/**
 * Coordinator Type Definitions
 *
 * Core types for coordinator operation:
 * - Domain types (TokenStatus, WorkflowStatus)
 * - ContextSnapshot: Read-only context for decision logic
 * - TaskResult: Executor response
 * - Decision: Pure data describing state changes
 * - Transition config types for synchronization
 * - Planning result types
 * - Dispatch types
 */

import type { Emitter, TraceEventInput } from '@wonder/events';
import type { Logger } from '@wonder/logs';

// ============================================================================
// Domain Status Types
// ============================================================================

/**
 * Token Status
 */
export type TokenStatus =
  | 'pending'
  | 'dispatched'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'waiting_for_siblings';

/**
 * Workflow Status
 */
export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled';

// ============================================================================
// Token Operation Types
// ============================================================================

/** Parameters for creating a new token */
export type CreateTokenParams = {
  workflowRunId: string;
  nodeId: string;
  parentTokenId: string | null;
  pathId: string;
  siblingGroup: string | null;
  branchIndex: number;
  branchTotal: number;
  iterationCounts: Record<string, number> | null;
};

/** Sibling count breakdown for synchronization checks */
export type SiblingCounts = {
  total: number;
  completed: number;
  failed: number;
  waiting: number;
  terminal: number; // completed + failed + timed_out + cancelled
};

// ============================================================================
// Planning Result Types
// ============================================================================

/** Result from planning functions - decisions to apply and events to emit */
export type PlanningResult = {
  decisions: Decision[];
  events: TraceEventInput[];
};

/** Result from completion planning */
export type CompletionResult = {
  output: Record<string, unknown>;
  events: TraceEventInput[];
};

// ============================================================================
// Merge Types
// ============================================================================

export type MergeStrategy = 'append' | 'collect' | 'merge_object' | 'keyed_by_branch' | 'last_wins';

/** Branch output with metadata */
export type BranchOutput = {
  tokenId: string;
  branchIndex: number;
  output: unknown;
};

// ============================================================================
// Dispatch Types
// ============================================================================

/** Dependencies required to apply decisions and orchestrate workflow */
export type DispatchContext = {
  tokens: TokenManager;
  context: ContextManager;
  defs: DefinitionManager;
  emitter: Emitter;
  logger: Logger;
  workflowRunId: string;
  /** Resource service for fetching TaskDefs */
  resources: Env['RESOURCES'];
  /** Executor service for dispatching tasks */
  executor: Env['EXECUTOR'];
  /** Register background work (fire-and-forget) */
  waitUntil: (promise: Promise<unknown>) => void;
  /** Schedule timeout alarm for sync points */
  scheduleTimeoutAlarm: (timeoutMs: number) => Promise<void>;
};

/** Result of applying decisions */
export type ApplyResult = {
  applied: number;
  tokensCreated: string[];
  tokensDispatched: string[];
  errors: Array<{ decision: Decision; error: Error }>;
};

/** Task error result from executor */
export type TaskErrorResult = {
  error: {
    type: 'step_failure' | 'task_timeout' | 'validation_error';
    stepRef?: string;
    message: string;
    retryable: boolean;
  };
  metrics: {
    durationMs: number;
    stepsExecuted: number;
  };
};

// Forward declarations for manager types (to avoid circular imports)
import type { ContextManager } from './operations/context';
import type { DefinitionManager } from './operations/defs';
import type { TokenManager } from './operations/tokens';

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
  outputData: Record<string, unknown>;
};

// ============================================================================
// Transition Configuration Types (from workflow definition)
// ============================================================================

// Import and re-export types from resources (single source of truth)
import type {
  Condition,
  ForeachConfig,
  LoopConfig,
  MergeConfig,
  SynchronizationConfig,
  Transition,
} from '@wonder/resources/types';

export type {
  Condition,
  ForeachConfig,
  LoopConfig,
  MergeConfig,
  SynchronizationConfig,
  Transition,
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
  | { type: 'CHECK_SYNCHRONIZATION'; tokenId: string; transition: Transition }
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
