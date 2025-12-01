/**
 * Coordinator Types
 *
 * Type definitions for workflow coordination including context management,
 * token lifecycle, and branch tracking.
 */

import type { SchemaType } from '@wonder/schema';

/** Context schema definition for a workflow run */
export type ContextSchema = {
  /** Schema version - locked at workflow start, no migrations during run */
  version: string;
  /** Root schema for context.state - must be type: 'object' */
  schema: SchemaType;
  /** DDL generation options */
  options?: {
    /** How to handle nested objects: 'flatten' (dot notation) or 'json' */
    nestedObjectStrategy?: 'flatten' | 'json';
    /** How to handle arrays: 'table' (separate tables) or 'json' */
    arrayStrategy?: 'table' | 'json';
  };
};

/** Merge strategy for fan-in synchronization */
export type MergeStrategy = 'collect' | 'first' | 'reduce' | 'custom';

/** Branch tracking for fan-out/fan-in */
export type Branch = {
  /** Branch index (0-based) */
  index: number;
  /** Total number of branches from this fan-out */
  total: number;
  /** Node ID that created this branch */
  fan_out_node_id: string;
  /** Token ID executing this branch */
  token_id: string;
  /** Branch output (written by output_mapping) - stored as JSON */
  output: Record<string, unknown> | null;
  /** When the branch was created */
  created_at: string;
  /** When the branch completed (reached fan-in) */
  completed_at: string | null;
};

/** Configuration for branch merge at fan-in */
export type BranchMergeConfig = {
  /** Target path in context.state to write merged result */
  target: string;
  /** Merge strategy to apply */
  strategy: MergeStrategy;
  /** For 'reduce' strategy: custom reduce function */
  reduceFn?: (acc: unknown, current: unknown, index: number) => unknown;
  /** For 'custom' strategy: custom merge function */
  customMergeFn?: (branches: Branch[]) => unknown;
};

/** Context query operation result */
export type QueryResult = {
  /** Whether the query succeeded */
  success: boolean;
  /** Retrieved value (if successful) */
  value?: unknown;
  /** Error message (if failed) */
  error?: string;
};

/** Context update operation result */
export type UpdateResult = {
  /** Whether the update succeeded */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
};

/** Branch merge operation result */
export type MergeResult = {
  /** Whether the merge succeeded */
  success: boolean;
  /** Merged value written to context */
  value?: unknown;
  /** Error message (if failed) */
  error?: string;
};

/** Token position in workflow graph during execution */
export type Token = {
  /** Unique token ID */
  id: string;
  /** Workflow run this token belongs to */
  workflow_run_id: string;
  /** Current node the token is at */
  node_id: string;
  /** Token execution status */
  status: 'active' | 'waiting_at_fan_in' | 'completed' | 'cancelled';
  /** Path ID for tracking execution path */
  path_id: string;
  /** Parent token ID (for fan-out branches) */
  parent_token_id: string | null;
  /** Node ID that created this token via fan-out */
  fan_out_node_id: string | null;
  /** Branch index (0-based) if part of fan-out */
  branch_index: number;
  /** Total branches in fan-out group */
  branch_total: number;
  /** When the token was created */
  created_at: string;
  /** When the token was last updated */
  updated_at: string;
};

/** New token data (omits generated fields) */
export type NewToken = Omit<
  Token,
  /** Auto-generated unique identifier */
  | 'id'
  /** Auto-generated creation timestamp */
  | 'created_at'
  /** Auto-generated update timestamp */
  | 'updated_at'
>;

/** Token schema for @wonder/schema DDL generation */
export const TOKEN_SCHEMA: SchemaType = {
  type: 'object',
  properties: {
    /** Unique token ID */
    id: { type: 'string' },
    /** Workflow run this token belongs to */
    workflow_run_id: { type: 'string' },
    /** Current node the token is at */
    node_id: { type: 'string' },
    /** Token execution status */
    status: {
      type: 'string',
      enum: ['active', 'waiting_at_fan_in', 'completed', 'cancelled'],
    },
    /** Path ID for tracking execution path */
    path_id: { type: 'string' },
    /** Parent token ID (for fan-out branches) */
    parent_token_id: { type: 'string', nullable: true },
    /** Node ID that created this token via fan-out */
    fan_out_node_id: { type: 'string', nullable: true },
    /** Branch index (0-based) if part of fan-out */
    branch_index: { type: 'integer' },
    /** Total branches in fan-out group */
    branch_total: { type: 'integer' },
    /** When the token was created */
    created_at: { type: 'string' },
    /** When the token was last updated */
    updated_at: { type: 'string' },
  },
  required: [
    'id',
    'workflow_run_id',
    'node_id',
    'status',
    'path_id',
    'branch_index',
    'branch_total',
    'created_at',
    'updated_at',
  ],
};

/** Task sent from coordinator to executor via queue */
export type WorkflowTask = {
  /** Unique task ID for idempotency and tracking */
  task_id: string;
  /** Workflow run this task belongs to */
  workflow_run_id: string;
  /** Token executing this task */
  token_id: string;
  /** Node to execute */
  node_id: string;
  /** Input data for this task (context snapshot) */
  input_data: Record<string, unknown>;
  /** Branch context if part of fan-out */
  branch?: {
    id: string;
    index: number;
    total: number;
  };
  /** Number of retry attempts */
  retry_count: number;
  /** When the task was created */
  created_at: string;
};

/** Task result sent from executor back to coordinator via queue */
export type TaskResult = {
  /** Task ID this result is for */
  task_id: string;
  /** Workflow run this task belongs to */
  workflow_run_id: string;
  /** Token that executed this task */
  token_id: string;
  /** Node that was executed */
  node_id: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Output data from the task (to be merged into context) */
  output_data?: Record<string, unknown>;
  /** Error information if task failed */
  error?: {
    message: string;
    code?: string;
    retryable?: boolean;
  };
  /** When the task completed */
  completed_at: string;
};
