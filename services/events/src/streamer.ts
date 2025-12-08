import { DurableObject } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { workflowEvents } from './db/schema.js';
import uiHTML from './web/ui.html';

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

    // Serve the UI on the root path
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(uiHTML, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Handle WebSocket connections on /stream
    if (url.pathname === '/stream') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

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
  broadcast(eventEntry: unknown): void {
    const message = JSON.stringify({
      type: 'event',
      event: eventEntry,
    });

    this.ctx.getWebSockets().forEach((ws) => {
      try {
        ws.send(message);
      } catch (error) {
        console.error('Error broadcasting to WebSocket:', error);
      }
    });
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
