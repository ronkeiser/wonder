import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { introspectionEvents, workflowEvents } from './db/schema.js';
import type {
  EventContext,
  EventInput,
  GetEventsOptions,
  GetIntrospectionEventsOptions,
  IntrospectionEvent,
  IntrospectionEventEntry,
} from './types.js';

/**
 * Main service
 */
export class EventsService extends WorkerEntrypoint<Env> {
  private db = drizzle(this.env.DB);

  private buildWorkflowEventConditions(options: GetEventsOptions) {
    const conditions = [];
    if (options.workflow_run_id)
      conditions.push(eq(workflowEvents.workflow_run_id, options.workflow_run_id));
    if (options.parent_run_id)
      conditions.push(eq(workflowEvents.parent_run_id, options.parent_run_id));
    if (options.workspace_id)
      conditions.push(eq(workflowEvents.workspace_id, options.workspace_id));
    if (options.project_id) conditions.push(eq(workflowEvents.project_id, options.project_id));
    if (options.event_type) conditions.push(eq(workflowEvents.event_type, options.event_type));
    if (options.node_id) conditions.push(eq(workflowEvents.node_id, options.node_id));
    if (options.token_id) conditions.push(eq(workflowEvents.token_id, options.token_id));
    return conditions;
  }

  private buildIntrospectionEventConditions(options: GetIntrospectionEventsOptions) {
    const conditions = [];
    if (options.workflow_run_id)
      conditions.push(eq(introspectionEvents.workflow_run_id, options.workflow_run_id));
    if (options.token_id) conditions.push(eq(introspectionEvents.token_id, options.token_id));
    if (options.node_id) conditions.push(eq(introspectionEvents.node_id, options.node_id));
    if (options.type) conditions.push(eq(introspectionEvents.type, options.type));
    if (options.category) conditions.push(eq(introspectionEvents.category, options.category));
    if (options.workspace_id)
      conditions.push(eq(introspectionEvents.workspace_id, options.workspace_id));
    if (options.project_id) conditions.push(eq(introspectionEvents.project_id, options.project_id));
    if (options.min_duration_ms)
      conditions.push(gte(introspectionEvents.duration_ms, options.min_duration_ms));
    return conditions;
  }

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
    const conditions = this.buildWorkflowEventConditions(options);
    const limit = options.limit || 100;

    const events = await this.db
      .select()
      .from(workflowEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(workflowEvents.timestamp))
      .limit(limit);

    return { events };
  }

  /**
   * RPC method - writes introspection events to D1
   */
  writeIntrospection(batch: IntrospectionEventEntry[]): void {
    this.ctx.waitUntil(
      (async () => {
        try {
          await this.db.insert(introspectionEvents).values(batch);
        } catch (error) {
          console.error('[EVENTS] Failed to insert introspection events:', error);
        }
      })(),
    );
  }

  /**
   * RPC method - retrieves introspection events from D1
   */
  async getIntrospectionEvents(options: GetIntrospectionEventsOptions = {}) {
    const conditions = this.buildIntrospectionEventConditions(options);
    const limit = options.limit || 1000;

    const results = await this.db
      .select()
      .from(introspectionEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(introspectionEvents.sequence)
      .limit(limit);

    return {
      events: results.map((row) => JSON.parse(row.payload) as IntrospectionEvent),
    };
  }
}

export default EventsService;
