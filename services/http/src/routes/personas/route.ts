import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import {
  createPersonaRoute,
  deletePersonaRoute,
  deletePersonaVersionRoute,
  getPersonaRoute,
  getPersonaVersionRoute,
  listPersonasRoute,
} from './spec';

export const personas = new OpenAPIHono<HttpEnv>();

personas.openapi(createPersonaRoute, async (c) => {
  const validated = c.req.valid('json');
  using resource = c.env.RESOURCES.personas();
  const result = await resource.create(validated);
  return c.json(result, 201);
});

personas.openapi(listPersonasRoute, async (c) => {
  const { libraryId, limit } = c.req.valid('query');
  using resource = c.env.RESOURCES.personas();
  const result = await resource.list({ libraryId, limit });
  return c.json(result);
});

personas.openapi(getPersonaRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.personas();
  const result = await resource.get(id);
  return c.json(result);
});

personas.openapi(getPersonaVersionRoute, async (c) => {
  const { id, version } = c.req.valid('param');
  using resource = c.env.RESOURCES.personas();
  const result = await resource.get(id, version);
  return c.json(result);
});

personas.openapi(deletePersonaRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.personas();
  await resource.delete(id);
  return c.json({ success: true });
});

personas.openapi(deletePersonaVersionRoute, async (c) => {
  const { id, version } = c.req.valid('param');
  using resource = c.env.RESOURCES.personas();
  await resource.delete(id, version);
  return c.json({ success: true });
});
