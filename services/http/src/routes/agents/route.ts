import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { createAgentRoute, deleteAgentRoute, getAgentRoute, listAgentsRoute } from './spec';

export const agents = new OpenAPIHono<HttpEnv>();

agents.openapi(createAgentRoute, async (c) => {
  const validated = c.req.valid('json');
  using resource = c.env.RESOURCES.agents();
  const result = await resource.create(validated);
  return c.json(result, 201);
});

agents.openapi(listAgentsRoute, async (c) => {
  const { limit } = c.req.valid('query');
  using resource = c.env.RESOURCES.agents();
  const result = await resource.list({ limit });
  return c.json(result);
});

agents.openapi(getAgentRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.agents();
  const result = await resource.get(id);
  return c.json(result);
});

agents.openapi(deleteAgentRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.agents();
  await resource.delete(id);
  return c.json({ success: true });
});
