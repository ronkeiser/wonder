import { DurableObject } from 'cloudflare:workers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { logs } from './db/schema.js';

/**
 * Durable Object for managing WebSocket connections to stream logs in real-time
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

      this.ctx.acceptWebSocket(server);

      // Send recent logs (last 5 minutes) to initialize the client
      await this.sendRecentLogs(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Fetch and send the last 5 minutes of logs to a client
   */
  async sendRecentLogs(ws: WebSocket): Promise<void> {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const recentLogs = await this.db
      .select()
      .from(logs)
      .where(gte(logs.timestamp, fiveMinutesAgo))
      .orderBy(desc(logs.timestamp))
      .limit(100);

    if (recentLogs.length > 0) {
      ws.send(
        JSON.stringify({
          type: 'history',
          logs: [...recentLogs].reverse(), // Send oldest first
        }),
      );
    }
  }

  /**
   * Broadcast a new log entry to all connected WebSocket clients
   */
  broadcast(logEntry: unknown): void {
    const message = JSON.stringify({
      type: 'log',
      log: logEntry,
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
