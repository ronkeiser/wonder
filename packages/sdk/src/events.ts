/**
 * WebSocket client for streaming workflow and trace events
 */

import type { Client } from 'openapi-fetch';
import type { paths } from './generated/schema.js';

const WS_MESSAGE_TYPE = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  EVENT: 'event',
  ERROR: 'error',
} as const;

export interface SubscriptionFilter {
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

export interface EventStreamSubscription {
  close(): void;
  onEvent(callback: (event: WorkflowEvent) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface Subscription {
  id: string;
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
  callback: (event: WorkflowEvent) => void;
}

export interface WorkflowEvent {
  event_type: string;
  [key: string]: unknown;
}

interface WebSocketMessage {
  type: string;
  subscription_id?: string;
  event?: WorkflowEvent;
  message?: string;
}

interface SubscriptionMessage {
  type: string;
  id: string;
  stream?: 'events' | 'trace';
  filters?: SubscriptionFilter;
}

/**
 * Events client for HTTP queries and WebSocket subscriptions
 *
 * Provides both snapshot queries (HTTP) and real-time streaming (WebSocket)
 * for workflow events and trace events.
 */
export class EventsClient {
  private wsUrl: string;
  private sdk: Client<paths>;

  // HTTP query method from generated client
  list: (
    options?: paths['/api/events']['get']['parameters']['query'],
  ) => Promise<paths['/api/events']['get']['responses']['200']['content']['application/json']>;

  constructor(baseUrl: string, sdk: Client<paths>) {
    this.wsUrl = this.convertToWebSocketUrl(baseUrl);
    this.sdk = sdk;

    // Bind the HTTP list method
    this.list = async (options?) => {
      const response = await this.sdk.GET('/api/events', { params: { query: options || {} } });
      return response.data!;
    };
  }

  private convertToWebSocketUrl(httpUrl: string): string {
    return httpUrl
      .replace('wonder-http', 'wonder-events')
      .replace(/^https?:\/\//, (match) => (match === 'https://' ? 'wss://' : 'ws://'));
  }

  private sendSubscriptionMessage(ws: WebSocket, message: SubscriptionMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      // Ignore errors during message send (WebSocket may be closing)
    }
  }

  private handleWebSocketMessage(
    data: WebSocketMessage,
    callbacks: Map<string, (event: WorkflowEvent) => void>,
    eventCallbacks: Array<(event: WorkflowEvent) => void>,
    errorCallbacks: Array<(error: Error) => void>,
  ): void {
    if (data.type === WS_MESSAGE_TYPE.EVENT) {
      if (!data.event) return;

      // Route to subscription-specific callback
      if (data.subscription_id) {
        callbacks.get(data.subscription_id)?.(data.event);
      }

      // Notify general event callbacks
      eventCallbacks.forEach((cb) => cb(data.event!));
      return;
    }

    if (data.type === WS_MESSAGE_TYPE.ERROR) {
      const error = new Error(data.message || 'WebSocket error');
      errorCallbacks.forEach((cb) => cb(error));
    }
  }

  /**
   * Subscribe to event/trace stream via WebSocket with server-side filtering
   */
  async subscribe(subscriptions: Subscription[]): Promise<EventStreamSubscription> {
    const ws = new WebSocket(`${this.wsUrl}/stream`);
    const callbacks = new Map(subscriptions.map((s) => [s.id, s.callback]));
    const errorCallbacks: Array<(error: Error) => void> = [];
    const eventCallbacks: Array<(event: WorkflowEvent) => void> = [];

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
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
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

/**
 * Create events client
 */
export function createEventsClient(baseUrl: string, sdk: Client<paths>): EventsClient {
  return new EventsClient(baseUrl, sdk);
}
