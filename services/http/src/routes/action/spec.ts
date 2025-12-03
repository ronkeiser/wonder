/**
 * Action OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ActionCreateResponseSchema, ActionGetResponseSchema, CreateActionSchema } from './schema';

export const createActionRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['actions'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateActionSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ActionCreateResponseSchema,
        },
      },
      description: 'Action created successfully',
    },
  },
});

export const getActionRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['actions'],
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({ param: { name: 'id', in: 'path' }, example: 'send-email' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ActionGetResponseSchema,
        },
      },
      description: 'Action retrieved successfully',
    },
  },
});

export const deleteActionRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['actions'],
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({ param: { name: 'id', in: 'path' }, example: 'send-email' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Action deleted successfully',
    },
  },
});
