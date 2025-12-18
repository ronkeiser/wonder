import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { traceEvents, workflowEvents } from './schema';
import type {
  BroadcastEventEntry,
  BroadcastTraceEventEntry,
  EventContext,
  EventInput,
  Subscription,
  SubscriptionFilter,
  SubscriptionMessage,
  TraceEventInput,
} from './types';
import { getEventCategory } from './types';

// Batching configuration
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 10;

/**
 * Streamer Durable Object - one instance per workflow_run_id
 *
 * Responsibilities:
 * - Assigns sequences atomically (single-threaded per workflow)
 * - Buffers and batch-writes events to D1
 * - Broadcasts events to WebSocket subscribers
 * - Manages WebSocket connections for real-time streaming
 */
export class Streamer extends DurableObject<Env> {
  private logger: Logger;
  private db = drizzle(this.env.DB);

  // Sequence counters (persisted to DO storage, loaded at startup)
  private eventSeq = 0;
  private traceSeq = 0;

  // Event buffers for batch D1 writes
  private eventBuffer: (typeof workflowEvents.$inferInsert)[] = [];
  private traceBuffer: (typeof traceEvents.$inferInsert)[] = [];
  private eventFlushScheduled = false;
  private traceFlushScheduled = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = createLogger(ctx, env.LOGS, {
      service: `${env.SERVICE}-streamer`,
      environment: env.ENVIRONMENT,
    });

