// services/events/src/types.ts

/**
 * Workflow event types for execution tracking
 *
 * Naming convention: category.action (dot notation)
 * - workflow.* - Workflow lifecycle events
 * - task.* - Task execution events
 * - token.* - Token lifecycle events
 * - context.* - Context state changes
 * - fan_out.* / fan_in.* - Parallel execution events
 * - branches.* - Branch merge events
 */
export type EventType =
  // Workflow lifecycle
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  // Task execution
  | 'task.dispatched'
  | 'task.completed'
  | 'task.failed'
  // Token lifecycle
  | 'token.created'
  | 'token.completed'
  | 'token.failed'
  | 'token.waiting'
  // Context updates
  | 'context.updated'
  | 'context.output_applied'
  // Fan-out/Fan-in
  | 'fan_out.started'
  | 'fan_in.completed'
  | 'branches.merged'
  // Sub-workflows
  | 'subworkflow.started'
  | 'subworkflow.completed'
  | 'subworkflow.failed'
  // Actions (LLM calls)
  | 'llm.started'
  | 'llm.completed'
  | 'llm.failed';

/**
 * Context required for emitting events - provided by coordinator
 */
export interface EventContext {
  workflow_run_id: string;
  project_id: string;
  workflow_def_id: string;
  parent_run_id?: string | null;
}

/**
 * Input for emitting an event - caller provides event data
 */
export interface EventInput {
  event_type: EventType | string; // Allow custom event types
  sequence?: number;
  node_id?: string | null;
  token_id?: string | null;
  path_id?: string | null;
  tokens?: number | null; // For LLM calls
  cost_usd?: number | null; // For LLM calls
  message?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Complete event entry as stored in D1
 */
export interface EventEntry extends EventContext, Omit<EventInput, 'metadata'> {
  id: string;
  timestamp: number;
  sequence: number;
  metadata: string; // JSON string
}

/**
 * Event entry with parsed metadata for WebSocket broadcasting
 */
export interface BroadcastEventEntry extends EventContext, EventInput {
  id: string;
  timestamp: number;
  sequence: number;
  metadata: Record<string, unknown>;
}

/**
 * Options for querying events
 */
export interface GetEventsOptions {
  workflow_run_id?: string;
  parent_run_id?: string;
  project_id?: string;
  event_type?: string;
  node_id?: string;
  token_id?: string;
  limit?: number;
  after_sequence?: number; // For replay from checkpoint
}

/**
 * Universal event emitter - context bound at creation
 */
export interface Emitter {
  emit: (event: EventInput) => void;
  emitTrace: (event: TraceEventInput | TraceEventInput[]) => void;
}

/**
 * Trace event types for coordinator execution debugging
 *
 * These events provide line-by-line visibility into coordinator execution:
 * - Decision logic (routing, synchronization)
 * - Operations (context, tokens)
 * - SQL queries and performance
 * - Dispatch layer batching
 */

/**
 * Base trace event input structure
 */
export interface TraceEventInputBase {
  // Ordering & timing (added by emitter)
  sequence?: number;
  timestamp?: number;

  // Execution context
  token_id?: string;
  node_id?: string;

