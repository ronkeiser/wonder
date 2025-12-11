import { DurableObject } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { traceEvents, workflowEvents } from './db/schema.js';
import type { EventContext, EventEntry, TraceEventContext, TraceEventEntry } from './types.js';

/**
 * Subscription filter for server-side event filtering
 */
interface SubscriptionFilter {
  // Workflow execution context
  workflow_run_id?: string;
  parent_run_id?: string;
  workspace_id?: string;
  project_id?: string;

  // Event classification
  event_type?: string;
  event_types?: string[];

  // Execution elements
  node_id?: string;
  token_id?: string;
  path_id?: string;

  // Trace event specific
  category?: 'decision' | 'operation' | 'dispatch' | 'sql';
  type?: string;
  min_duration_ms?: number;
}

/**
 * Message sent from client to manage subscriptions
 */
interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  id: string; // Client-provided subscription ID
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
}

/**
 * Active subscription per WebSocket connection
 */
interface Subscription {
  id: string;
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
}

/**
 * Durable Object for managing WebSocket connections to stream events in real-time
 */
export class Streamer extends DurableObject {
  private db = drizzle(this.env.DB);

  /**
   * Handle WebSocket upgrade and initial connection
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket connections on /stream
    if (url.pathname === '/stream') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Store empty subscriptions object in WebSocket metadata for hibernation
      server.serializeAttachment({});
      this.ctx.acceptWebSocket(server);

      // Send recent events (last 5 minutes) to initialize the client
      await this.sendRecentEvents(server);

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

      // Get subscriptions from hibernation-safe WebSocket metadata
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
      console.error('Error handling WebSocket message:', error);
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid subscription message',
        }),
      );
    }
  }

  /**
   * Fetch and send the last 5 minutes of events to a client
   */
  async sendRecentEvents(ws: WebSocket): Promise<void> {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const recentEvents = await this.db
      .select()
      .from(workflowEvents)
      .where(gte(workflowEvents.timestamp, fiveMinutesAgo))
      .orderBy(desc(workflowEvents.timestamp))
      .limit(100);

    if (recentEvents.length > 0) {
      ws.send(
        JSON.stringify({
          type: 'history',
          events: [...recentEvents].reverse(), // Send oldest first
        }),
      );
    }
  }

  /**
   * Broadcast a new event entry to all connected WebSocket clients
   */
  async broadcast(eventEntry: EventEntry): Promise<void> {
    this.ctx.getWebSockets().forEach((ws) => {
      // Get subscriptions from hibernation-safe WebSocket metadata
      const subsObj = (ws.deserializeAttachment() as Record<string, Subscription>) || {};

      // Find matching subscriptions
      for (const sub of Object.values(subsObj)) {
        if (sub.stream === 'events' && this.matchesEventFilter(eventEntry, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'event',
                stream: 'events',
                subscription_id: sub.id,
                event: eventEntry,
              }),
            );
          } catch (error) {
            console.error('Error broadcasting event to WebSocket:', error);
          }
        }
      }
    });
  }

  /**
   * Broadcast trace event to subscribed clients
   */
  async broadcastTraceEvent(traceEntry: TraceEventEntry): Promise<void> {
    this.ctx.getWebSockets().forEach((ws) => {
      // Get subscriptions from hibernation-safe WebSocket metadata
      const subsObj = (ws.deserializeAttachment() as Record<string, Subscription>) || {};

      // Find matching subscriptions
      for (const sub of Object.values(subsObj)) {
        if (sub.stream === 'trace' && this.matchesTraceFilter(traceEntry, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'event',
                stream: 'trace',
                subscription_id: sub.id,
                event: traceEntry,
              }),
            );
          } catch (error) {
            console.error('Error broadcasting trace event to WebSocket:', error);
          }
        }
      }
    });
  }

  /**
   * Check if workflow event matches subscription filter
   */
  private matchesEventFilter(event: EventEntry, filter: SubscriptionFilter): boolean {
    if (filter.workflow_run_id && event.workflow_run_id !== filter.workflow_run_id) return false;
    if (filter.parent_run_id && event.parent_run_id !== filter.parent_run_id) return false;
    if (filter.workspace_id && event.workspace_id !== filter.workspace_id) return false;
    if (filter.project_id && event.project_id !== filter.project_id) return false;
    if (filter.node_id && event.node_id !== filter.node_id) return false;
    if (filter.token_id && event.token_id !== filter.token_id) return false;
    if (filter.path_id && event.path_id !== filter.path_id) return false;
    if (filter.event_type && event.event_type !== filter.event_type) return false;
    if (filter.event_types && !filter.event_types.includes(event.event_type)) return false;

    return true;
  }

  /**
   * Check if trace event matches subscription filter
   */
  private matchesTraceFilter(event: TraceEventEntry, filter: SubscriptionFilter): boolean {
    if (filter.workflow_run_id && event.workflow_run_id !== filter.workflow_run_id) return false;
    if (filter.workspace_id && event.workspace_id !== filter.workspace_id) return false;
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

  /**
   * Handle WebSocket close events
   */
  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }

  /**
   * Handle WebSocket error events
   */
  webSocketError(ws: WebSocket, error: unknown): void {
    console.error('WebSocket error:', error);
  }
}
