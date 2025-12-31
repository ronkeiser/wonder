import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import {
  createArtifactTypeRoute,
  deleteArtifactTypeRoute,
  deleteArtifactTypeVersionRoute,
  getArtifactTypeRoute,
  getArtifactTypeVersionRoute,
  listArtifactTypesRoute,
} from './spec';

export const artifactTypes = new OpenAPIHono<HttpEnv>();

artifactTypes.openapi(createArtifactTypeRoute, async (c) => {
  const validated = c.req.valid('json');
  using resource = c.env.RESOURCES.artifactTypes();
  const result = await resource.create(validated);
  return c.json(result, 201);
});

artifactTypes.openapi(listArtifactTypesRoute, async (c) => {
  const { limit } = c.req.valid('query');
  using resource = c.env.RESOURCES.artifactTypes();
  const result = await resource.list({ limit });
  return c.json(result);
});

artifactTypes.openapi(getArtifactTypeRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.artifactTypes();
  const result = await resource.get(id);
  return c.json(result);
});

artifactTypes.openapi(getArtifactTypeVersionRoute, async (c) => {
  const { id, version } = c.req.valid('param');
  using resource = c.env.RESOURCES.artifactTypes();
  const result = await resource.get(id, version);
  return c.json(result);
});

artifactTypes.openapi(deleteArtifactTypeRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.artifactTypes();
  await resource.delete(id);
  return c.json({ success: true });
});

artifactTypes.openapi(deleteArtifactTypeVersionRoute, async (c) => {
  const { id, version } = c.req.valid('param');
  using resource = c.env.RESOURCES.artifactTypes();
  await resource.delete(id, version);
  return c.json({ success: true });
});
