/**
 * Minimal SDK for Wonderful Workflow API
 */

export interface WorkflowInput {
  workflow_id: string;
  input: Record<string, unknown>;
}

export interface WorkflowEvent {
  kind: 'workflow_started' | 'node_started' | 'node_completed' | 'workflow_completed';
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowStartResponse {
  workflow_run_id: string;
  durable_object_id: string;
}

export class WonderfulClient {
  constructor(private baseUrl: string) {}

  /**
   * Start a workflow and return the run ID and DO ID
   */
  async startWorkflow(input: WorkflowInput): Promise<WorkflowStartResponse> {
    const response = await fetch(`${this.baseUrl}/workflows/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Failed to start workflow: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Stream workflow events via WebSocket
   * Returns an async iterator of events
   */
  async *streamEvents(durableObjectId: string): AsyncGenerator<WorkflowEvent> {
    const wsUrl = this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/coordinator/${durableObjectId}/stream`);

    const messageQueue: WorkflowEvent[] = [];
    const resolvers: Array<(value: IteratorResult<WorkflowEvent>) => void> = [];
    let closed = false;
    let error: Error | null = null;
    let closeResolve: (() => void) | null = null;

    ws.addEventListener('message', (event: MessageEvent) => {
      const data = JSON.parse(event.data) as WorkflowEvent;

      // Check for close signal BEFORE queuing/resolving
      const shouldClose = data.kind === 'workflow_completed' && (data.payload as any).close;

      if (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: data, done: false });

        // If this is the close signal and there are MORE pending resolvers,
        // resolve them all as done so the loop exits immediately
        if (shouldClose) {
          while (resolvers.length > 0) {
            const pendingResolve = resolvers.shift()!;
            pendingResolve({ value: undefined as any, done: true });
          }
        }
      } else {
        messageQueue.push(data);
      }

      // Set closed flag immediately so loop exits after yielding this event
      if (shouldClose) {
        closed = true;
        ws.close();
      }
    });

    ws.addEventListener('error', () => {
      error = new Error('WebSocket error');
      closed = true;
      // Resolve any pending promises with error
      while (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: undefined as any, done: true });
      }
    });

    ws.addEventListener('close', () => {
      closed = true;
      // Resolve any pending promises
      while (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: undefined as any, done: true });
      }
      // Resolve close promise if waiting
      if (closeResolve) {
        closeResolve();
        closeResolve = null;
      }
    });

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('Failed to connect')));
    });

    try {
      while (!closed) {
        if (error) throw error;

        if (messageQueue.length > 0) {
          const event = messageQueue.shift()!;
          yield event;
          // Check if we should exit immediately after yielding this event
          if (closed) {
            break;
          }
        } else {
          // Wait for next message
          const result = await new Promise<IteratorResult<WorkflowEvent>>((resolve) => {
            resolvers.push(resolve);
          });

          if (result.done) {
            break;
          }

          yield result.value;
          // Check if we should exit immediately after yielding this event
          if (closed) {
            break;
          }
        }
      }
    } finally {
      // Just close and don't wait - Cloudflare hibernatable WebSockets don't respond to close anyway
      // Caller should use process.exit() if they need immediate termination
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  }

  /**
   * Start a workflow and stream all events
   * Convenience method that combines startWorkflow and streamEvents
   */
  async *executeWorkflow(input: WorkflowInput): AsyncGenerator<WorkflowEvent> {
    const { durable_object_id } = await this.startWorkflow(input);
    yield* this.streamEvents(durable_object_id);
  }
}
