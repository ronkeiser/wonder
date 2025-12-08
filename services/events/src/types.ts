// services/events/src/types.ts

/**
 * Workflow event types for execution tracking
 */
export type EventType =
  // Workflow lifecycle
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_failed'
  // Node execution
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  // Parallelism
  | 'token_spawned'
  | 'token_merged'
  | 'token_cancelled'
  | 'fan_out_triggered'
  | 'fan_in_complete'
  // Sub-workflows
  | 'subworkflow_started'
  | 'subworkflow_completed'
  | 'subworkflow_failed'
  // Actions
  | 'llm_call_started'
  | 'llm_call_completed'
  | 'llm_call_failed'
  | 'transition_evaluated'
  | 'context_updated'
  | 'artifact_created';

/**
 * Context required for emitting events - provided by coordinator
 */
export interface EventContext {
  workflow_run_id: string;
  workspace_id: string;
  project_id: string;
  workflow_def_id: string;
  parent_run_id?: string;
}

/**
 * Input for emitting an event - caller provides event data
 */
export interface EventInput {
  event_type: EventType | string; // Allow custom event types
  sequence_number?: number;
  node_id?: string;
  token_id?: string;
  path_id?: string;
  tokens?: number; // For LLM calls
  cost_usd?: number; // For LLM calls
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Complete event entry as stored in D1
 */
export interface EventEntry extends EventContext, Omit<EventInput, 'metadata'> {
  id: string;
  timestamp: number;
  sequence_number: number;
  metadata: string; // JSON string
}

/**
 * Options for querying events
 */
export interface GetEventsOptions {
  workflow_run_id?: string;
  parent_run_id?: string;
  workspace_id?: string;
  project_id?: string;
  event_type?: string;
  node_id?: string;
  token_id?: string;
  limit?: number;
  after_sequence?: number; // For replay from checkpoint
}

/**
 * Universal event emitter - accepts context on each emit call
 */
export interface Emitter {
  emit: (context: EventContext, input: EventInput) => void;
}