    // Load persisted sequence counters at startup
    ctx.blockConcurrencyWhile(async () => {
      this.eventSeq = (await ctx.storage.get<number>('eventSeq')) ?? 0;
      this.traceSeq = (await ctx.storage.get<number>('traceSeq')) ?? 0;
    });
  }

  // ============================================================================
  // RPC Methods - Called by Coordinator and Executor
  // ============================================================================

  /**
   * Emit a workflow event
   *
   * Called by coordinator/executor via RPC. Assigns sequence, buffers for D1,
   * and broadcasts immediately to WebSocket subscribers.
   */
  emit(context: EventContext, input: Omit<EventInput, 'sequence'>): void {
    this.eventSeq++;
    this.ctx.storage.put('eventSeq', this.eventSeq);

    const entry = {
      id: ulid(),
      timestamp: Date.now(),
      ...context,
      ...input,
      sequence: this.eventSeq,
      metadata: JSON.stringify(input.metadata ?? {}),
    };

    // Buffer for batch D1 insert
    this.eventBuffer.push(entry);
    if (this.eventBuffer.length >= BATCH_SIZE) {
      this.ctx.waitUntil(this.flushEventBuffer());
    } else {
      this.scheduleEventFlush();
    }

    // Broadcast immediately to WebSocket subscribers
    this.broadcastEvent({
      ...entry,
      metadata: input.metadata ?? {},
    });
  }

  /**
   * Emit a trace event
   *
   * Called by coordinator/executor via RPC. Assigns sequence, buffers for D1,
   * and broadcasts immediately to WebSocket subscribers.
   */
  emitTrace(
    context: { workflow_run_id: string; project_id: string },
    input: TraceEventInput,
  ): void {
    this.traceSeq++;
    this.ctx.storage.put('traceSeq', this.traceSeq);

    const entry = {
      id: ulid(),
      timestamp: Date.now(),
      ...context,
      type: input.type,
      sequence: this.traceSeq,
      category: getEventCategory(input.type),
      token_id: input.token_id ?? null,
      node_id: input.node_id ?? null,
      duration_ms: input.duration_ms ?? null,
      message: null,
      payload: JSON.stringify(input.payload ?? {}),
    };

    // Insert directly (batching disabled for debugging)
    this.ctx.waitUntil(this.db.insert(traceEvents).values(entry));

    // Broadcast immediately to WebSocket subscribers
    this.broadcastTraceEvent({
      ...entry,
      payload: input.payload ?? {},
    });
  }

  // ============================================================================
  // Batching Infrastructure
  // ============================================================================

  private scheduleEventFlush(): void {
    if (this.eventFlushScheduled) return;
    this.eventFlushScheduled = true;

    this.ctx.waitUntil(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          this.flushEventBuffer().then(resolve);
        }, BATCH_DELAY_MS);
      }),
    );
  }

  private async flushEventBuffer(): Promise<void> {
    this.eventFlushScheduled = false;
    if (this.eventBuffer.length === 0) return;

    const batch = this.eventBuffer.splice(0);

    try {
      await this.db.insert(workflowEvents).values(batch);
    } catch (error) {
      this.logger.error({
        message: 'Failed to batch insert workflow events',
        metadata: {
          error_message: error instanceof Error ? error.message : String(error),
          error_stack: error instanceof Error ? error.stack : undefined,
          batch_size: batch.length,
          sample_entry: batch[0],
        },
      });
    }
  }

  private scheduleTraceFlush(): void {
    if (this.traceFlushScheduled) return;
    this.traceFlushScheduled = true;

    this.ctx.waitUntil(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          this.flushTraceBuffer().then(resolve);
        }, BATCH_DELAY_MS);
      }),
    );
  }

  private async flushTraceBuffer(): Promise<void> {
    this.traceFlushScheduled = false;
    if (this.traceBuffer.length === 0) return;

    const batch = this.traceBuffer.splice(0);

    try {
      await this.db.insert(traceEvents).values(batch);
    } catch (error) {
      this.logger.error({
        message: 'Failed to batch insert trace events',
        metadata: {
          error_message: error instanceof Error ? error.message : String(error),
          error_stack: error instanceof Error ? error.stack : undefined,
          batch_size: batch.length,
          sample_entry: batch[0],
        },
      });
    }
  }

  // ============================================================================
  // WebSocket Management
  // ============================================================================

  /**
   * Handle WebSocket upgrade and initial connection
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/stream') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.serializeAttachment({});
      this.ctx.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle incoming WebSocket messages for subscription management
   */
  webSocketMessage(ws: WebSocket, message: string): void {
    try {
      const msg = JSON.parse(message) as SubscriptionMessage;
      const subsObj = (ws.deserializeAttachment() as Record<string, Subscription>) || {};

      if (msg.type === 'subscribe') {
        subsObj[msg.id] = {
          id: msg.id,
          stream: msg.stream,
          filters: msg.filters,
        };
        ws.serializeAttachment(subsObj);
      } else if (msg.type === 'unsubscribe') {
        delete subsObj[msg.id];
        ws.serializeAttachment(subsObj);
      }
    } catch (error) {
      this.logger.error({ message: 'Error handling WebSocket message', metadata: { error } });
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid subscription message' }));
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    this.logger.error({ message: 'WebSocket error', metadata: { error } });
  }

  // ============================================================================
  // Broadcasting
  // ============================================================================

  private broadcastEvent(entry: BroadcastEventEntry): void {
    this.ctx.getWebSockets().forEach((ws) => {
      const subsObj = (ws.deserializeAttachment() as Record<string, Subscription>) || {};

      for (const sub of Object.values(subsObj)) {
        if (sub.stream === 'events' && this.matchesEventFilter(entry, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'event',
                stream: 'events',
                subscription_id: sub.id,
                event: entry,
              }),
            );
          } catch (error) {
            this.logger.error({
              message: 'Error broadcasting event to WebSocket',
              metadata: { error },
            });
          }
        }
      }
    });
  }

  private broadcastTraceEvent(entry: BroadcastTraceEventEntry): void {
    this.ctx.getWebSockets().forEach((ws) => {
      const subsObj = (ws.deserializeAttachment() as Record<string, Subscription>) || {};

      for (const sub of Object.values(subsObj)) {
        if (sub.stream === 'trace' && this.matchesTraceFilter(entry, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'event',
                stream: 'trace',
                subscription_id: sub.id,
                event: entry,
              }),
            );
          } catch (error) {
            this.logger.error({
              message: 'Error broadcasting trace event to WebSocket',
              metadata: { error },
            });
          }
        }
      }
    });
  }

  // ============================================================================
  // Filtering
  // ============================================================================

  private matchesEventFilter(event: BroadcastEventEntry, filter: SubscriptionFilter): boolean {
    if (filter.workflow_run_id && event.workflow_run_id !== filter.workflow_run_id) return false;
    if (filter.parent_run_id && event.parent_run_id !== filter.parent_run_id) return false;
    if (filter.project_id && event.project_id !== filter.project_id) return false;
    if (filter.node_id && event.node_id !== filter.node_id) return false;
    if (filter.token_id && event.token_id !== filter.token_id) return false;
    if (filter.path_id && event.path_id !== filter.path_id) return false;
    if (filter.event_type && event.event_type !== filter.event_type) return false;
    if (filter.event_types && !filter.event_types.includes(event.event_type)) return false;
    return true;
  }

  private matchesTraceFilter(event: BroadcastTraceEventEntry, filter: SubscriptionFilter): boolean {
    if (filter.workflow_run_id && event.workflow_run_id !== filter.workflow_run_id) return false;
    if (filter.project_id && event.project_id !== filter.project_id) return false;
    if (filter.token_id && event.token_id !== filter.token_id) return false;
    if (filter.node_id && event.node_id !== filter.node_id) return false;
    if (filter.category && event.category !== filter.category) return false;
    if (filter.type && event.type !== filter.type) return false;
    if (
      filter.min_duration_ms !== undefined &&
      event.duration_ms !== null &&
      event.duration_ms < filter.min_duration_ms
    ) {
      return false;
    }
    return true;
  }
}
