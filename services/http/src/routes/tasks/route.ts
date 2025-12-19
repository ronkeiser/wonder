/**
 * Tasks Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { createTaskRoute, deleteTaskRoute, getTaskRoute, listTasksRoute } from './spec';

/** /tasks */
export const tasks = new OpenAPIHono<HttpEnv>();

/** POST / */
tasks.openapi(createTaskRoute, async (c) => {
  const validated = c.req.valid('json');
  using tasksResource = c.env.RESOURCES.tasks();
  const result = await tasksResource.create(validated);
  return c.json(result, 201);
});

/** GET / */
tasks.openapi(listTasksRoute, async (c) => {
  const query = c.req.valid('query');
  using tasksResource = c.env.RESOURCES.tasks();
  const result = await tasksResource.list(query);
  return c.json(result);
});

/** GET /{id} */
tasks.openapi(getTaskRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { version } = c.req.valid('query');
  using tasksResource = c.env.RESOURCES.tasks();
  const result = await tasksResource.get(id, version);
  return c.json(result);
});

/** DELETE /{id} */
tasks.openapi(deleteTaskRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { version } = c.req.valid('query');
  using tasksResource = c.env.RESOURCES.tasks();
  const result = await tasksResource.delete(id, version);
  return c.json(result);
});
