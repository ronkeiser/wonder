/**
 * Wonder SDK - Type-safe client for the Wonder API
 */

import createOpenAPIClient from 'openapi-fetch';
import { createClient as createGeneratedClient } from './generated/client';
import type { paths } from './generated/schema';

export type * from './generated/schema';

// Export builders
export { node, schema, transition, workflowDef } from './builders';

// Re-export the generated createClient function
export { createClient } from './generated/client';

/**
 * Create a Wonder API client with the specified base URL
 * @param baseUrl - The base URL for the API
 */
export function createWonderClient(
  baseUrl: string = process.env.RESOURCES_URL || 'https://wonder-http.ron-keiser.workers.dev',
) {
  const baseClient = createOpenAPIClient<paths>({ baseUrl });
  return createGeneratedClient(baseClient);
}

export const client = createWonderClient();
