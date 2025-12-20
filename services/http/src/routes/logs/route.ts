/**
 * Log Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { getLogsRoute } from './spec';

/** /logs */
export const logs = new OpenAPIHono<HttpEnv>();

/** GET / */
logs.openapi(getLogsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.LOGS.getLogs(query);
  return c.json(result);
});

/** GET /stream - WebSocket stream */
logs.get('/stream', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');

  if (upgradeHeader !== 'websocket') {
    return c.json(
      {
        error: 'WebSocket upgrade required',
        receivedUpgrade: upgradeHeader,
      },
      400,
    );
  }

  // Forward to Streamer DO with rewritten path
  const id = c.env.LOGS_STREAMER.idFromName('logs-streamer');
  const stub = c.env.LOGS_STREAMER.get(id);

  // Rewrite the URL to /stream (what the Streamer expects)
  const url = new URL(c.req.url);
  url.pathname = '/stream';
  const request = new Request(url, c.req.raw);

  return stub.fetch(request);
});
