import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { events } from './db/schema.js';
import type {
  Emitter,
  EventContext,
  EventEntry,
  EventInput,
  EventType,
  GetEventsOptions,
} from './types.js';

export { Streamer } from './streamer';
export type {
  Emitter,
  EventContext,
  EventEntry,
  EventInput,
  EventType,
  GetEventsOptions,
} from './types.js';

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
    console.log('[EVENTS] write() called:', { context, input });
    this.ctx.waitUntil(
      (async () => {
        try {
          const eventEntry = {
            id: ulid(),
            timestamp: Date.now(),
            ...context,
            ...input,
            metadata: JSON.stringify(input.metadata || {}),
          };

          console.log('[EVENTS] Inserting event:', eventEntry);
          await this.db.insert(events).values(eventEntry);
          console.log('[EVENTS] Successfully inserted event');

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
    const conditions = [];

    if (options.workflow_run_id)
      conditions.push(eq(events.workflow_run_id, options.workflow_run_id));
    if (options.parent_run_id) conditions.push(eq(events.parent_run_id, options.parent_run_id));
    if (options.workspace_id) conditions.push(eq(events.workspace_id, options.workspace_id));
    if (options.project_id) conditions.push(eq(events.project_id, options.project_id));
    if (options.event_type) conditions.push(eq(events.event_type, options.event_type));
    if (options.node_id) conditions.push(eq(events.node_id, options.node_id));
    if (options.token_id) conditions.push(eq(events.token_id, options.token_id));

    const limit = options.limit || 100;

    const results = await this.db
      .select()
      .from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(events.timestamp))
      .limit(limit);

    return { events: [...results] };
  }
}

export default EventsService;
