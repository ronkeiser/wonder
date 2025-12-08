import { createClient as createWonderClient } from '@wonder/sdk/generated/client';
import type { paths } from '@wonder/sdk/schema';
import createClient from 'openapi-fetch';

const baseClient = createClient<paths>({
  baseUrl: process.env.RESOURCES_URL || 'https://wonder-http.ron-keiser.workers.dev',
});

export const wonder = createWonderClient(baseClient);
export const client = baseClient; // Keep for backwards compatibility if needed
