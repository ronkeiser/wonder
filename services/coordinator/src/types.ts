/**
 * Coordinator Type Definitions
 */

import type { JSONSchema } from '@wonder/context';

/**
 * Workflow run metadata
 */
export type WorkflowRun = {
  id: string;
  project_id: string;
  workspace_id: string;
  workflow_id: string;
  workflow_def_id: string;
  workflow_version: number;
  status: string;
  context: object;
  active_tokens: object[];
  durable_object_id: string;
  parent_run_id: string | null;
  parent_node_id: string | null;
  latest_snapshot: object | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

/**
 * Token represents a position in the workflow graph
 */
export type TokenRow = {
  id: string;
  workflow_run_id: string;
  node_id: string;
  status: TokenStatus;
  parent_token_id: string | null;
  path_id: string;
  fan_out_transition_id: string | null;
  branch_index: number;
  branch_total: number;
  created_at: number;
  updated_at: number;
};

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
 * Parameters for creating a new token
 */
export type CreateTokenParams = {
  workflow_run_id: string;
  node_id: string;
  parent_token_id: string | null;
  path_id: string;
  fan_out_transition_id: string | null;
  branch_index: number;
  branch_total: number;
};

/**
 * Context snapshot for read-only access by decision logic
 */
export type ContextSnapshot = {
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  output: Record<string, unknown>;
};

/**
 * Workflow definition
 * TODO: Add nodes, transitions, and graph structure fields
 */
export type WorkflowDef = {
  id: string;
  version: number;
  initial_node_id: string;
  input_schema: JSONSchema;
  context_schema?: JSONSchema;
  output_schema: JSONSchema;
  output_mapping?: Record<string, string>;
};

/**
 * Task execution result from Executor
 */
export type TaskResult = {
  output_data: Record<string, unknown>;
};
