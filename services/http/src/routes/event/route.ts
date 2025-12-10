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
