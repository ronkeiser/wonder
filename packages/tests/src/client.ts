import { createClient } from '@wonder/sdk';

const baseUrl = 'https://api.wflow.app';
const apiKey = process.env.API_KEY;

export const wonder = createClient(baseUrl, apiKey);
