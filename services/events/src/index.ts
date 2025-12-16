import { createLogger, type Logger } from '@wonder/logs';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { traceEvents, workflowEvents } from './schema';
import type {
  BroadcastEventEntry,
  BroadcastTraceEventEntry,
  EventContext,
  EventEntry,
  EventInput,
  GetEventsOptions,
  GetTraceEventsOptions,
  TraceEventCategory,
  TraceEventContext,
  TraceEventEntry,
  TraceEventInput,
} from './types.js';
import { getEventCategory } from './types.js';

// Re-export client and types for consumer convenience
export { createEmitter } from './client.js';
export { Streamer } from './streamer.js';
export type { DecisionEvent, Emitter } from './types.js';

const STREAMER_NAME = 'events-streamer';

/**
 * Main service
 */
export class EventsService extends WorkerEntrypoint<Env> {
  private db = drizzle(this.env.DB);
  private logger: Logger = createLogger(this.ctx, this.env.LOGS, {
    service: 'events',
    environment: 'development',
  });

  /**
   * Broadcast event to WebSocket clients
   */
  private async broadcastEvent(event: BroadcastEventEntry): Promise<void> {
    try {
      const id = this.env.STREAMER.idFromName(STREAMER_NAME);
      const stub = this.env.STREAMER.get(id);
      await stub.broadcast(event);
    } catch (error) {
      this.logger.error({
        message: 'Failed to broadcast event to WebSocket clients',
        metadata: { error },
      });
    }
  }

  /**
   * Broadcast trace event to WebSocket clients
   */
  private async broadcastTraceEventToClients(event: BroadcastTraceEventEntry): Promise<void> {
    try {
      const id = this.env.STREAMER.idFromName(STREAMER_NAME);
      const stub = this.env.STREAMER.get(id);
      await stub.broadcastTraceEvent(event);
    } catch (error) {
      this.logger.error({
        message: 'Failed to broadcast trace event to WebSocket clients',
        metadata: { error },
      });
    }
  }

  /**
   * HTTP entrypoint
   */
  async fetch(): Promise<Response> {
    return new Response('Events service - RPC only', { status: 200 });
  }

  /**
   * RPC method - writes event to D1
   */
  write(context: EventContext, input: EventInput): void {
    this.ctx.waitUntil(
      (async () => {
        try {
          const eventEntry = {
            id: ulid(),
            timestamp: Date.now(),
            ...context,
            ...input,
            sequence: input.sequence ?? 0,
            metadata: JSON.stringify(input.metadata || {}),
          };

          await this.db.insert(workflowEvents).values(eventEntry);

          // Broadcast to connected WebSocket clients with parsed metadata
          await this.broadcastEvent({
            id: eventEntry.id,
            timestamp: eventEntry.timestamp,
            ...context,
            ...input,
            sequence: eventEntry.sequence,
            metadata: input.metadata || {},
          });
        } catch (error) {
          this.logger.error({
            message: 'Failed to insert event',
            metadata: { error, context, input },
          });
        }
      })(),
    );
  }

  /**
   * RPC method - retrieves events from D1
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
   * RPC method - writes a single trace event to D1
   */
  writeTraceEvent(context: TraceEventContext, event: TraceEventInput & { sequence: number }): void {
    this.ctx.waitUntil(
      (async () => {
        try {
          const entry = {
            id: ulid(),
            timestamp: Date.now(),
            ...context,
            ...event,
            category: getEventCategory(event.type),
            token_id: event.token_id ?? null,
            node_id: event.node_id ?? null,
            duration_ms: event.duration_ms ?? null,
            message: 'message' in event ? ((event as { message?: string }).message ?? null) : null,
            payload: JSON.stringify(event),
          };

          await this.db.insert(traceEvents).values(entry);

          // Broadcast to WebSocket clients with parsed payload
          await this.broadcastTraceEventToClients({
            ...entry,
            payload: event,
          });
        } catch (error) {
          this.logger.error({ message: 'Failed to insert trace event', metadata: { error } });
        }
      })(),
    );
  }

  /**
   * RPC method - writes trace events batch to D1
   */
  writeTraceEvents(batch: TraceEventEntry[]): void {
    this.ctx.waitUntil(
      (async () => {
        try {
          // Stringify payloads for database insertion
          const batchWithStringPayloads = batch.map((entry) => ({
            ...entry,
            payload: JSON.stringify(entry.payload),
          }));

          await this.db.insert(traceEvents).values(batchWithStringPayloads);
        } catch (error) {
          this.logger.error({ message: 'Failed to insert trace events', metadata: { error } });
        }
      })(),
    );
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

    // Manually parse JSON payloads
    const events = results.map((row) => ({
      ...row,
      category: row.category as TraceEventCategory,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));

    return { events };
  }
}

export default EventsService;
