/**
 * Combined test client with SDK + WebSocket event helpers
 */

import createClient from 'openapi-fetch';
import { createClient as createWonderClient } from '../generated/client.js';
import type { paths } from '../generated/schema.js';
import { createEventsTestingClient, type EventsTestingClient } from './events-client.js';

export interface WonderTestClient {
  // Re-export all SDK methods except events (which we're overriding)
  workspaces: ReturnType<typeof createWonderClient>['workspaces'];
  projects: ReturnType<typeof createWonderClient>['projects'];
  actions: ReturnType<typeof createWonderClient>['actions'];
  'prompt-specs': ReturnType<typeof createWonderClient>['prompt-specs'];
  'model-profiles': ReturnType<typeof createWonderClient>['model-profiles'];
  'workflow-defs': ReturnType<typeof createWonderClient>['workflow-defs'];
  workflows: ReturnType<typeof createWonderClient>['workflows'];

  // Override events with our WebSocket client
  events: EventsTestingClient;

  /**
   * Helper: Run workflow to completion and return events
   */
  runWorkflow(
    workflowId: string,
    input: unknown,
    options?: { timeout?: number },
  ): Promise<{
    workflow_run_id: string;
    status: 'completed' | 'failed';
    events: any[];
    traceEvents: any[];
  }>;
}

/**
 * Create Wonder test client with SDK + WebSocket helpers
 */
export function createWonderTestClient(baseUrl: string): WonderTestClient {
  const baseClient = createClient<paths>({ baseUrl });
  const wonder = createWonderClient(baseClient);
  const eventsClient = createEventsTestingClient(baseUrl);

  return {
    workspaces: wonder.workspaces,
    projects: wonder.projects,
    actions: wonder.actions,
    'prompt-specs': wonder['prompt-specs'],
    'model-profiles': wonder['model-profiles'],
    'workflow-defs': wonder['workflow-defs'],
    workflows: wonder.workflows,
    events: eventsClient,

    async runWorkflow(workflowId, input, options = {}) {
      // Start workflow using SDK
      const response = await wonder.workflows(workflowId).start(input as any);

      if (!response?.workflow_run_id) {
        throw new Error('Failed to start workflow');
      }

      const workflow_run_id = response.workflow_run_id;

      // Wait for completion via WebSocket
      const status = await eventsClient.waitForCompletion(workflow_run_id, options);

      // Fetch all events and trace events
      // Note: These endpoints need to be added to the HTTP service
      const [eventsData, traceData] = await Promise.all([
        baseClient.GET('/api/events', {
          params: { query: { workflow_run_id } },
        }),
        baseClient.GET('/api/events/trace', {
          params: { query: { workflow_run_id } },
        }),
      ]);

      return {
        workflow_run_id,
        status,
        events: eventsData.data?.events || [],
        traceEvents: traceData.data?.events || [],
      };
    },
  };
}
