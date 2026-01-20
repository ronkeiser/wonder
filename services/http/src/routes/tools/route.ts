import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import {
  batchGetToolsRoute,
  createToolRoute,
  deleteToolRoute,
  getToolRoute,
  listToolsRoute,
} from './spec';

export const tools = new OpenAPIHono<HttpEnv>();

tools.openapi(createToolRoute, async (c) => {
  const validated = c.req.valid('json');
  using resource = c.env.RESOURCES.tools();
  const result = await resource.create(validated);
  return c.json(result, 201);
});

tools.openapi(listToolsRoute, async (c) => {
  const { libraryId, name, limit } = c.req.valid('query');
  using resource = c.env.RESOURCES.tools();
  const result = await resource.list({ libraryId, name, limit });
  return c.json(result);
});

tools.openapi(getToolRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.tools();
  const result = await resource.get(id);
  return c.json(result);
});

tools.openapi(batchGetToolsRoute, async (c) => {
  const { ids } = c.req.valid('json');
  using resource = c.env.RESOURCES.tools();
  const result = await resource.getByIds(ids);
  return c.json(result);
});

tools.openapi(deleteToolRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.tools();
  await resource.delete(id);
  return c.json({ success: true });
});
