/**
 * Wonder SDK - Type-safe client for the Wonder API
 */

import type { Client } from 'openapi-fetch';
import createOpenAPIClient from 'openapi-fetch';
import { createClient as createGeneratedClient } from './generated/client';
import type { components, paths } from './generated/schema';
import { StreamsClient } from './streams';

// Re-export common schema types for convenience
export type EventEntry = components['schemas']['EventEntry'];
export type TraceEventEntry = components['schemas']['TraceEventEntry'];

export {
  action,
  isEmbeddedAction,
  isEmbeddedModelProfile,
  isEmbeddedNode,
  isEmbeddedPromptSpec,
  isEmbeddedTask,
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
  type EmbeddedTask,
  type EmbeddedWorkflowDef,
} from './builders';

export { ApiError } from './generated/client';

export type { StreamEvent, StreamSubscription, Subscription, SubscriptionFilter } from './streams';

export interface WonderClient extends ReturnType<typeof createGeneratedClient> {
  // WebSocket streaming client
  streams: StreamsClient;

  // Raw HTTP methods
  GET: Client<paths>['GET'];
  POST: Client<paths>['POST'];
  PUT: Client<paths>['PUT'];
  DELETE: Client<paths>['DELETE'];
  PATCH: Client<paths>['PATCH'];
}

/**
 * Create a unified Wonder API client with SDK methods, WebSocket streaming, and raw HTTP access
 * @param baseUrl - The base URL for the API
 * @param apiKey - The API key for authentication
 */
export function createClient(
  baseUrl: string = process.env.RESOURCES_URL || 'https://api.wflow.app',
  apiKey?: string,
): WonderClient {
  const baseClient = createOpenAPIClient<paths>({
    baseUrl,
    headers: apiKey ? { 'X-API-Key': apiKey } : {},
  });
  const sdkClient = createGeneratedClient(baseClient);
  const streamsClient = new StreamsClient(baseUrl);

  return {
    ...sdkClient,
    streams: streamsClient,
    GET: baseClient.GET.bind(baseClient),
    POST: baseClient.POST.bind(baseClient),
    PUT: baseClient.PUT.bind(baseClient),
    DELETE: baseClient.DELETE.bind(baseClient),
    PATCH: baseClient.PATCH.bind(baseClient),
  };
}