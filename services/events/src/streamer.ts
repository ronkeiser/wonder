import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import { ulid } from 'ulid';
import type {
  BroadcastEventEntry,
  BroadcastTraceEventEntry,
  EventContext,
  EventEntry,
  EventInput,
  Subscription,
  SubscriptionFilter,
  SubscriptionMessage,
  TraceEventEntry,
  TraceEventInput,
} from './types';
import { getEventCategory } from './types';

// ============================================================================
// Batching Configuration
// ============================================================================

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 50;
const ROWS_PER_INSERT = 7;
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Streamer Durable Object - one instance per workflow_run_id
 *
 * Responsibilities:
 * - Assigns sequences atomically (single-threaded per workflow)
 * - Buffers and batches events for efficient D1 writes
 * - Broadcasts events to WebSocket subscribers immediately
 * - Manages WebSocket connections for real-time streaming
 */
export class Streamer extends DurableObject<Env> {
  private logger: Logger;

  // Sequence counters (persisted to DO storage, loaded at startup)
  private eventSeq = 0;
  private traceSeq = 0;

  // Event buffers for batched D1 writes
  private eventBuffer: EventEntry[] = [];
  private traceBuffer: TraceEventEntry[] = [];
  private flushScheduled = false;
  private retryCount = 0;

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

    const entry: EventEntry = {
      id: ulid(),
      timestamp: Date.now(),
      sequence: this.eventSeq,
      event_type: input.event_type,
      workflow_run_id: context.workflow_run_id,
      parent_run_id: context.parent_run_id ?? null,
      workflow_def_id: context.workflow_def_id,
      node_id: input.node_id ?? null,
      token_id: input.token_id ?? null,
      path_id: input.path_id ?? null,
      project_id: context.project_id,
      tokens: input.tokens ?? null,
      cost_usd: input.cost_usd ?? null,
      message: input.message ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
    };

    // Buffer for batched D1 write
    this.eventBuffer.push(entry);
    this.scheduleFlush();

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

    const entry: TraceEventEntry = {
      id: ulid(),
      timestamp: Date.now(),
      sequence: this.traceSeq,
      type: input.type,
      category: getEventCategory(input.type),
      workflow_run_id: context.workflow_run_id,
      token_id: input.token_id ?? null,
      node_id: input.node_id ?? null,
      project_id: context.project_id,
      duration_ms: input.duration_ms ?? null,
      payload: JSON.stringify(input.payload ?? {}),
    };

    // Buffer for batched D1 write
    this.traceBuffer.push(entry);
    this.scheduleFlush();

    // Broadcast immediately to WebSocket subscribers
    this.broadcastTraceEvent({
      ...entry,
      payload: input.payload ?? {},
    });
  }

  // ============================================================================
  // Batching & Flush Logic
  // ============================================================================

  /**
   * Schedule a flush using DO alarm (reliable across hibernation)
   */
  private scheduleFlush(): void {
    const totalBuffered = this.eventBuffer.length + this.traceBuffer.length;

    // Force immediate flush if batch size exceeded
    if (totalBuffered >= BATCH_SIZE) {
      this.ctx.waitUntil(this.flushBuffers());
      return;
    }

    // Schedule alarm-based flush if not already scheduled
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      this.ctx.storage.setAlarm(Date.now() + FLUSH_INTERVAL_MS);
    }
  }

  /**
   * Alarm handler - triggered after FLUSH_INTERVAL_MS
   */
  async alarm(): Promise<void> {
    this.flushScheduled = false;
    await this.flushBuffers();
  }

  /**
   * Flush all buffered events to D1 using batched multi-row inserts
   */
  private async flushBuffers(): Promise<void> {
    const eventBatch = this.eventBuffer.splice(0);
    const traceBatch = this.traceBuffer.splice(0);

    if (eventBatch.length === 0 && traceBatch.length === 0) {
      return;
    }

    try {
      const statements: Parameters<typeof this.env.DB.batch>[0] = [];

      // Build multi-row insert statements for events
      for (const chunk of chunkArray(eventBatch, ROWS_PER_INSERT)) {
        statements.push(this.buildEventInsert(chunk));
      }

      // Build multi-row insert statements for traces
      for (const chunk of chunkArray(traceBatch, ROWS_PER_INSERT)) {
        statements.push(this.buildTraceInsert(chunk));
      }

      // Execute all inserts in a single batch (transactional)
      await this.env.DB.batch(statements);
      this.retryCount = 0;

      this.logger.debug({
        message: 'Flushed event buffers',
        metadata: { events: eventBatch.length, traces: traceBatch.length },
      });
    } catch (error) {
      this.retryCount++;

      if (this.retryCount <= MAX_RETRY_ATTEMPTS) {
        // Re-queue events for retry
        this.eventBuffer.unshift(...eventBatch);
        this.traceBuffer.unshift(...traceBatch);
        this.scheduleFlush();

        this.logger.warn({
          message: 'Batch write failed, scheduling retry',
          metadata: { attempt: this.retryCount, error },
        });
      } else {
        // Max retries exceeded - log and drop
        this.logger.error({
          message: 'Batch write failed after max retries, dropping events',
          metadata: {
            droppedEvents: eventBatch.length,
            droppedTraces: traceBatch.length,
            error,
          },
        });
        this.retryCount = 0;
      }
    }
  }

  /**
   * Build a multi-row INSERT statement for workflow events
   */
  private buildEventInsert(entries: EventEntry[]): D1PreparedStatement {
    const columns = [
      'id',
      'timestamp',
      'sequence',
      'event_type',
      'workflow_run_id',
      'parent_run_id',
      'workflow_def_id',
      'node_id',
      'token_id',
      'path_id',
      'project_id',
      'tokens',
      'cost_usd',
      'message',
      'metadata',
    ];

    const placeholders = entries.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');

    const values = entries.flatMap((e) => [
      e.id,
      e.timestamp,
      e.sequence,
      e.event_type,
      e.workflow_run_id,
      e.parent_run_id,
      e.workflow_def_id,
      e.node_id,
      e.token_id,
      e.path_id,
      e.project_id,
      e.tokens,
      e.cost_usd,
      e.message,
      e.metadata,
    ]);

    return this.env.DB.prepare(
      `INSERT INTO workflow_events (${columns.join(', ')}) VALUES ${placeholders}`,
    ).bind(...values);
  }

  /**
   * Build a multi-row INSERT statement for trace events
   */
  private buildTraceInsert(entries: TraceEventEntry[]): D1PreparedStatement {
    const columns = [
      'id',
      'timestamp',
      'sequence',
      'type',
      'category',
      'workflow_run_id',
      'token_id',
      'node_id',
      'project_id',
      'duration_ms',
      'payload',
    ];

    const placeholders = entries.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');

    const values = entries.flatMap((e) => [
      e.id,
      e.timestamp,
      e.sequence,
      e.type,
      e.category,
      e.workflow_run_id,
      e.token_id,
      e.node_id,
      e.project_id,
      e.duration_ms,
      e.payload,
    ]);

    return this.env.DB.prepare(
      `INSERT INTO trace_events (${columns.join(', ')}) VALUES ${placeholders}`,
    ).bind(...values);
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

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
