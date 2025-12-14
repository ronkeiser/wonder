import { createClient } from '@wonder/sdk';

const baseUrl = 'https://wonder-http.ron-keiser.workers.dev';
const apiKey = process.env.API_KEY;

export const wonder = createClient(baseUrl, apiKey);
