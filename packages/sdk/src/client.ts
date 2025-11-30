import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

export function createAPIClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

export type APIClient = ReturnType<typeof createAPIClient>;
