/**
 * Log Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { getLogsRoute } from './spec';

/** /logs */
export const logs = new OpenAPIHono<{ Bindings: Env }>();

/** GET / */
logs.openapi(getLogsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.LOGS.getLogs(query);
  return c.json(result.logs);
});
