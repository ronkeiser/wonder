/** Execution domain entities & value objects */

import type { workflow_runs } from '~/infrastructure/db/schema';

/** Token represents a position in the workflow graph during execution */
export type Token = {
  id: string;
  workflow_run_id: string;
  node_id: string;
  status: 'active' | 'waiting_at_fan_in' | 'completed' | 'cancelled';
  path_id: string;
  parent_token_id: string | null;
  fan_out_node_id: string | null;
  branch_index: number;
  branch_total: number;
  created_at: string;
  updated_at: string;
};

export type NewToken = Omit<Token, 'id' | 'created_at' | 'updated_at'>;

/** Context carries state through workflow execution */
export type Context = {
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  output?: Record<string, unknown>;
  artifacts: Record<string, string>;
  _branch?: BranchContext;
};

/** BranchContext is present during fan-out execution for isolated branch state */
export type BranchContext = {
  id: string;
  index: number;
  total: number;
  fan_out_node_id: string;
  output: Record<string, unknown>;
  parent?: BranchContext;
};

/** WorkflowRun represents an instance of a workflow execution */
export type WorkflowRun = typeof workflow_runs.$inferSelect;
export type NewWorkflowRun = Omit<
  typeof workflow_runs.$inferInsert,
  'id' | 'created_at' | 'updated_at'
>;

/** WorkflowRunStatus tracks the current state of a workflow run */
export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'waiting';

/** Snapshot enables fast state recovery without replaying full event log */
export type Snapshot = {
  after_sequence_number: number;
  context: Context;
  tokens: Token[];
  created_at: string;
};

/** Schema types for @wonder/schema DDL/DML generation */
import type { SchemaType } from '@wonder/schema';

/** Token table schema for SQLite storage in DO */
export const tokenSchemaType: SchemaType = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    workflow_run_id: { type: 'string' },
    node_id: { type: 'string' },
    status: { type: 'string' },
    path_id: { type: 'string' },
    parent_token_id: { type: 'string', nullable: true },
    fan_out_node_id: { type: 'string', nullable: true },
    branch_index: { type: 'number' },
    branch_total: { type: 'number' },
    created_at: { type: 'string' },
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

/** Event table schema for SQLite storage in DO */
export const eventSchemaType: SchemaType = {
  type: 'object',
  properties: {
    sequence_number: { type: 'number' },
    kind: { type: 'string' },
    payload: { type: 'string' }, // JSON string
    timestamp: { type: 'string' },
  },
  required: ['sequence_number', 'kind', 'payload', 'timestamp'],
};

/** Re-export event types from events domain */
export type { Event, EventKind } from '../events/types';

/** Task sent from DO to Worker via Queue */
export interface WorkflowTask {
  /** Unique task ID for idempotency and tracking */
  task_id: string;

  /** Workflow run this task belongs to */
  workflow_run_id: string;

  /** Token executing this task */
  token_id: string;

  /** Node to execute */
  node_id: string;

  /** Action to perform */
  action_id: string;

  /** Action kind (determines execution path) */
  action_kind:
    | 'llm_call'
    | 'mcp_tool'
    | 'http_request'
    | 'human_input'
    | 'update_context'
    | 'write_artifact'
    | 'workflow_call'
    | 'vector_search'
    | 'emit_metric';

  /** Action implementation details (discriminated by action_kind) */
  action_implementation: Record<string, unknown>;

  /** Input data for this task (after input_mapping applied) */
  input_data: Record<string, unknown>;

  /** Full workflow context at time of task creation (for input_mapping) */
  context: Context;

  /** Durable Object ID for sending result back */
  durable_object_id: string;

  /** Timestamp when task was enqueued */
  enqueued_at: string;
}

/** Result returned from Worker to DO after task execution */
export interface WorkflowTaskResult {
  /** Original task ID for correlation */
  task_id: string;

  /** Token that executed this task */
  token_id: string;

  /** Execution status */
  status: 'success' | 'failure';

  /** Output data from action execution (staged for merge) */
  output_data?: Record<string, unknown>;

  /** Error details if status === 'failure' */
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
  };

  /** Timestamp when task completed */
  completed_at: string;
}