  // Performance tracking
  duration_ms?: number;
}

/**
 * Decision layer events - pure routing and synchronization logic
 */
export type DecisionEvent =
  | {
      type: 'decision.routing.start';
      token_id: string;
      node_id: string;
    }
  | {
      type: 'decision.routing.evaluate_transition';
      transition_id: string;
      condition: unknown;
    }
  | {
      type: 'decision.routing.transition_matched';
      transition_id: string;
      spawn_count: number;
    }
  | {
      type: 'decision.routing.complete';
      decisions: unknown[]; // Decision[] from coordinator
    }
  | {
      type: 'decision.sync.start';
      token_id: string;
      sibling_count: number;
    }
  | {
      type: 'decision.sync.check_condition';
      strategy: string;
      completed: number;
      required: number;
    }
  | {
      type: 'decision.sync.wait';
      reason: string;
    }
  | {
      type: 'decision.sync.activate';
      merge_config: unknown;
    }
  | {
      type: 'decision.sync.sibling_group_check';
      token_fan_out_transition_id: string | null;
      sync_sibling_group: string;
      matches: boolean;
    }
  | {
      type: 'decision.sync.skipped_wrong_sibling_group';
      token_fan_out_transition_id: string | null;
      sync_sibling_group: string;
    }
  // Lifecycle events
  | {
      type: 'decision.lifecycle.start';
      workflow_run_id: string;
      initial_node_id: string;
    }
  | {
      type: 'decision.lifecycle.root_token_planned';
      node_id: string;
    }
  | {
      type: 'decision.sync.continuation';
      workflow_run_id: string;
      node_id: string;
      fan_in_path: string;
    }
  // Completion events
  | {
      type: 'decision.completion.start';
      output_mapping: Record<string, string> | null;
      context_keys: {
        input: string[];
        state: string[];
        output: string[];
      };
    }
  | {
      type: 'decision.completion.no_mapping';
    }
  | {
      type: 'decision.completion.extract';
      target_field: string;
      source_path: string;
      extracted_value: unknown;
    }
  | {
      type: 'decision.completion.complete';
      final_output: Record<string, unknown>;
    };

/**
 * Operation layer events - context, token, and state operations
 */
export type OperationEvent =
  | {
      type: 'operation.context.initialized'; // was: initialize
      has_input_schema: boolean;
      has_context_schema: boolean;
      table_count: number;
      tables_created: string[]; // e.g., ['context_input', 'context_state', 'context_output']
    }
  | {
      type: 'operation.context.validate';
      path: string;
      schema_type: string; // e.g., 'object', 'array', etc.
      valid: boolean;
      error_count: number;
      errors?: string[]; // First few error messages if validation failed
    }
  | {
      type: 'operation.context.read';
      path: string;
      value: unknown;
    }
  | {
      type: 'operation.context.section_replaced'; // was: replace_section
      section: string;
      data: unknown;
    }
  | {
      type: 'operation.context.field_set'; // was: set_field
      path: string;
      value: unknown;
    }
  | {
      type: 'operation.context.snapshot';
      snapshot: {
        input: unknown;
        state: unknown;
        output: unknown;
      };
    }
  | {
      type: 'operation.context.output_mapping.started'; // was: start
      output_mapping: Record<string, string> | null;
      task_output_keys: string[];
    }
  | {
      type: 'operation.context.output_mapping.skipped'; // was: skip
      reason: 'no_mapping';
    }
  | {
      type: 'operation.context.output_mapping.applied'; // was: apply
      target_path: string;
      source_path: string;
      extracted_value: unknown;
    }
  | {
      type: 'operation.context.branch_table.created'; // was: create
      token_id: string;
      table_name: string;
      schema_type: string; // Schema type that drove table creation
    }
  | {
      type: 'operation.context.branch_table.dropped'; // was: drop
      token_ids: string[];
      tables_dropped: number;
    }
  | {
      type: 'operation.context.branch.validate';
      token_id: string;
      valid: boolean;
      error_count: number;
      errors?: string[];
    }
  | {
      type: 'operation.context.branch.written'; // was: write
      token_id: string;
      output: unknown;
    }
  | {
      type: 'operation.context.branches_read'; // was: branch.read_all
      token_ids: string[];
      output_count: number;
    }
  | {
      type: 'operation.context.merge.started'; // was: merge.start
      sibling_count: number;
      strategy: string;
      source_path: string; // e.g., '_branch.output'
      target_path: string; // e.g., 'state.votes'
    }
  | {
      type: 'operation.context.merged'; // was: merge.complete
      target_path: string;
      branch_count: number;
    }
  | {
      type: 'operation.tokens.created'; // was: create
      token_id: string;
      node_id: string;
      task_id: string; // What task this token will execute
      parent_token_id: string | null;
      fan_out_transition_id: string | null;
      branch_index: number;
      branch_total: number;
    }
  | {
      type: 'operation.tokens.status_updated'; // was: update_status
      token_id: string;
      node_id?: string;
      from: string;
      to: string;
    }
  | {
      type: 'operation.metadata.table_init';
      message: string;
    }
  | {
      type: 'operation.metadata.table_init_error';
      message: string;
      error: string;
    }
  | {
      type: 'operation.metadata.cache_hit';
      resource: 'workflow_run' | 'workflow_def';
      level: 'memory' | 'sql';
      workflow_run_id?: string;
      workflow_def_id?: string;
    }
  | {
      type: 'operation.metadata.cache_miss';
      resource: 'workflow_run' | 'workflow_def';
      workflow_run_id: string;
    }
  | {
      type: 'operation.metadata.fetch_start';
      workflow_run_id: string;
    }
  | {
      type: 'operation.metadata.fetch_success';
      workflow_run_id: string;
      workflow_def_id: string;
      duration_ms: number;
    }
  | {
      type: 'operation.metadata.fetch_error';
      workflow_run_id: string;
      error: string;
    }
  | {
      type: 'operation.metadata.save';
      workflow_run_id: string;
      workflow_def_id: string;
    };

/**
 * SQL layer events - query performance and debugging
 */
export type SQLEvent = {
  type: 'sql.query';
  message: string; // e.g., "SELECT context_input (0ms)"
  sql: string;
  params: unknown[];
  duration_ms: number;
};

/**
 * Dispatch layer events - decision batching and application
 *
 * Note: Duplicate token/context/branch events have been removed.
 * Those are now emitted only at the operation layer.
 */
export type DispatchEvent =
  // Batching
  | {
      type: 'dispatch.batch.start';
      decision_count: number;
    }
  | {
      type: 'dispatch.batch.complete';
      total_decisions: number;
      batched_decisions: number;
      applied: number;
      tokens_created: number;
      tokens_dispatched: number;
      errors: number;
      duration_ms?: number;
    }
  // Decision tracing
  | {
      type: 'dispatch.decision.planned';
      decision_type: string;
      source: string;
      token_id?: string;
      timestamp: number;
    }
  // Error handling
  | {
      type: 'dispatch.error';
      decision_type: string;
      error: string;
    }
  // Synchronization (orchestration-level only)
  | {
      type: 'dispatch.sync.fan_in_activated';
      node_id: string;
      fan_in_path: string;
      merged_count: number;
    }
  // Workflow lifecycle
  | {
      type: 'dispatch.workflow.completed';
      has_output: boolean;
    }
  | {
      type: 'dispatch.workflow.failed';
      error: string;
    };

/**
 * Debug events - for internal debugging and troubleshooting
 */
export type DebugEvent =
  | {
      type: 'debug.fan_in.start';
      workflow_run_id: string;
      node_id: string;
      fan_in_path: string;
    }
  | {
      type: 'debug.fan_in.try_activate_result';
      activated: boolean;
    };

/**
 * All trace event input types
 */
export type TraceEventInput = (
  | DecisionEvent
  | OperationEvent
  | SQLEvent
  | DispatchEvent
  | DebugEvent
) &
  TraceEventInputBase;

/**
 * Event category extracted from type
 */
export type TraceEventCategory = 'decision' | 'operation' | 'dispatch' | 'sql' | 'debug';

/**
 * Extract category from event type string
 */
export function getEventCategory(type: string): TraceEventCategory {
  const category = type.split('.')[0];
  if (
    category === 'decision' ||
    category === 'operation' ||
    category === 'dispatch' ||
    category === 'sql' ||
    category === 'debug'
  ) {
    return category;
  }
  return 'operation'; // Default fallback
}

/**
 * Context required for emitting trace events
 */
export interface TraceEventContext {
  workflow_run_id: string;
  project_id: string;
}

/**
 * Trace event entry as stored in D1
 */
export interface TraceEventEntry extends TraceEventContext {
  id: string;
  sequence: number;
  timestamp: number;
  type: string;
  category: TraceEventCategory;
  token_id: string | null;
  node_id: string | null;
  duration_ms: number | null;
  payload: string; // JSON string in DB
}

/**
 * Trace event entry with parsed payload for WebSocket broadcasting
 */
export interface BroadcastTraceEventEntry extends TraceEventContext {
  id: string;
  sequence: number;
  timestamp: number;
  type: string;
  category: TraceEventCategory;
  token_id: string | null;
  node_id: string | null;
  duration_ms: number | null;
  payload: TraceEventInput; // Parsed object
}

/**
 * Options for querying trace events
 */
export interface GetTraceEventsOptions {
  workflow_run_id?: string;
  token_id?: string;
  node_id?: string;
  type?: string;
  category?: TraceEventCategory;
  project_id?: string;
  limit?: number;
  min_duration_ms?: number; // Filter slow queries
}

/**
 * Trace event emitter interface
 */
export interface TraceEventEmitter {
  emit: (event: TraceEventInput) => void;
  flush: (context: TraceEventContext) => Promise<void>;
  getEvents: () => TraceEventInput[];
}
