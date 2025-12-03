/**
 * Project Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { createProjectRoute, deleteProjectRoute, getProjectRoute } from './spec';

/** /projects */
export const projects = new OpenAPIHono<{ Bindings: Env }>();

/** POST / */
projects.openapi(createProjectRoute, async (c) => {
  const validated = c.req.valid('json');
  using projects = c.env.RESOURCES.projects();
  const result = await projects.create(validated);
  return c.json(result, 201);
});

/** GET /{id} */
projects.openapi(getProjectRoute, async (c) => {
  const { id } = c.req.valid('param');
  using projects = c.env.RESOURCES.projects();
  const result = await projects.get(id);
  return c.json(result);
});

/** DELETE /{id} */
projects.openapi(deleteProjectRoute, async (c) => {
  const { id } = c.req.valid('param');
  using projects = c.env.RESOURCES.projects();
  await projects.delete(id);
  return c.json({ success: true });
});
