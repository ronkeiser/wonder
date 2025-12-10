/**
 * Workflows client with enhanced streaming capabilities
 */

import type { Client } from 'openapi-fetch';
import type { EventsClient, SubscriptionFilter } from './events.js';
import type { paths } from './generated/schema.js';

export interface StreamOptions {
  /** Event subscription filters */
  subscribe?: SubscriptionFilter;

  /** Predicate to determine when to close connection (in addition to workflow completion/failure) */
  until?: (event: any) => boolean;

  /** Total timeout in milliseconds */
  timeout?: number;

  /** Idle timeout (max time between events) in milliseconds */
  idleTimeout?: number;
}

export interface StreamResult {
  workflow_run_id: string;
  status: 'completed' | 'failed' | 'timeout' | 'idle_timeout';
  events: any[];
  traceEvents: any[];
}

/**
 * Create workflows client that extends generated workflows with streaming capabilities
 */
export function createWorkflowsClient(
  generatedWorkflows: any,
  baseUrl: string,
  sdk: Client<paths>,
  eventsClient: EventsClient,
) {
  /**
   * Stream a workflow execution with events
   * Uses two-phase execution to avoid missing early events
   */
  async function stream(
    workflowId: string,
    input: unknown,
    options: StreamOptions = {},
  ): Promise<StreamResult> {
    const {
      subscribe = {},
      until,
      timeout = 300000, // 5 min default
      idleTimeout = 30000, // 30s default
    } = options;

    // Phase 1: Create the workflow run (doesn't start execution)
    // Note: This endpoint doesn't exist in the generated schema yet
    // Will work after regenerating the SDK
    const createResponse = await sdk.POST(
      '/api/workflows/{id}/runs' as any,
      {
        params: { path: { id: workflowId } },
        body: { input: input as any },
      } as any,
    );

    if (!(createResponse.data as any)?.workflow_run_id) {
      throw new Error('Failed to create workflow run');
    }

    const { workflow_run_id } = createResponse.data as any;

    // Phase 2: Subscribe to events BEFORE starting execution
    const events: any[] = [];
    const traceEvents: any[] = [];

    return new Promise<StreamResult>((resolve, reject) => {
      let totalTimer: NodeJS.Timeout | null = null;
      let idleTimer: NodeJS.Timeout | null = null;
      let status: 'completed' | 'failed' | 'timeout' | 'idle_timeout' = 'completed';
      let subscription: any = null;

      const cleanup = () => {
        if (totalTimer) clearTimeout(totalTimer);
        if (idleTimer) clearTimeout(idleTimer);
        if (subscription) subscription.close();
      };

      // Set up total timeout
      if (timeout) {
        totalTimer = setTimeout(() => {
          cleanup();
          status = 'timeout';
          resolve({ workflow_run_id, status, events, traceEvents });
        }, timeout);
      }

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (idleTimeout) {
          idleTimer = setTimeout(() => {
            cleanup();
            status = 'idle_timeout';
            resolve({ workflow_run_id, status, events, traceEvents });
          }, idleTimeout);
        }
      };

      const eventCallback = (event: any) => {
        resetIdleTimer();

        // Collect events by stream type
        if (event.stream === 'trace') {
          traceEvents.push(event);
        } else {
          events.push(event);
        }

        // Check for terminal conditions
        if (event.event_type === 'workflow_completed') {
          cleanup();
          status = 'completed';
          resolve({ workflow_run_id, status, events, traceEvents });
          return;
        }

        if (event.event_type === 'workflow_failed') {
          cleanup();
          status = 'failed';
          resolve({ workflow_run_id, status, events, traceEvents });
          return;
        }

        // Check custom predicate
        if (until && until(event)) {
          cleanup();
          resolve({ workflow_run_id, status, events, traceEvents });
          return;
        }
      };

      // Subscribe to both events and trace events
      const subscriptions = [
        {
          id: 'events',
          stream: 'events' as const,
          filters: {
            workflow_run_id,
            ...subscribe,
          },
          callback: eventCallback,
        },
        {
          id: 'trace',
          stream: 'trace' as const,
          filters: {
            workflow_run_id,
            ...subscribe,
          },
          callback: eventCallback,
        },
      ];

      eventsClient
        .subscribe(subscriptions)
        .then((sub) => {
          subscription = sub;

          // Start idle timer
          resetIdleTimer();

          // Phase 3: Start execution (after subscription is established)
          // Small delay to ensure WebSocket handshake completes
          setTimeout(async () => {
            try {
              await sdk.POST(
                '/api/workflows/{id}/runs/{run_id}/start' as any,
                {
                  params: { path: { id: workflowId, run_id: workflow_run_id } },
                } as any,
              );
            } catch (error) {
              cleanup();
              reject(error);
            }
          }, 100);
        })
        .catch((error) => {
          cleanup();
          reject(error);
        });
    });
  }

  // Return extended workflows client
  return Object.assign(generatedWorkflows, {
    stream,
  });
}
