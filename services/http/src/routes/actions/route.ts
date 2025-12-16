/**
 * Action Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { createActionRoute, deleteActionRoute, getActionRoute } from './spec';

/** /actions */
export const actions = new OpenAPIHono<HttpEnv>();

/** POST / */
actions.openapi(createActionRoute, async (c) => {
  const validated = c.req.valid('json');
  using actions = c.env.RESOURCES.actions();
  const result = await actions.create(validated);
  return c.json(result, 201);
});

/** GET /{id} */
actions.openapi(getActionRoute, async (c) => {
  const { id } = c.req.valid('param');
  using actions = c.env.RESOURCES.actions();
  const result = await actions.get(id);
  return c.json(result);
});

/** DELETE /{id} */
actions.openapi(deleteActionRoute, async (c) => {
  const { id } = c.req.valid('param');
  using actions = c.env.RESOURCES.actions();
  await actions.delete(id);
  return c.json({ success: true });
});
