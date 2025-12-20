// services/events/src/types.ts

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { traceEvents, workflowEvents } from './schema';

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
  workflowRunId: string;
  projectId: string;
  workflowDefId: string;
  parentRunId?: string | null;
}

/**
 * Input for emitting an event - caller provides event data
 */
export interface EventInput {
  eventType: EventType | string; // Allow custom event types
  sequence?: number;
  nodeId?: string | null;
  tokenId?: string | null;
  pathId?: string | null;
  tokens?: number | null; // For LLM calls
  costUsd?: number | null; // For LLM calls
  message?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Event entry for inserting into D1
 */
export type EventEntry = InferInsertModel<typeof workflowEvents>;

/**
 * Event entry as selected from D1
 */
export type EventRow = InferSelectModel<typeof workflowEvents>;

/**
 * Event entry with parsed metadata for WebSocket broadcasting
 */
export type BroadcastEventEntry = Omit<EventEntry, 'metadata'> & {
  metadata: Record<string, unknown>;
};

/**
 * Options for querying events
 */
export interface GetEventsOptions {
  workflowRunId?: string;
  parentRunId?: string;
  projectId?: string;
  eventType?: string;
  nodeId?: string;
  tokenId?: string;
  limit?: number;
  afterSequence?: number; // For replay from checkpoint
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
 * Indexed fields (promoted to DB columns): tokenId, nodeId, durationMs
 * Payload: Event-specific data, stored as JSON blob
 */
export interface TraceEventInput {
  /** Event type following {category}.{domain}.{action} convention */
  type: `${TraceEventCategory}.${string}`;

  /** Execution context (promoted to indexed DB columns) */
  tokenId?: string;
  nodeId?: string;

  /** Performance tracking (promoted to indexed DB column) */
  durationMs?: number;

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
  workflowRunId: string;
  projectId: string;
}

/**
 * Trace event entry for inserting into D1
 */
export type TraceEventEntry = InferInsertModel<typeof traceEvents>;

/**
 * Trace event entry as selected from D1
 */
export type TraceEventRow = InferSelectModel<typeof traceEvents>;

/**
 * Trace event entry with parsed payload for WebSocket broadcasting
 */
export type BroadcastTraceEventEntry = Omit<TraceEventEntry, 'payload'> & {
  payload: Record<string, unknown>;
};

/**
 * Options for querying trace events
 */
export interface GetTraceEventsOptions {
  workflowRunId?: string;
  tokenId?: string;
  nodeId?: string;
  type?: string;
  category?: TraceEventCategory;
  projectId?: string;
  limit?: number;
  minDurationMs?: number; // Filter slow queries
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
  workflowRunId?: string;
  parentRunId?: string;
  projectId?: string;
  eventType?: string;
  eventTypes?: string[];
  nodeId?: string;
  tokenId?: string;
  pathId?: string;
  category?: TraceEventCategory;
  type?: string;
  minDurationMs?: number;
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
  workflowRunId: string;
  workflowDefId: string;
  projectId: string;
  parentRunId: string | null;
  status: WorkflowRunStatus;
  timestamp: number;
}

/**
 * Subscription filter for hub events
 */
export interface HubSubscriptionFilter {
  projectId?: string;
  workflowDefId?: string;
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
