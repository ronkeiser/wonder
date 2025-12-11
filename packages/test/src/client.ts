import { createClient } from '@wonder/sdk';

export const wonder = createClient(
  process.env.RESOURCES_URL || 'https://wonder-http.ron-keiser.workers.dev',
);
