/**
 * Project OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateProjectSchema,
  ProjectCreateResponseSchema,
  ProjectGetResponseSchema,
} from './schema';

export const createProjectRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['projects'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProjectSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ProjectCreateResponseSchema,
        },
      },
      description: 'Project created successfully',
    },
  },
});

export const getProjectRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['projects'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ProjectGetResponseSchema,
        },
      },
      description: 'Project retrieved successfully',
    },
  },
});

export const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['projects'],
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
      description: 'Project deleted successfully',
    },
  },
});
