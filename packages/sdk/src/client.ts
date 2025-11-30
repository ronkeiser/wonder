import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';
import { createWorkspacesCollection } from './resources/workspaces';

export function createAPIClient(baseUrl: string) {
  const baseClient = createClient<paths>({ baseUrl });

  // Enhanced client with resource methods AND original HTTP methods
  const enhancedClient = Object.assign(baseClient, {
    workspaces: createWorkspacesCollection(baseClient),
  });

  return enhancedClient;
}

export type APIClient = ReturnType<typeof createAPIClient>;
