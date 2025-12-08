/**
 * Wonder SDK - Type-safe client for the Wonder API
 */

import { createAPIClient } from './client';

export type { APIClient } from './client';
export type * from './generated/schema';

// Export builders
export { node, schema, transition, workflowDef } from './builders';

export function createClient(
  baseUrl: string = process.env.RESOURCES_URL || 'https://wonder-http.ron-keiser.workers.dev',
) {
  return createAPIClient(baseUrl);
}

export const client = createClient();
