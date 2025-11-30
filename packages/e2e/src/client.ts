import { createClient } from '@wonder/sdk';

export const client = createClient(
  process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev',
);
