/**
 * TaskDef OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import {
  CreateTaskDefSchema,
  TaskDefCreateResponseSchema,
  TaskDefGetResponseSchema,
  TaskDefListResponseSchema,
} from './schema';

export const createTaskDefRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['task-defs'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateTaskDefSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: TaskDefCreateResponseSchema,
        },
      },
      description: 'TaskDef created successfully',
    },
  },
});

export const getTaskDefRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['task-defs'],
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
          schema: TaskDefGetResponseSchema,
        },
      },
      description: 'TaskDef retrieved successfully',
    },
  },
});

export const listTaskDefsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['task-defs'],
  request: {
    query: z.object({
      project_id: z.string().optional(),
      library_id: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: TaskDefListResponseSchema,
        },
      },
      description: 'TaskDefs retrieved successfully',
    },
  },
});

export const deleteTaskDefRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['task-defs'],
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
      description: 'TaskDef deleted successfully',
    },
  },
});
