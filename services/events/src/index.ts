import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { events, traceEvents } from './schema';
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
export type { EventContext, EventInput, TraceEventInput, ExecutionType } from './types';
export type { ExecutionStatus, ExecutionStatusChange } from './hub';

/**
 * Events Query Service
 *
 * Provides read-only access to historical events stored in D1.
 * All event writes go through the Streamer DO (one per streamId).
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
   * RPC method - retrieves events from D1
   */
  async getEvents(options: GetEventsOptions = {}): Promise<{ events: EventRow[] }> {
    const results = await this.db
      .select()
      .from(events)
      .where(
        and(
          options.streamId ? eq(events.streamId, options.streamId) : undefined,
          options.executionId ? eq(events.executionId, options.executionId) : undefined,
          options.executionType ? eq(events.executionType, options.executionType) : undefined,
          options.projectId ? eq(events.projectId, options.projectId) : undefined,
          options.eventType ? eq(events.eventType, options.eventType) : undefined,
        ),
      )
      .orderBy(desc(events.timestamp))
      .limit(options.limit || 100);

    return { events: results };
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
          options.streamId ? eq(traceEvents.streamId, options.streamId) : undefined,
          options.executionId ? eq(traceEvents.executionId, options.executionId) : undefined,
          options.executionType
            ? eq(traceEvents.executionType, options.executionType)
            : undefined,
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
    const parsedEvents = results.map((row) => ({
      ...row,
      category: row.category as TraceEventCategory,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));

    return { events: parsedEvents };
  }
}

export default EventsService;
