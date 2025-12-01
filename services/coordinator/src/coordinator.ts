import { DurableObject } from 'cloudflare:workers';
import { ContextManager } from './context.js';
import { handleTaskResults } from './results.js';
import { TokenManager } from './tokens.js';
import type { TaskResult } from './types.js';

/**
 * WorkflowCoordinator Durable Object
 */
export class WorkflowCoordinator extends DurableObject {
  private sessions: Set<WebSocket> = new Set();
  private lastCompletionEvent?: {
    kind: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };

  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          id: this.ctx.id.toString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Start workflow execution
    if (url.pathname === '/start' && request.method === 'POST') {
      const startTime = Date.now();
      console.log(`[Coordinator START t+0ms] Received start request`);
      
      const data = (await request.json()) as {
        workflow_run_id: string;
        input: Record<string, unknown>;
      };
      console.log(`[Coordinator START t+${Date.now() - startTime}ms] Parsed request body`);

      // Send task to executor queue
      const task = {
        workflow_run_id: data.workflow_run_id,
        token_id: 'token-' + Date.now(),
        node_id: 'initial-node',
        action_kind: 'llm_call',
        input_data: data.input,
        retry_count: 0,
      };

      console.log(`[Coordinator START t+${Date.now() - startTime}ms] Sending task to TASKS queue:`, JSON.stringify(task));
      await this.env.TASKS.send(task);
      console.log(`[Coordinator START t+${Date.now() - startTime}ms] Task sent successfully, returning response`);

      return new Response(JSON.stringify({ status: 'started' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const wsStartTime = Date.now();
      console.log(`[Coordinator WS t+0ms] WebSocket upgrade requested`);
      
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      console.log(`[Coordinator WS t+${Date.now() - wsStartTime}ms] WebSocketPair created`);

      this.ctx.acceptWebSocket(server);
      console.log(`[Coordinator WS t+${Date.now() - wsStartTime}ms] WebSocket accepted`);
      
      this.sessions.add(server);
      console.log(`[Coordinator WS t+${Date.now() - wsStartTime}ms] WebSocket added to sessions, count: ${this.sessions.size}`);

      // If workflow already completed, send the completion event immediately
      if (this.lastCompletionEvent) {
        console.log(`[Coordinator WS t+${Date.now() - wsStartTime}ms] Sending stored completion event to new session`);
        server.send(JSON.stringify(this.lastCompletionEvent));
        console.log(`[Coordinator WS t+${Date.now() - wsStartTime}ms] Stored event sent`);
      } else {
        console.log(`[Coordinator WS t+${Date.now() - wsStartTime}ms] No stored completion event yet`);
      }

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // For now, just echo back - in the future this could handle commands
    console.log('WebSocket message received:', message);
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    this.sessions.delete(ws);
    ws.close(code, reason);
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    this.sessions.delete(ws);
  }

  /**
   * Broadcast event to all connected WebSocket clients
   */
  private broadcast(event: {
    kind: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): void {
    const message = JSON.stringify(event);
    for (const session of this.sessions) {
      try {
        session.send(message);
      } catch (error) {
        console.error('Failed to send to WebSocket:', error);
        this.sessions.delete(session);
      }
    }
  }

  /**
   * Process task results
   */
  async processResults(results: TaskResult[]): Promise<void> {
    const processTime = Date.now();
    console.log(
      `[Coordinator processResults t+0ms] RPC method called with ${results.length} results, sessions count: ${this.sessions.size}`,
    );

    // For minimal implementation: skip context/token management
    // Just broadcast workflow completion event
    for (const result of results) {
      console.log(`[Coordinator processResults t+${Date.now() - processTime}ms] Processing result:`, JSON.stringify(result));
      if (result.success && result.output_data) {
        console.log(
          `[Coordinator processResults t+${
            Date.now() - processTime
          }ms] Creating completion event`,
        );
        const completionEvent = {
          kind: 'workflow_completed',
          payload: {
            full_context: {
              output: result.output_data,
            },
          },
        };
        console.log(
          `[Coordinator processResults t+${
            Date.now() - processTime
          }ms] Storing completion event`,
        );
        this.lastCompletionEvent = completionEvent;
        console.log(
          `[Coordinator processResults t+${
            Date.now() - processTime
          }ms] Broadcasting to ${this.sessions.size} sessions`,
        );
        this.broadcast(completionEvent);
        console.log(
          `[Coordinator processResults t+${
            Date.now() - processTime
          }ms] Broadcast complete`,
        );
      } else {
        console.log(`[Coordinator processResults t+${Date.now() - processTime}ms] Result not successful or missing output_data`);
      }
    }
    console.log(`[Coordinator processResults t+${Date.now() - processTime}ms] processResults method returning`);
  }

  /**
   * Handle alarms for scheduled tasks
   */
  async alarm(): Promise<void> {
    console.log(`Alarm triggered for DO: ${this.ctx.id.toString()}`);
  }
}
