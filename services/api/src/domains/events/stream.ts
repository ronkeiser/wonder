/** WebSocket event streaming */

import type { EventKind } from './types';

/**
 * EventStreamer manages WebSocket connections and broadcasts events
 */
export class EventStreamer {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * Handle WebSocket upgrade request
   */
  handleUpgrade(request: Request, workflowRunId?: string): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Accept WebSocket connection
    this.state.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Broadcast event to all connected WebSocket clients
   */
  broadcast(kind: EventKind, payload: Record<string, unknown>): void {
    const sockets = this.state.getWebSockets();
    const message = JSON.stringify({
      kind,
      payload,
      timestamp: new Date().toISOString(),
    });

    for (const ws of sockets) {
      try {
        ws.send(message);
      } catch (err) {
        // Log error but continue broadcasting to other clients
        console.error('websocket_send_failed', err);
      }
    }
  }
}
