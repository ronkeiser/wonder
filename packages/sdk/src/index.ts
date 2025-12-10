/**
 * Wonder SDK - Type-safe client for the Wonder API
 */

import type { Client } from 'openapi-fetch';
import createOpenAPIClient from 'openapi-fetch';
import { EventsClient } from './events';
import { createClient as createGeneratedClient } from './generated/client';
import type { paths } from './generated/schema';

export type * from './generated/schema';

// Export builders
export { node, schema, transition, workflowDef } from './builders';

// Export types
export type {
  EventsClient,
  EventStreamSubscription,
  Subscription,
  SubscriptionFilter,
} from './events';

/**
 * Unified Wonder client with SDK methods, WebSocket events, and raw HTTP access
 */
export interface WonderClient extends ReturnType<typeof createGeneratedClient> {
  // Events client extends generated events with WebSocket capabilities
  events: EventsClient;

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
 */
export function createClient(
  baseUrl: string = process.env.RESOURCES_URL || 'https://wonder-http.ron-keiser.workers.dev',
): WonderClient {
  const baseClient = createOpenAPIClient<paths>({ baseUrl });
  const sdkClient = createGeneratedClient(baseClient);
  const eventsClient = new EventsClient(baseUrl, baseClient);

  return {
    ...sdkClient,
    events: eventsClient,
    GET: baseClient.GET.bind(baseClient),
    POST: baseClient.POST.bind(baseClient),
    PUT: baseClient.PUT.bind(baseClient),
    DELETE: baseClient.DELETE.bind(baseClient),
    PATCH: baseClient.PATCH.bind(baseClient),
  };
}

export const client = createClient();
