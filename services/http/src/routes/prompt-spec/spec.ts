/**
 * Prompt Spec OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import {
  CreatePromptSpecSchema,
  PromptSpecCreateResponseSchema,
  PromptSpecGetResponseSchema,
} from './schema';

export const createPromptSpecRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['prompt-specs'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreatePromptSpecSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: PromptSpecCreateResponseSchema,
        },
      },
      description: 'Prompt spec created successfully',
    },
  },
});

export const getPromptSpecRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['prompt-specs'],
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({ param: { name: 'id', in: 'path' }, example: 'summarize-text' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PromptSpecGetResponseSchema,
        },
      },
      description: 'Prompt spec retrieved successfully',
    },
  },
});

export const deletePromptSpecRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['prompt-specs'],
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({ param: { name: 'id', in: 'path' }, example: 'summarize-text' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Prompt spec deleted successfully',
    },
  },
});
