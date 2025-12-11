import type { DurableObjectState, WebSocket } from '@cloudflare/workers-types';

/**
 * Base message types that all streamers support
 */
export interface Message {
  type: string;
}

export interface AuthMessage extends Message {
  type: 'auth';
  token: string;
}

/**
 * WebSocket connection state
 */
interface ConnectionState {
  authenticated: boolean;
  [key: string]: unknown;
}

/**
 * Base Durable Object for WebSocket streaming with authentication
 *
 * Handles:
 * - WebSocket upgrade
 * - First-message authentication
 * - Connection lifecycle (close, error)
 * - Hibernation-safe state via serializeAttachment
 *
 * Services extend this and implement:
 * - validateAuth(token): Promise<boolean>
 * - handleMessage(ws, message, state): void
 * - broadcast hooks (service-specific)
 */
export abstract class Streamer {
  protected ctx: DurableObjectState;
  protected env: any;

  constructor(ctx: DurableObjectState, env: any) {
    this.ctx = ctx;
    this.env = env;
  }

  /**
   * Validate authentication token
   * Override this in subclasses to implement service-specific auth
   */
  protected abstract validateAuth(token: string): Promise<boolean>;

  /**
   * Handle authenticated messages
   * Override this in subclasses to implement service-specific message handling
   */
  protected abstract handleMessage(ws: WebSocket, message: Message, state: ConnectionState): void;

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

      // @ts-expect-error - WebSocketPair is a Cloudflare Workers global
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      // Initialize connection state (not authenticated yet)
      const initialState: ConnectionState = {
        authenticated: false,
      };
      (server as any).serializeAttachment(initialState);
      this.ctx.acceptWebSocket(server as any);

      return new Response(null, {
        status: 101,
        webSocket: client,
      } as any);
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle incoming WebSocket messages
   * First message must be auth, subsequent messages handled by subclass
   */
  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    try {
      const msg = JSON.parse(message) as Message;
      const state = ((ws as any).deserializeAttachment() as ConnectionState) || {
        authenticated: false,
      };

      // First message must be auth
      if (!state.authenticated) {
        if (msg.type !== 'auth') {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'First message must be auth',
            }),
          );
          ws.close(1008, 'Authentication required');
          return;
        }

        const authMsg = msg as AuthMessage;
        const valid = await this.validateAuth(authMsg.token);

        if (!valid) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid authentication token',
            }),
          );
          ws.close(1008, 'Authentication failed');
          return;
        }

        // Mark as authenticated
        state.authenticated = true;
        (ws as any).serializeAttachment(state);

        ws.send(
          JSON.stringify({
            type: 'auth',
            success: true,
          }),
        );
        return;
      }

      // Authenticated - handle message in subclass
      this.handleMessage(ws, msg, state);
      (ws as any).serializeAttachment(state);
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }),
      );
    }
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

  /**
   * Get all authenticated WebSocket connections
   */
  protected getAuthenticatedSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws: WebSocket) => {
      const state = (ws as any).deserializeAttachment() as ConnectionState;
      return state?.authenticated === true;
    });
  }
}
