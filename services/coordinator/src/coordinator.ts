import { DurableObject } from 'cloudflare:workers';

/**
 * WorkflowCoordinator Durable Object
 */
export class WorkflowCoordinator extends DurableObject {
  private sessions: Set<WebSocket> = new Set();

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

      // Create task
      const task = {
        workflow_run_id: data.workflow_run_id,
        token_id: 'token-' + Date.now(),
        node_id: 'initial-node',
        action_kind: 'llm_call',
        input_data: data.input,
        retry_count: 0,
      };

      console.log(
        `[Coordinator START t+${Date.now() - startTime}ms] Dispatching task via RPC:`,
        JSON.stringify(task),
      );

      // Dispatch work async via waitUntil
      this.ctx.waitUntil(this.processTaskAsync(task));

      console.log(
        `[Coordinator START t+${Date.now() - startTime}ms] Task dispatched, returning response`,
      );

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
      console.log(
        `[Coordinator WS t+${Date.now() - wsStartTime}ms] WebSocket added to sessions, count: ${
          this.sessions.size
        }`,
      );

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
   * Process task asynchronously via RPC to executor
   */
  async processTaskAsync(task: {
    workflow_run_id: string;
    token_id: string;
    node_id: string;
    action_kind: string;
    input_data: Record<string, unknown>;
    retry_count: number;
  }): Promise<void> {
    const taskStartTime = Date.now();
    try {
      console.log(`[Coordinator ASYNC t+0ms] Processing task async:`, JSON.stringify(task));

      // Call executor via RPC
      console.log(`[Coordinator ASYNC t+${Date.now() - taskStartTime}ms] Calling executor RPC`);
      const result = (await this.env.EXECUTOR.executeTask(task)) as {
        task_id: string;
        workflow_run_id: string;
        token_id: string;
        node_id: string;
        success: boolean;
        output_data?: Record<string, unknown>;
        error?: string;
        completed_at: string;
      };
      console.log(
        `[Coordinator ASYNC t+${Date.now() - taskStartTime}ms] Executor RPC returned:`,
        JSON.stringify(result),
      );

      // Process the result
      if (result.success && result.output_data) {
        console.log(
          `[Coordinator ASYNC t+${Date.now() - taskStartTime}ms] Creating completion event`,
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
          `[Coordinator ASYNC t+${Date.now() - taskStartTime}ms] Broadcasting to ${
            this.sessions.size
          } sessions`,
        );
        this.broadcast(completionEvent);
        console.log(
          `[Coordinator ASYNC t+${Date.now() - taskStartTime}ms] Task processing complete`,
        );
      } else {
        console.error(`[Coordinator ASYNC] Task failed or missing output_data`);
      }
    } catch (error) {
      console.error(`[Coordinator ASYNC] Task processing failed:`, error);
    }
  }

  /**
   * Handle alarms for scheduled tasks
   */
  async alarm(): Promise<void> {
    console.log(`Alarm triggered for DO: ${this.ctx.id.toString()}`);
  }
}
