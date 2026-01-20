/**
 * Task OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import {
  CreateTaskSchema,
  TaskCreateResponseSchema,
  TaskGetResponseSchema,
  TaskListResponseSchema,
} from './schema';

export const createTaskRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['tasks'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateTaskSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: TaskCreateResponseSchema,
        },
      },
      description: 'Task created successfully',
    },
  },
});

export const getTaskRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['tasks'],
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({ param: { name: 'id', in: 'path' }, example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    }),
    query: z.object({
      version: z.coerce.number().int().positive().optional().openapi({ example: 1 }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: TaskGetResponseSchema,
        },
      },
      description: 'Task retrieved successfully',
    },
  },
});

export const listTasksRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['tasks'],
  request: {
    query: z.object({
      projectId: z.string().optional(),
      libraryId: z.string().optional(),
      name: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: TaskListResponseSchema,
        },
      },
      description: 'Tasks retrieved successfully',
    },
  },
});

export const deleteTaskRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['tasks'],
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({ param: { name: 'id', in: 'path' }, example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    }),
    query: z.object({
      version: z.coerce.number().int().positive().optional().openapi({ example: 1 }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Task deleted successfully',
    },
  },
});
