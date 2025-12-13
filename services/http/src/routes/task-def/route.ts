/**
 * TaskDef Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { createTaskDefRoute, deleteTaskDefRoute, getTaskDefRoute, listTaskDefsRoute } from './spec';

/** /task-defs */
export const taskDefs = new OpenAPIHono<{ Bindings: Env }>();

/** POST / */
taskDefs.openapi(createTaskDefRoute, async (c) => {
  const validated = c.req.valid('json');
  using taskDefs = c.env.RESOURCES.taskDefs();
  const result = await taskDefs.create(validated);
  return c.json(result, 201);
});

/** GET / */
taskDefs.openapi(listTaskDefsRoute, async (c) => {
  const query = c.req.valid('query');
  using taskDefs = c.env.RESOURCES.taskDefs();
  const result = await taskDefs.list(query);
  return c.json(result);
});

/** GET /{id} */
taskDefs.openapi(getTaskDefRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { version } = c.req.valid('query');
  using taskDefs = c.env.RESOURCES.taskDefs();
  const result = await taskDefs.get(id, version);
  return c.json(result);
});

/** DELETE /{id} */
taskDefs.openapi(deleteTaskDefRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { version } = c.req.valid('query');
  using taskDefs = c.env.RESOURCES.taskDefs();
  const result = await taskDefs.delete(id, version);
  return c.json(result);
});
