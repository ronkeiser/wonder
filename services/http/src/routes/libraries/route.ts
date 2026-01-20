import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import {
  createLibraryRoute,
  deleteLibraryRoute,
  getLibraryRoute,
  listLibrariesRoute,
} from './spec';

export const libraries = new OpenAPIHono<HttpEnv>();

libraries.openapi(createLibraryRoute, async (c) => {
  const validated = c.req.valid('json');
  using resource = c.env.RESOURCES.libraries();
  const result = await resource.create(validated);
  return c.json(result, 201);
});

libraries.openapi(listLibrariesRoute, async (c) => {
  const { workspaceId, limit } = c.req.valid('query');
  using resource = c.env.RESOURCES.libraries();
  const result = await resource.list({ workspaceId, limit });
  return c.json(result);
});

libraries.openapi(getLibraryRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.libraries();
  const result = await resource.get(id);
  return c.json(result);
});

libraries.openapi(deleteLibraryRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.libraries();
  await resource.delete(id);
  return c.json({ success: true });
});
