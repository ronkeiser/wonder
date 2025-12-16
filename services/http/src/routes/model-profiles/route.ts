/**
 * Model Profile Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import {
  createModelProfileRoute,
  deleteModelProfileRoute,
  getModelProfileRoute,
  listModelProfilesRoute,
} from './spec';

/**
 * /model-profiles
 */
export const modelProfiles = new OpenAPIHono<HttpEnv>();

/**
 * GET /
 */
modelProfiles.openapi(listModelProfilesRoute, async (c) => {
  const { provider } = c.req.valid('query');
  using modelProfiles = c.env.RESOURCES.modelProfiles();
  const filters = provider ? { provider } : undefined;
  const result = await modelProfiles.list(filters);
  return c.json(result);
});

/**
 * GET /{id}
 */
modelProfiles.openapi(getModelProfileRoute, async (c) => {
  const { id } = c.req.valid('param');
  using modelProfiles = c.env.RESOURCES.modelProfiles();
  const result = await modelProfiles.get(id);
  return c.json(result);
});

/**
 * POST /
 */
modelProfiles.openapi(createModelProfileRoute, async (c) => {
  const validated = c.req.valid('json');
  using modelProfiles = c.env.RESOURCES.modelProfiles();
  const result = await modelProfiles.create(validated);
  return c.json(result, 201);
});

/**
 * DELETE /{id}
 */
modelProfiles.openapi(deleteModelProfileRoute, async (c) => {
  const { id } = c.req.valid('param');
  using modelProfiles = c.env.RESOURCES.modelProfiles();
  await modelProfiles.delete(id);
  return c.json({ success: true });
});
