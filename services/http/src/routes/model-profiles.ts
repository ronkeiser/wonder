import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateModelProfileSchema,
  ModelProfileCreateResponseSchema,
  ModelProfileGetResponseSchema,
  ModelProfileSchema,
  ulid,
} from '../schemas.js';

export const modelProfiles = new OpenAPIHono<{ Bindings: Env }>();

const listModelProfilesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['model-profiles'],
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
            model_profiles: z.array(ModelProfileSchema),
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
  tags: ['model-profiles'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ModelProfileGetResponseSchema,
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
  tags: ['model-profiles'],
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
          schema: ModelProfileCreateResponseSchema,
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
  tags: ['model-profiles'],
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
