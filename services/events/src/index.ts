import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { traceEvents, workflowEvents } from './schema';
import type {
  BroadcastTraceEventEntry,
  EventEntry,
  GetEventsOptions,
  GetTraceEventsOptions,
  TraceEventCategory,
} from './types';

// Re-export DOs and types for consumer convenience
export { EventHub } from './hub';
export { Streamer } from './streamer';
export { createEmitter, type Emitter } from './client';
export type { EventContext, EventInput, TraceEventInput } from './types';
export type { WorkflowStatusChange, WorkflowRunStatus } from './hub';

/**
 * Events Query Service
 *
 * Provides read-only access to historical events stored in D1.
 * All event writes go through the Streamer DO (one per workflow_run_id).
 */
export class EventsService extends WorkerEntrypoint<Env> {
  private db = drizzle(this.env.DB);

  /**
   * HTTP entrypoint
   */
  async fetch(): Promise<Response> {
    return new Response('Events service - RPC only', { status: 200 });
  }

  /**
   * RPC method - retrieves workflow events from D1
   */
  async getEvents(options: GetEventsOptions = {}): Promise<{ events: EventEntry[] }> {
    const events = await this.db
      .select()
      .from(workflowEvents)
      .where(
        and(
          options.workflow_run_id
            ? eq(workflowEvents.workflow_run_id, options.workflow_run_id)
            : undefined,
          options.parent_run_id
            ? eq(workflowEvents.parent_run_id, options.parent_run_id)
            : undefined,
          options.project_id ? eq(workflowEvents.project_id, options.project_id) : undefined,
          options.event_type ? eq(workflowEvents.event_type, options.event_type) : undefined,
          options.node_id ? eq(workflowEvents.node_id, options.node_id) : undefined,
          options.token_id ? eq(workflowEvents.token_id, options.token_id) : undefined,
        ),
      )
      .orderBy(desc(workflowEvents.timestamp))
      .limit(options.limit || 100);

    return { events };
  }

  /**
   * RPC method - retrieves trace events from D1
   */
  async getTraceEvents(
    options: GetTraceEventsOptions = {},
  ): Promise<{ events: BroadcastTraceEventEntry[] }> {
    const results = await this.db
      .select()
      .from(traceEvents)
      .where(
        and(
          options.workflow_run_id
            ? eq(traceEvents.workflow_run_id, options.workflow_run_id)
            : undefined,
          options.token_id ? eq(traceEvents.token_id, options.token_id) : undefined,
          options.node_id ? eq(traceEvents.node_id, options.node_id) : undefined,
          options.type ? eq(traceEvents.type, options.type) : undefined,
          options.category ? eq(traceEvents.category, options.category) : undefined,
          options.project_id ? eq(traceEvents.project_id, options.project_id) : undefined,
          options.min_duration_ms
            ? gte(traceEvents.duration_ms, options.min_duration_ms)
            : undefined,
        ),
      )
      .orderBy(desc(traceEvents.timestamp))
      .limit(options.limit || 1000);

    // Parse JSON payloads
    const events = results.map((row) => ({
      ...row,
      category: row.category as TraceEventCategory,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));

    return { events };
  }
}

export default EventsService;
