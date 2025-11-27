/**
 * Minimal SDK for Wonderful Workflow API
 *
 * Note on WebSocket lifecycle:
 * WebSockets keep the Node.js event loop alive even after close() is called.
 * In CLI scripts, explicitly call process.exit() after consuming all events.
 * This is expected behavior - WebSockets maintain connections for bidirectional
 * communication and don't auto-terminate.
 */

export interface WorkflowInput {
  workflow_id: string;
  input: Record<string, unknown>;
}

export interface WorkflowEvent {
  kind:
    | 'workflow_started'
    | 'workflow_completed'
    | 'workflow_failed'
    | 'node_started'
    | 'node_completed'
    | 'node_failed'
    | 'token_spawned'
    | 'token_merged'
    | 'token_cancelled'
    | 'subworkflow_started'
    | 'subworkflow_completed'
    | 'artifact_created'
    | 'context_updated';
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
    const response = await fetch(`${this.baseUrl}/api/workflows/${input.workflow_id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.input),
    });

    if (!response.ok) {
      throw new Error(`Failed to start workflow: ${response.statusText}`);
    }

    return (await response.json()) as WorkflowStartResponse;
  }

  /**
   * Stream workflow events via WebSocket
   * Returns an async iterator of events
   */
  async *streamEvents(durableObjectId: string): AsyncGenerator<WorkflowEvent> {
    const wsUrl = this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/api/coordinator/${durableObjectId}/stream`);

    const messageQueue: WorkflowEvent[] = [];
    const resolvers: Array<(value: IteratorResult<WorkflowEvent>) => void> = [];
    let closed = false;
    let error: Error | null = null;

    ws.addEventListener('message', (event: MessageEvent) => {
      const data = JSON.parse(event.data) as WorkflowEvent;

      // Check if workflow is complete
      const isComplete = data.kind === 'workflow_completed';

      if (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: data, done: false });
      } else {
        messageQueue.push(data);
      }

      // Mark as closed after workflow completes
      // The generator will exit after yielding this final event
      if (isComplete) {
        closed = true;
      }
    });

    ws.addEventListener('error', () => {
      error = new Error('WebSocket error');
      closed = true;
      while (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: undefined as any, done: true });
      }
    });

    ws.addEventListener('close', () => {
      closed = true;
      while (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value: undefined as any, done: true });
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
          if (closed) break;
        } else {
          // Wait for next message
          const result = await new Promise<IteratorResult<WorkflowEvent>>((resolve) => {
            resolvers.push(resolve);
          });

          if (result.done) break;

          yield result.value;
          if (closed) break;
        }
      }
    } finally {
      // Close WebSocket if still open
      // Note: WebSocket keeps Node.js event loop alive even after close() is called
      // In CLI scripts, use process.exit() after the async generator completes
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
