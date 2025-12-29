/**
 * WebSocket client for real-time event streaming
 */

import type { components } from './generated/schema';

const WS_MESSAGE_TYPE = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  EVENT: 'event',
  ERROR: 'error',
} as const;

export interface SubscriptionFilter {
  // Generic execution context
  streamId?: string; // Outer boundary (conversationId or rootRunId)
  executionId?: string; // Specific execution (workflowRunId, turnId, etc.)
  executionType?: 'workflow' | 'conversation';
  projectId?: string;

  // Event classification
  eventType?: string;
  eventTypes?: string[];

  // Trace event specific
  category?: string;
  type?: string;
  minDurationMs?: number;
}

export interface StreamSubscription {
  close(): void;
  onEvent(callback: (event: StreamEvent) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface Subscription {
  id: string;
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
  callback: (event: StreamEvent) => void;
}

export type StreamEvent =
  | components['schemas']['EventEntry']
  | components['schemas']['TraceEventEntry'];

interface WebSocketMessage {
  type: string;
  stream?: 'events' | 'trace';
  subscriptionId?: string;
  event?: StreamEvent;
  message?: string;
}

interface SubscriptionMessage {
  type: string;
  id: string;
  stream?: 'events' | 'trace';
  filters?: SubscriptionFilter;
}

/**
 * WebSocket client for real-time event streaming
 *
 * Connects to per-stream Streamer DOs for live event delivery.
 * For HTTP queries, use the generated client directly (sdk.events.list()).
 */
export class StreamsClient {
  private wsUrl: string;

  constructor(baseUrl: string) {
    this.wsUrl = this.convertToWebSocketUrl(baseUrl);
  }

  private convertToWebSocketUrl(httpUrl: string): string {
    return httpUrl.replace(/^https?:\/\//, (match) => (match === 'https://' ? 'wss://' : 'ws://'));
  }

  private sendSubscriptionMessage(ws: WebSocket, message: SubscriptionMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Ignore errors during message send (WebSocket may be closing)
    }
  }

  private handleWebSocketMessage(
    data: WebSocketMessage,
    callbacks: Map<string, (event: StreamEvent) => void>,
    eventCallbacks: Array<(event: StreamEvent) => void>,
    errorCallbacks: Array<(error: Error) => void>,
  ): void {
    if (data.type === WS_MESSAGE_TYPE.EVENT) {
      if (!data.event) return;

      // Attach stream property to event for routing
      const eventWithStream = { ...data.event, stream: data.stream } as StreamEvent & {
        stream?: 'events' | 'trace';
      };

      // Route to subscription-specific callback
      if (data.subscriptionId) {
        callbacks.get(data.subscriptionId)?.(eventWithStream);
      }

      // Notify general event callbacks
      eventCallbacks.forEach((cb) => cb(eventWithStream));
      return;
    }

    if (data.type === WS_MESSAGE_TYPE.ERROR) {
      const error = new Error(data.message || 'WebSocket error');
      errorCallbacks.forEach((cb) => cb(error));
    }
  }

  /**
   * Subscribe to event/trace stream via WebSocket with server-side filtering
   *
   * @param subscriptions - Array of subscriptions to create
   * @param streamId - Required stream ID to connect to the per-stream Streamer DO
   */
  async subscribe(subscriptions: Subscription[], streamId: string): Promise<StreamSubscription> {
    const url = `${this.wsUrl}/streams/${streamId}`;
    const ws = new WebSocket(url);

    const callbacks = new Map(subscriptions.map((s) => [s.id, s.callback]));
    const errorCallbacks: Array<(error: Error) => void> = [];
    const eventCallbacks: Array<(event: StreamEvent) => void> = [];

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        // Send subscription messages
        subscriptions.forEach((sub) => {
          this.sendSubscriptionMessage(ws, {
            type: WS_MESSAGE_TYPE.SUBSCRIBE,
            id: sub.id,
            stream: sub.stream,
            filters: sub.filters,
          });
        });
        resolve();
      });

      ws.addEventListener('error', () => {
        reject(new Error('WebSocket connection failed'));
      });
    });

    // Handle incoming messages
    ws.addEventListener('message', (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        this.handleWebSocketMessage(data, callbacks, eventCallbacks, errorCallbacks);
      } catch {
        // Ignore parse errors
      }
    });

    // Handle WebSocket errors
    ws.addEventListener('error', () => {
      const error = new Error('WebSocket error');
      errorCallbacks.forEach((cb) => cb(error));
    });

    return {
      close: () => {
        subscriptions.forEach((sub) => {
          this.sendSubscriptionMessage(ws, {
            type: WS_MESSAGE_TYPE.UNSUBSCRIBE,
            id: sub.id,
          });
        });
        ws.close();
      },
      onEvent: (callback) => eventCallbacks.push(callback),
      onError: (callback) => errorCallbacks.push(callback),
    };
  }
}