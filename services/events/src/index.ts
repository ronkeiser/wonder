import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { traceEvents, workflowEvents } from './db/schema.js';
import type {
  EventContext,
  EventInput,
  GetEventsOptions,
  GetTraceEventsOptions,
  TraceEventContext,
  TraceEventEntry,
  TraceEventInput,
} from './types.js';
import { getEventCategory } from './types.js';

// Re-export client and types for consumer convenience
export { createEmitter } from './client.js';
export { Streamer } from './streamer.js';
export type { Emitter } from './types.js';

/**
 * Main service
 */
export class EventsService extends WorkerEntrypoint<Env> {
  private db = drizzle(this.env.DB);

  /**
   * HTTP entrypoint
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Route to Streamer DO for UI and WebSocket connections
    if (url.pathname === '/' || url.pathname === '/stream') {
      const id = this.env.STREAMER.idFromName('events-streamer');
      const stub = this.env.STREAMER.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === '/events') {
      const options: GetEventsOptions = {
        workflow_run_id: url.searchParams.get('workflow_run_id') || undefined,
        parent_run_id: url.searchParams.get('parent_run_id') || undefined,
        workspace_id: url.searchParams.get('workspace_id') || undefined,
        project_id: url.searchParams.get('project_id') || undefined,
        event_type: url.searchParams.get('event_type') || undefined,
        node_id: url.searchParams.get('node_id') || undefined,
        token_id: url.searchParams.get('token_id') || undefined,
        limit: url.searchParams.has('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        after_sequence: url.searchParams.has('after_sequence')
          ? parseInt(url.searchParams.get('after_sequence')!)
          : undefined,
      };

      const results = await this.getEvents(options);
      return Response.json(results);
    }

    return new Response('Events service', { status: 200 });
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
            sequence_number: input.sequence_number ?? 0,
            metadata: JSON.stringify(input.metadata || {}),
          };

          await this.db.insert(workflowEvents).values(eventEntry);

          // Broadcast to connected WebSocket clients
          try {
            const id = this.env.STREAMER.idFromName('events-streamer');
            const stub = this.env.STREAMER.get(id);
            await stub.broadcast(eventEntry);
          } catch (error) {
            console.error('[EVENTS] Failed to broadcast event to WebSocket clients:', error);
          }
        } catch (error) {
          console.error('[EVENTS] Failed to insert event:', error, { context, input });
        }
      })(),
    );
  }

  /**
   * RPC method - retrieves events from D1
   */
  async getEvents(options: GetEventsOptions = {}) {
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
          options.workspace_id ? eq(workflowEvents.workspace_id, options.workspace_id) : undefined,
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
          const entry: TraceEventEntry = {
            id: ulid(),
            timestamp: Date.now(),
            ...context,
            ...event,
            category: getEventCategory(event.type),
            token_id: event.token_id ?? null,
            node_id: event.node_id ?? null,
            duration_ms: event.duration_ms ?? null,
            payload: JSON.stringify(event),
          };

          await this.db.insert(traceEvents).values(entry);

          // Broadcast to WebSocket clients
          try {
            const id = this.env.STREAMER.idFromName('events-streamer');
            const stub = this.env.STREAMER.get(id);
            await stub.broadcastTraceEvent(entry);
          } catch (error) {
            console.error('[EVENTS] Failed to broadcast trace event to WebSocket clients:', error);
          }
        } catch (error) {
          console.error('[EVENTS] Failed to insert trace event:', error);
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
          await this.db.insert(traceEvents).values(batch);
        } catch (error) {
          console.error('[EVENTS] Failed to insert trace events:', error);
        }
      })(),
    );
  }

  /**
   * RPC method - retrieves trace events from D1
   */
  async getTraceEvents(options: GetTraceEventsOptions = {}) {
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
          options.workspace_id ? eq(traceEvents.workspace_id, options.workspace_id) : undefined,
          options.project_id ? eq(traceEvents.project_id, options.project_id) : undefined,
          options.min_duration_ms
            ? gte(traceEvents.duration_ms, options.min_duration_ms)
            : undefined,
        ),
      )
      .orderBy(traceEvents.sequence)
      .limit(options.limit || 1000);

    return {
      events: results.map((row) => JSON.parse(row.payload) as TraceEventInput),
    };
  }
}

export default EventsService;
