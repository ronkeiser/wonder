/**
 * Events Testing Client - WebSocket subscription helpers for E2E tests
 */

import type { Client } from 'openapi-fetch';
import type { paths } from '../generated/schema';

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

export interface EventsTestingClient {
  /**
   * Subscribe to event/trace stream via WebSocket with server-side filtering
   */
  subscribe(
    subscriptions: Array<{
      id: string;
      stream: 'events' | 'trace';
      filters: SubscriptionFilter;
      callback: (event: any) => void;
    }>,
  ): Promise<EventStreamSubscription>;

  /**
   * Wait for any event matching predicate via WebSocket subscription
   */
  waitForEvent(
    workflowRunId: string,
    predicate: (event: any) => boolean,
    options?: { timeout?: number; stream?: 'events' | 'trace' },
  ): Promise<any>;

  /**
   * Wait for workflow completion via WebSocket subscription
   */
  waitForCompletion(
    workflowRunId: string,
    options?: { timeout?: number },
  ): Promise<'completed' | 'failed'>;
}

/**
 * Create events testing client
 */
export function createEventsTestingClient(
  baseUrl: string,
  sdk: Client<paths>,
): EventsTestingClient {
  const eventsUrl = baseUrl.replace('wonder-http', 'wonder-events');
  const wsUrl = eventsUrl.replace('https://', 'wss://').replace('http://', 'ws://');

  return {
    /**
     * Subscribe to event/trace stream via WebSocket with server-side filtering.
     * Returns a subscription object that can be closed.
     */
    async subscribe(subscriptions) {
      const ws = new WebSocket(`${wsUrl}/stream`);
      const callbacks = new Map(subscriptions.map((s) => [s.id, s.callback]));

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

        ws.addEventListener('error', () => {
          reject(new Error('WebSocket connection failed'));
        });
      });

      // Handle incoming messages
      ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'event' && data.subscription_id) {
          const callback = callbacks.get(data.subscription_id);
          if (callback) {
            callback(data.event);
          }
        }
      });

      return {
        close() {
          ws.close();
        },
        onEvent(callback) {
          ws.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'event') {
              callback(data.event);
            }
          });
        },
        onError(callback) {
          ws.addEventListener('error', () => {
            callback(new Error('WebSocket error'));
          });
        },
      };
    },

    /**
     * Wait for any event matching predicate via WebSocket subscription.
     * Returns the first event that matches the predicate.
     */
    async waitForEvent(workflowRunId, predicate, options = {}) {
      const timeout = options.timeout ?? 30000;
      const stream = options.stream ?? 'events';

      let subscription: EventStreamSubscription | null = null;

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          subscription?.close();
          reject(new Error(`Timeout waiting for event after ${timeout}ms`));
        }, timeout);

        this.subscribe([
          {
            id: 'wait-event',
            stream,
            filters: { workflow_run_id: workflowRunId },
            callback: (event) => {
              if (predicate(event)) {
                clearTimeout(timeoutId);
                subscription?.close();
                resolve(event);
              }
            },
          },
        ])
          .then((sub) => {
            subscription = sub;
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
      });
    },

    /**
     * Wait for workflow completion via WebSocket subscription.
     * Returns 'completed' or 'failed' based on the completion event.
     */
    async waitForCompletion(workflowRunId, options = {}) {
      // First check if already completed via HTTP to avoid race condition
      const response = await sdk.GET('/api/events', {
        params: {
          query: {
            workflow_run_id: workflowRunId,
            event_type: 'workflow_completed,workflow_failed',
          },
        },
      });

      if (response.data?.events && response.data.events.length > 0) {
        const event = response.data.events[0];
        return event.event_type === 'workflow_completed' ? 'completed' : 'failed';
      }

      // Not completed yet, subscribe and wait
      const event = await this.waitForEvent(
        workflowRunId,
        (e) => e.event_type === 'workflow_completed' || e.event_type === 'workflow_failed',
        options,
      );

      return event.event_type === 'workflow_completed' ? 'completed' : 'failed';
    },
  };
}
