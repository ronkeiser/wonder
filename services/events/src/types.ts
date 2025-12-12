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
  // Token lifecycle
  | 'token_spawned'
  | 'token_dispatched'
  | 'token_completed'
  | 'token_failed'
  | 'token_cancelled'
  // Parallelism synchronization
  | 'fan_in_waiting'
  | 'fan_in_completed'
  // Sub-workflows
  | 'subworkflow_started'
  | 'subworkflow_completed'
  | 'subworkflow_failed'
  // Actions
  | 'llm_call_started'
  | 'llm_call_completed'
  | 'llm_call_failed'
  // State changes
  | 'transition_evaluated'
  | 'context_updated'
  | 'artifact_written';

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
    };

/**
 * Operation layer events - context, token, and state operations
 */
export type OperationEvent =
  | {
      type: 'operation.context.initialize';
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
      type: 'operation.context.write';
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
      type: 'operation.context.branch_table.create';
      token_id: string;
      table_name: string;
      schema_type: string; // Schema type that drove table creation
    }
  | {
      type: 'operation.context.branch_table.drop';
      table_name: string;
    }
  | {
      type: 'operation.context.merge.start';
      sibling_count: number;
      strategy: string;
      source_path: string; // e.g., '_branch.output'
      target_path: string; // e.g., 'state.votes'
    }
  | {
      type: 'operation.context.merge.complete';
      target_path: string;
      rows_written: number;
    }
  | {
      type: 'operation.tokens.create';
      token_id: string;
      node_id: string;
      task_id: string; // What task this token will execute
      parent_token_id: string | null;
    }
  | {
      type: 'operation.tokens.update_status';
      token_id: string;
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
  type: 'operation.sql.query';
  sql: string;
  params: unknown[];
  duration_ms: number;
};

/**
 * Dispatch layer events - decision batching and application
 */
export type DispatchEvent =
  | {
      type: 'dispatch.batch.start';
      decision_count: number;
    }
  | {
      type: 'dispatch.batch.group';
      batch_type: string;
      count: number;
    }
  | {
      type: 'dispatch.decision.apply';
      decision_type: string;
      decision: unknown; // Decision from coordinator
    };

/**
 * All trace event input types
 */
export type TraceEventInput = (DecisionEvent | OperationEvent | SQLEvent | DispatchEvent) &
  TraceEventInputBase;

/**
 * Event category extracted from type
 */
export type TraceEventCategory = 'decision' | 'operation' | 'dispatch' | 'sql';

/**
 * Extract category from event type string
 */
export function getEventCategory(type: string): TraceEventCategory {
  const category = type.split('.')[0];
  if (
    category === 'decision' ||
    category === 'operation' ||
    category === 'dispatch' ||
    category === 'sql'
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
