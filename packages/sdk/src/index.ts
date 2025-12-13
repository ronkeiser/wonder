/**
 * Wonder SDK - Type-safe client for the Wonder API
 */

import type { Client } from 'openapi-fetch';
import createOpenAPIClient from 'openapi-fetch';
import { EventsClient } from './events';
import { createClient as createGeneratedClient } from './generated/client';
import type { paths } from './generated/schema';
import { createWorkflowsClient } from './workflows';

export {
  action,
  isEmbeddedAction,
  isEmbeddedModelProfile,
  isEmbeddedNode,
  isEmbeddedPromptSpec,
  isEmbeddedTaskDef,
  isEmbeddedWorkflowDef,
  modelProfile,
  node,
  promptSpec,
  schema,
  step,
  task,
  transition,
  workflow,
  type EmbeddedAction,
  type EmbeddedModelProfile,
  type EmbeddedNode,
  type EmbeddedPromptSpec,
  type EmbeddedStep,
  type EmbeddedTaskDef,
  type EmbeddedWorkflowDef,
} from './builders';

export { ApiError } from './generated/client';

export interface WonderClient extends Omit<ReturnType<typeof createGeneratedClient>, 'workflows'> {
  // Events client extends generated events with WebSocket capabilities
  events: EventsClient;

  // Workflows extends generated workflows with streaming capabilities
  workflows: ReturnType<typeof createWorkflowsClient>;

  // Raw HTTP methods
  GET: Client<paths>['GET'];
  POST: Client<paths>['POST'];
  PUT: Client<paths>['PUT'];
  DELETE: Client<paths>['DELETE'];
  PATCH: Client<paths>['PATCH'];
}

/**
 * Create a unified Wonder API client with SDK methods, WebSocket events, and raw HTTP access
 * @param baseUrl - The base URL for the API
 * @param apiKey - The API key for authentication
 */
export function createClient(
  baseUrl: string = process.env.RESOURCES_URL || 'https://wonder-http.ron-keiser.workers.dev',
  apiKey?: string,
): WonderClient {
  const baseClient = createOpenAPIClient<paths>({
    baseUrl,
    headers: apiKey ? { 'X-API-Key': apiKey } : {},
  });
  const sdkClient = createGeneratedClient(baseClient);
  const eventsClient = new EventsClient(baseUrl, baseClient);
  const workflowsClient = createWorkflowsClient(
    sdkClient.workflows,
    baseUrl,
    baseClient,
    eventsClient,
  );

  return {
    ...sdkClient,
    events: eventsClient,
    workflows: workflowsClient,
    GET: baseClient.GET.bind(baseClient),
    POST: baseClient.POST.bind(baseClient),
    PUT: baseClient.PUT.bind(baseClient),
    DELETE: baseClient.DELETE.bind(baseClient),
    PATCH: baseClient.PATCH.bind(baseClient),
  };
}
