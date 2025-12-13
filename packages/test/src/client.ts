import { createClient, createTestClient } from '@wonder/sdk';

export const wonder = createClient(
  'https://wonder-http.ron-keiser.workers.dev',
  process.env.API_KEY,
);

export const testClient = createTestClient(
  'https://wonder-http.ron-keiser.workers.dev',
  process.env.API_KEY,
);
