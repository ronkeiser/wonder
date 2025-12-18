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
 * Trace event categories - extracted from type prefix for fast filtering
 */
export type TraceEventCategory =
  | 'decision'
  | 'operation'
  | 'dispatch'
  | 'sql'
  | 'debug'
  | 'executor';

/**
 * Generic trace event input
 *
 * Convention: type = `{category}.{domain}.{action}`
 * Examples: 'decision.routing.start', 'operation.tokens.created', 'sql.query'
 *
 * Indexed fields (promoted to DB columns): token_id, node_id, duration_ms
 * Payload: Event-specific data, stored as JSON blob
 */
export interface TraceEventInput {
  /** Event type following {category}.{domain}.{action} convention */
  type: `${TraceEventCategory}.${string}`;

  /** Execution context (promoted to indexed DB columns) */
  token_id?: string;
  node_id?: string;

  /** Performance tracking (promoted to indexed DB column) */
  duration_ms?: number;

  /** Event-specific data (stored as JSON blob) */
  payload?: Record<string, unknown>;
}

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
    category === 'debug' ||
    category === 'executor'
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
  payload: Record<string, unknown>; // Parsed object
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

// ============================================================================
// WebSocket Subscription Types
// ============================================================================

/**
 * Filter for server-side event filtering on WebSocket subscriptions
 */
export interface SubscriptionFilter {
  workflow_run_id?: string;
  parent_run_id?: string;
  project_id?: string;
  event_type?: string;
  event_types?: string[];
  node_id?: string;
  token_id?: string;
  path_id?: string;
  category?: TraceEventCategory;
  type?: string;
  min_duration_ms?: number;
}

/**
 * Message sent from client to manage WebSocket subscriptions
 */
export interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  id: string;
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
}

/**
 * Active subscription state per WebSocket connection
 */
export interface Subscription {
  id: string;
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
}

// ============================================================================
// EventHub Types (Workflow Lifecycle)
// ============================================================================

/**
 * Workflow run status values
 */
export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'waiting';

/**
 * Status change notification payload
 */
export interface WorkflowStatusChange {
  workflow_run_id: string;
  workflow_def_id: string;
  project_id: string;
  parent_run_id: string | null;
  status: WorkflowRunStatus;
  timestamp: number;
}

/**
 * Subscription filter for hub events
 */
export interface HubSubscriptionFilter {
  project_id?: string;
  workflow_def_id?: string;
  status?: WorkflowRunStatus;
}

/**
 * Message sent from client to manage hub subscriptions
 */
export interface HubSubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  id: string;
  filters: HubSubscriptionFilter;
}

/**
 * Active hub subscription state per WebSocket connection
 */
export interface HubSubscription {
  id: string;
  filters: HubSubscriptionFilter;
}
