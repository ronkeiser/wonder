/**
 * Model Profile OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateModelProfileSchema,
  ModelProfileCreateResponseSchema,
  ModelProfileGetResponseSchema,
  ModelProfileSchema,
} from './schema';

export const listModelProfilesRoute = createRoute({
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
            modelProfiles: z.array(ModelProfileSchema),
          }),
        },
      },
      description: 'Model profiles retrieved successfully',
    },
  },
});

export const getModelProfileRoute = createRoute({
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

export const createModelProfileRoute = createRoute({
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

export const deleteModelProfileRoute = createRoute({
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
