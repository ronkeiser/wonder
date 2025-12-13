import { createClient, createTestClient } from '@wonder/sdk';

const baseUrl = 'https://wonder-http.ron-keiser.workers.dev';
const apiKey = process.env.API_KEY;

export const wonder = Object.assign(createClient(baseUrl, apiKey), {
  test: createTestClient(baseUrl, apiKey),
});
