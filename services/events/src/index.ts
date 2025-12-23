import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { traceEvents, workflowEvents } from './schema';
import type {
  EventRow,
  GetEventsOptions,
  GetTraceEventsOptions,
  TraceEventCategory,
  TraceEventRow,
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
  private db = drizzle(this.env.DB, { casing: 'snake_case' });

  /**
   * HTTP entrypoint
   */
  async fetch(): Promise<Response> {
    return new Response('Events service - RPC only', { status: 200 });
  }

  /**
   * RPC method - retrieves workflow events from D1
   */
  async getEvents(options: GetEventsOptions = {}): Promise<{ events: EventRow[] }> {
    const events = await this.db
      .select()
      .from(workflowEvents)
      .where(
        and(
          options.workflowRunId
            ? eq(workflowEvents.workflowRunId, options.workflowRunId)
            : undefined,
          options.rootRunId
            ? eq(workflowEvents.rootRunId, options.rootRunId)
            : undefined,
          options.projectId ? eq(workflowEvents.projectId, options.projectId) : undefined,
          options.eventType ? eq(workflowEvents.eventType, options.eventType) : undefined,
          options.nodeId ? eq(workflowEvents.nodeId, options.nodeId) : undefined,
          options.tokenId ? eq(workflowEvents.tokenId, options.tokenId) : undefined,
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
  ): Promise<{ events: (Omit<TraceEventRow, 'payload'> & { payload: unknown })[] }> {
    const results = await this.db
      .select()
      .from(traceEvents)
      .where(
        and(
          options.workflowRunId
            ? eq(traceEvents.workflowRunId, options.workflowRunId)
            : undefined,
          options.tokenId ? eq(traceEvents.tokenId, options.tokenId) : undefined,
          options.nodeId ? eq(traceEvents.nodeId, options.nodeId) : undefined,
          options.type ? eq(traceEvents.type, options.type) : undefined,
          options.category ? eq(traceEvents.category, options.category) : undefined,
          options.projectId ? eq(traceEvents.projectId, options.projectId) : undefined,
          options.minDurationMs
            ? gte(traceEvents.durationMs, options.minDurationMs)
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
