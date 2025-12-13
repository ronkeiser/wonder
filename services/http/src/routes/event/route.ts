/**
 * Event Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { getEventsRoute, getTraceEventsRoute } from './spec';

/** /events */
export const events = new OpenAPIHono<{ Bindings: Env }>();

/** GET / - Query workflow events */
events.openapi(getEventsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.EVENTS.getEvents(query);
  return c.json(result);
});

/** GET /trace - Query trace events */
events.openapi(getTraceEventsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.EVENTS.getTraceEvents(query);
  return c.json(result);
});

/** GET /stream - WebSocket stream */
events.get('/stream', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');

  if (upgradeHeader !== 'websocket') {
    return c.json(
      {
        error: 'WebSocket upgrade required',
        received_upgrade: upgradeHeader,
      },
      400,
    );
  }

  // Forward to Streamer DO with rewritten path
  const id = c.env.EVENTS_STREAMER.idFromName('events-streamer');
  const stub = c.env.EVENTS_STREAMER.get(id);

  // Rewrite the URL to /stream (what the Streamer expects)
  const url = new URL(c.req.url);
  url.pathname = '/stream';
  const request = new Request(url, c.req.raw);

  return stub.fetch(request);
});
