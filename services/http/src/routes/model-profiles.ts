import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { CreateModelProfileSchema, ModelProfileSchema, ulid } from '../schemas.js';

interface Env {
  API: any;
}

export const modelProfiles = new OpenAPIHono<{ Bindings: Env }>();

const listModelProfilesRoute = createRoute({
  method: 'get',
  path: '/',
  request: {
    query: z.object({
      provider: z.enum(['anthropic', 'openai', 'google', 'cloudflare', 'local']).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            profiles: z.array(ModelProfileSchema),
          }),
        },
      },
      description: 'Model profiles retrieved successfully',
    },
  },
});

modelProfiles.openapi(listModelProfilesRoute, async (c) => {
  const { provider } = c.req.valid('query');
  using modelProfiles = c.env.API.modelProfiles();
  const filters = provider ? { provider } : undefined;
  const result = await modelProfiles.list(filters);
  return c.json(result);
});

const getModelProfileRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ModelProfileSchema,
        },
      },
      description: 'Model profile retrieved successfully',
    },
  },
});

modelProfiles.openapi(getModelProfileRoute, async (c) => {
  const { id } = c.req.valid('param');
  using modelProfiles = c.env.API.modelProfiles();
  const result = await modelProfiles.get(id);
  return c.json(result);
});

const createModelProfileRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateModelProfileSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ModelProfileSchema,
        },
      },
      description: 'Model profile created successfully',
    },
  },
});

modelProfiles.openapi(createModelProfileRoute, async (c) => {
  const validated = c.req.valid('json');
  using modelProfiles = c.env.API.modelProfiles();
  const result = await modelProfiles.create(validated);
  return c.json(result, 201);
});

const deleteModelProfileRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Model profile deleted successfully',
    },
  },
});

modelProfiles.openapi(deleteModelProfileRoute, async (c) => {
  const { id } = c.req.valid('param');
  using modelProfiles = c.env.API.modelProfiles();
  await modelProfiles.delete(id);
  return c.json({ success: true });
});
