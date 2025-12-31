/**
 * Streams Hono Router
 * Generic WebSocket streaming endpoint for any execution context
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';

/** /streams */
export const streams = new OpenAPIHono<HttpEnv>();

/** GET /status - WebSocket connection to Broadcaster for execution status updates */
streams.get('/status', async (c) => {
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

  // Route to singleton Broadcaster DO
  const doId = c.env.BROADCASTER.idFromName('global');
  const stub = c.env.BROADCASTER.get(doId);

  // Rewrite the URL to /stream (what Broadcaster expects)
  const url = new URL(c.req.url);
  url.pathname = '/stream';
  const request = new Request(url, c.req.raw);

  return stub.fetch(request);
});

/** GET /:streamId - WebSocket connection for real-time event streaming */
streams.get('/:streamId', async (c) => {
  const streamId = c.req.param('streamId');
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

  // Route to per-stream Streamer DO
  const doId = c.env.EVENTS_STREAMER.idFromName(streamId);
  const stub = c.env.EVENTS_STREAMER.get(doId);

  // Rewrite the URL to /stream (what Streamer expects)
  const url = new URL(c.req.url);
  url.pathname = '/stream';
  const request = new Request(url, c.req.raw);

  return stub.fetch(request);
});