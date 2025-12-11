/**
 * Workflows client with enhanced streaming capabilities
 */

import type { Client } from 'openapi-fetch';
import type { EventsClient, SubscriptionFilter } from './events.js';
import type { components, paths } from './generated/schema.js';
import { TraceEventCollection } from './trace-helpers.js';

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
const DEFAULT_IDLE_TIMEOUT_MS = 30000; // 30 seconds
const WEBSOCKET_HANDSHAKE_DELAY_MS = 100;

export type EventEntry = components['schemas']['EventEntry'];
export type TraceEventEntry = components['schemas']['TraceEventEntry'];

export interface StreamOptions {
  /** Event subscription filters */
  subscribe?: SubscriptionFilter;

  /** Predicate to determine when to close connection (in addition to workflow completion/failure) */
  until?: (event: EventEntry) => boolean;

  /** Total timeout in milliseconds */
  timeout?: number;

  /** Idle timeout (max time between events) in milliseconds */
  idleTimeout?: number;
}

export interface StreamResult {
  workflow_run_id: string;
  status: 'completed' | 'failed' | 'timeout' | 'idle_timeout';
  events: EventEntry[];
  traceEvents: TraceEventEntry[];
  trace: TraceEventCollection; // Parsed trace events with ergonomic API
}

type InternalEvent = (EventEntry | TraceEventEntry) & { stream?: 'events' | 'trace' };

interface Subscription {
  close: () => void;
}

/**
 * Create workflows client that extends generated workflows with streaming capabilities
 */
export function createWorkflowsClient(
  generatedWorkflows: ReturnType<typeof import('./generated/client.js').createClient>['workflows'],
  baseUrl: string,
  sdk: Client<paths>,
  eventsClient: EventsClient,
) {
  /**
   * Stream a workflow execution with events
   * Uses two-phase execution to avoid missing early events
   */
  async function streamWorkflow(
    workflowId: string,
    input: unknown,
    options: StreamOptions = {},
  ): Promise<StreamResult> {
    const {
      subscribe = {},
      until,
      timeout = DEFAULT_TIMEOUT_MS,
      idleTimeout = DEFAULT_IDLE_TIMEOUT_MS,
    } = options;

    // Phase 1: Create the workflow run (doesn't start execution)
    const createResponse = await sdk.POST('/api/workflows/{id}/runs', {
      params: { path: { id: workflowId } },
      body: { input: input as Record<string, unknown> },
    });

    if (!createResponse.data?.workflow_run_id) {
      throw new Error(`Failed to create workflow run`);
    }

    const { workflow_run_id } = createResponse.data;

    // Phase 2: Subscribe to events BEFORE starting execution
    return new Promise<StreamResult>((resolve, reject) => {
      const events: EventEntry[] = [];
      const traceEvents: TraceEventEntry[] = [];
      let totalTimer: NodeJS.Timeout | null = null;
      let idleTimer: NodeJS.Timeout | null = null;
      let subscription: Subscription | null = null;

      const cleanup = () => {
        if (totalTimer) clearTimeout(totalTimer);
        if (idleTimer) clearTimeout(idleTimer);
        if (subscription) subscription.close();
      };

      const resolveWithCleanup = (
        status: StreamResult['status'],
        finalEvents = events,
        finalTraceEvents = traceEvents,
      ) => {
        cleanup();
        resolve({
          workflow_run_id,
          status,
          events: finalEvents,
          traceEvents: finalTraceEvents,
          trace: new TraceEventCollection(finalTraceEvents),
        });
      };

      // Set up total timeout
      if (timeout) {
        totalTimer = setTimeout(() => resolveWithCleanup('timeout'), timeout);
      }

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (idleTimeout) {
          idleTimer = setTimeout(() => resolveWithCleanup('idle_timeout'), idleTimeout);
        }
      };

      const eventCallback = (event: InternalEvent) => {
        resetIdleTimer();

        // Collect events by stream type
        if (event.stream === 'trace') {
          traceEvents.push(event as TraceEventEntry);
        } else {
          events.push(event as EventEntry);
        }

        // Check for terminal conditions (only applies to EventEntry, not TraceEventEntry)
        if ('event_type' in event && event.event_type === 'workflow_completed') {
          return resolveWithCleanup('completed');
        }

        if ('event_type' in event && event.event_type === 'workflow_failed') {
          return resolveWithCleanup('failed');
        }

        // Check custom predicate (only EventEntry has event_type for until callback)
        if (until && 'event_type' in event) {
          if (until(event as EventEntry)) {
            return resolveWithCleanup('completed');
          }
        }
      };

      // Subscribe to both events and trace events
      const subscriptions = (['events', 'trace'] as const).map((stream) => ({
        id: stream,
        stream,
        filters: { workflow_run_id, ...subscribe },
        callback: eventCallback,
      }));

      eventsClient
        .subscribe(subscriptions)
        .then((sub) => {
          subscription = sub;
          resetIdleTimer();

          // Phase 3: Start execution (after subscription is established)
          // Small delay to ensure WebSocket handshake completes
          setTimeout(async () => {
            try {
              await sdk.POST('/api/workflows/{id}/runs/{run_id}/start', {
                params: { path: { id: workflowId, run_id: workflow_run_id } },
              });
            } catch (error) {
              cleanup();
              reject(error);
            }
          }, WEBSOCKET_HANDSHAKE_DELAY_MS);
        })
        .catch((error) => {
          cleanup();
          reject(error);
        });
    });
  }

  // Wrap the generatedWorkflows function to add stream method to the returned object
  const wrappedWorkflows = (id: string) => {
    const workflowInstance = generatedWorkflows(id);
    return {
      ...workflowInstance,
      stream: (input: unknown, options?: StreamOptions) => streamWorkflow(id, input, options),
    };
  };

  // Copy over the static methods (create, list, etc.)
  return Object.assign(wrappedWorkflows, generatedWorkflows);
}
