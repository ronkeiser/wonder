/**
 * WebSocket client for streaming workflow and trace events
 */

import type { Client } from 'openapi-fetch';
import type { paths } from './generated/schema.js';

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
  onEvent(callback: (event: any) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface Subscription {
  id: string;
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
  callback: (event: any) => void;
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
    // Convert HTTP URL to WebSocket URL
    // https://wonder-http.*.workers.dev -> wss://wonder-events.*.workers.dev
    const eventsUrl = baseUrl.replace('wonder-http', 'wonder-events');
    this.wsUrl = eventsUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    this.sdk = sdk;

    // Bind the HTTP list method
    this.list = async (options?) => {
      const response = await this.sdk.GET('/api/events', { params: { query: options || {} } });
      return response.data!;
    };
  }

  /**
   * Subscribe to event/trace stream via WebSocket with server-side filtering
   */
  async subscribe(subscriptions: Subscription[]): Promise<EventStreamSubscription> {
    const ws = new WebSocket(`${this.wsUrl}/stream`);
    const callbacks = new Map(subscriptions.map((s) => [s.id, s.callback]));
    const errorCallbacks: Array<(error: Error) => void> = [];
    const eventCallbacks: Array<(event: any) => void> = [];

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        // Send subscription messages
        for (const sub of subscriptions) {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              id: sub.id,
              stream: sub.stream,
              filters: sub.filters,
            }),
          );
        }
        resolve();
      });

      ws.addEventListener('error', (event) => {
        reject(new Error('WebSocket connection failed'));
      });
    });

    // Handle incoming messages
    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        // Route to subscription-specific callback
        if (data.type === 'event' && data.subscription_id) {
          const callback = callbacks.get(data.subscription_id);
          if (callback) {
            callback(data.event);
          }
        }

        // Also notify general event callbacks
        if (data.type === 'event') {
          for (const cb of eventCallbacks) {
            cb(data.event);
          }
        }

        // Handle errors
        if (data.type === 'error') {
          const error = new Error(data.message || 'WebSocket error');
          for (const cb of errorCallbacks) {
            cb(error);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Handle WebSocket errors
    ws.addEventListener('error', (event) => {
      const error = new Error('WebSocket error');
      for (const cb of errorCallbacks) {
        cb(error);
      }
    });

    return {
      close() {
        // Send unsubscribe messages before closing
        for (const sub of subscriptions) {
          try {
            ws.send(
              JSON.stringify({
                type: 'unsubscribe',
                id: sub.id,
              }),
            );
          } catch (error) {
            // Ignore errors during unsubscribe
          }
        }
        ws.close();
      },
      onEvent(callback) {
        eventCallbacks.push(callback);
      },
      onError(callback) {
        errorCallbacks.push(callback);
      },
    };
  }
}

/**
 * Create events client
 */
export function createEventsClient(baseUrl: string, sdk: Client<paths>): EventsClient {
  return new EventsClient(baseUrl, sdk);
}
