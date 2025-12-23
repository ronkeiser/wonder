import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { traceEvents, workflowEvents } from './schema';
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

    // Load persisted state at startup
    ctx.blockConcurrencyWhile(async () => {
      this.eventSeq = (await ctx.storage.get<number>('eventSeq')) ?? 0;
      this.traceSeq = (await ctx.storage.get<number>('traceSeq')) ?? 0;
      this.eventBuffer = (await ctx.storage.get<EventEntry[]>('eventBuffer')) ?? [];
      this.traceBuffer = (await ctx.storage.get<TraceEventEntry[]>('traceBuffer')) ?? [];

      // Flush any recovered buffered events
      if (this.eventBuffer.length > 0 || this.traceBuffer.length > 0) {
        this.scheduleFlush();
      }
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
      ...context,
      ...input,
      metadata: JSON.stringify(input.metadata ?? {}),
    };

    // Buffer for batched D1 write (persisted to survive hibernation)
    this.eventBuffer.push(entry);
    this.ctx.storage.put('eventBuffer', this.eventBuffer);
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
    context: { workflowRunId: string; rootRunId: string; projectId: string },
    input: TraceEventInput,
  ): void {
    this.traceSeq++;
    this.ctx.storage.put('traceSeq', this.traceSeq);

    const entry: TraceEventEntry = {
      id: ulid(),
      timestamp: Date.now(),
      sequence: this.traceSeq,
      category: getEventCategory(input.type),
      ...context,
      ...input,
      payload: JSON.stringify(input.payload ?? {}),
    };

    // Buffer for batched D1 write (persisted to survive hibernation)
    this.traceBuffer.push(entry);
    this.ctx.storage.put('traceBuffer', this.traceBuffer);
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
   * Flush all buffered events to D1 using Drizzle insert
   */
  private async flushBuffers(): Promise<void> {
    const eventBatch = this.eventBuffer.splice(0);
    const traceBatch = this.traceBuffer.splice(0);

    if (eventBatch.length === 0 && traceBatch.length === 0) {
      return;
    }

    try {
      const db = drizzle(this.env.DB, { casing: 'snake_case' });

      // Build insert statements for events and traces (chunked for efficiency)
      const eventStatements = chunkArray(eventBatch, ROWS_PER_INSERT).map((chunk) =>
        db.insert(workflowEvents).values(chunk),
      );
      const traceStatements = chunkArray(traceBatch, ROWS_PER_INSERT).map((chunk) =>
        db.insert(traceEvents).values(chunk),
      );
      const allStatements = [...eventStatements, ...traceStatements];

      // Execute all inserts in a single batch (transactional)
      // Drizzle batch requires at least one statement
      if (allStatements.length > 0) {
        await db.batch(allStatements as [typeof allStatements[0], ...typeof allStatements]);
      }
      this.retryCount = 0;

      // Clear persisted buffers after successful write
      await this.ctx.storage.delete(['eventBuffer', 'traceBuffer']);

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
        this.ctx.storage.put('eventBuffer', this.eventBuffer);
        this.ctx.storage.put('traceBuffer', this.traceBuffer);
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
        await this.ctx.storage.delete(['eventBuffer', 'traceBuffer']);
      }
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
        if (sub.stream === 'events' && matchesEventFilter(entry, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'event',
                stream: 'events',
                subscriptionId: sub.id,
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
        if (sub.stream === 'trace' && matchesTraceFilter(entry, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'event',
                stream: 'trace',
                subscriptionId: sub.id,
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

}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function matchesEventFilter(event: BroadcastEventEntry, filter: SubscriptionFilter): boolean {
  if (filter.workflowRunId && event.workflowRunId !== filter.workflowRunId) return false;
  if (filter.rootRunId && event.rootRunId !== filter.rootRunId) return false;
  if (filter.projectId && event.projectId !== filter.projectId) return false;
  if (filter.nodeId && event.nodeId !== filter.nodeId) return false;
  if (filter.tokenId && event.tokenId !== filter.tokenId) return false;
  if (filter.pathId && event.pathId !== filter.pathId) return false;
  if (filter.eventType && event.eventType !== filter.eventType) return false;
  if (filter.eventTypes && !filter.eventTypes.includes(event.eventType)) return false;
  return true;
}

function matchesTraceFilter(event: BroadcastTraceEventEntry, filter: SubscriptionFilter): boolean {
  if (filter.workflowRunId && event.workflowRunId !== filter.workflowRunId) return false;
  if (filter.rootRunId && event.rootRunId !== filter.rootRunId) return false;
  if (filter.projectId && event.projectId !== filter.projectId) return false;
  if (filter.tokenId && event.tokenId !== filter.tokenId) return false;
  if (filter.nodeId && event.nodeId !== filter.nodeId) return false;
  if (filter.category && event.category !== filter.category) return false;
  if (filter.type && event.type !== filter.type) return false;
  if (
    filter.minDurationMs !== undefined &&
    event.durationMs != null &&
    event.durationMs < filter.minDurationMs
  ) {
    return false;
  }
  return true;
}
