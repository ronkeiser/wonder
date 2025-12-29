// services/events/src/types.ts

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { events, traceEvents } from './schema';

/**
 * Execution type discriminator
 */
export type ExecutionType = 'workflow' | 'conversation';

/**
 * Event types - domain-specific, not restricted at the infrastructure level
 *
 * Naming convention: category.action (dot notation)
 *
 * Workflow events:
 * - workflow.* - Workflow lifecycle events
 * - task.* - Task execution events
 * - token.* - Token lifecycle events
 * - context.* - Context state changes
 * - fan_out.* / fan_in.* - Parallel execution events
 *
 * Conversation events:
 * - conversation.* - Conversation lifecycle
 * - turn.* - Turn lifecycle
 * - message.* - Message events
 * - tool.* - Tool execution
 * - memory.* - Memory extraction
 */
export type EventType = string;

/**
 * Context required for emitting events
 *
 * Generic execution context - domain-specific fields go in metadata.
 */
export interface EventContext {
  streamId: string; // Outer boundary (conversationId or rootRunId)
  executionId: string; // Specific execution (workflowRunId, turnId, etc.)
  executionType: ExecutionType;
  projectId: string;
}

/**
 * Input for emitting an event - caller provides event data
 *
 * All domain-specific fields (nodeId, tokenId, costUsd, etc.) go in metadata.
 */
export interface EventInput {
  eventType: EventType;
  sequence?: number;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Event entry for inserting into D1
 */
export type EventEntry = InferInsertModel<typeof events>;

/**
 * Event entry as selected from D1
 */
export type EventRow = InferSelectModel<typeof events>;

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
  streamId?: string; // Outer boundary (conversationId or rootRunId)
  executionId?: string; // Specific execution (workflowRunId, turnId, etc.)
  executionType?: ExecutionType;
  projectId?: string;
  eventType?: string;
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
 * Trace event category - extracted from type prefix for fast filtering
 *
 * Free-form string. Conventions by execution type:
 * - Workflows: 'decision', 'operation', 'dispatch', 'sql', 'debug', 'executor'
 * - Conversations: 'turn', 'tool', 'memory', 'llm', etc.
 */
export type TraceEventCategory = string;

/**
 * Generic trace event input
 *
 * Convention: type = `{category}.{domain}.{action}`
 * Examples: 'decision.routing.start', 'operation.tokens.created', 'sql.query'
 *
 * All domain-specific data (tokenId, nodeId, etc.) goes in payload.
 * Only durationMs is promoted to a DB column for performance filtering.
 */
export interface TraceEventInput {
  /** Event type following {category}.{domain}.{action} convention */
  type: string;

  /** Performance tracking (promoted to indexed DB column) */
  durationMs?: number;

  /** Event-specific data including domain context (tokenId, nodeId, etc.) */
  payload?: Record<string, unknown>;
}

/**
 * Extract category from event type string
 *
 * Convention: type = '{category}.{domain}.{action}'
 * Returns the first segment before the first dot.
 */
export function getEventCategory(type: string): string {
  return type.split('.')[0] || 'unknown';
}

/**
 * Context required for emitting trace events
 *
 * Same as EventContext - generic execution context.
 */
export interface TraceEventContext {
  streamId: string;
  executionId: string;
  executionType: ExecutionType;
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
  streamId?: string; // Outer boundary (conversationId or rootRunId)
  executionId?: string; // Specific execution (workflowRunId, turnId, etc.)
  executionType?: ExecutionType;
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
  streamId?: string; // Outer boundary (conversationId or rootRunId)
  executionId?: string; // Specific execution (workflowRunId, turnId, etc.)
  executionType?: ExecutionType;
  projectId?: string;
  eventType?: string;
  eventTypes?: string[];
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
// EventHub Types (Execution Lifecycle)
// ============================================================================

/**
 * Execution status values (generic for workflows and conversations)
 */
export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'waiting';

/**
 * Status change notification payload
 *
 * Generic execution context. Domain-specific IDs:
 * - Workflows: definitionId = workflowDefId
 * - Conversations: definitionId = agentId
 */
export interface ExecutionStatusChange {
  /** Execution type discriminator */
  executionType: ExecutionType;

  /** Outer boundary (conversationId or rootRunId) */
  streamId: string;

  /** Specific execution (workflowRunId, turnId, etc.) */
  executionId: string;

  /** Definition ID (workflowDefId for workflows, agentId for conversations) */
  definitionId: string;

  /** Project ID */
  projectId: string;

  /** Parent execution ID (for subworkflows) */
  parentExecutionId: string | null;

  /** Current status */
  status: ExecutionStatus;

  /** Timestamp of status change */
  timestamp: number;
}

/**
 * Subscription filter for hub events
 */
export interface HubSubscriptionFilter {
  executionType?: ExecutionType;
  projectId?: string;
  definitionId?: string;
  status?: ExecutionStatus;
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
