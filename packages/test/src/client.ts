import { createClient } from '@wonder/sdk';

export const wonder = createClient(
  'https://wonder-http.ron-keiser.workers.dev',
  process.env.API_KEY,
);
