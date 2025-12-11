/**
 * Coordinator Type Definitions
 */

import type { JSONSchema } from '@wonder/context';

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
 * Workflow definition (simplified for Chunk 1)
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
