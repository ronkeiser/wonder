/**
 * Event Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { getEventsRoute, getTraceEventsRoute } from './spec';

/** /events */
export const events = new OpenAPIHono<HttpEnv>();

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

/** GET /stream - Reserved for future global streamer */
events.get('/stream', async (c) => {
  return c.json(
    {
      error: 'Not Implemented',
      message: 'Global event streaming is not yet implemented. Use /workflow-runs/{id}/stream for per-run streaming.',
    },
    501,
  );
});
