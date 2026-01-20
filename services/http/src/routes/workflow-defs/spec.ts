/**
 * Workflow Definition OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateWorkflowDefSchema,
  WorkflowDefCreateResponseSchema,
  WorkflowDefGetResponseSchema,
  WorkflowDefListResponseSchema,
} from './schema';

export const createWorkflowDefRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['workflow-defs'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWorkflowDefSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: WorkflowDefCreateResponseSchema,
        },
      },
      description: 'Workflow definition created successfully',
    },
  },
});

export const getWorkflowDefRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['workflow-defs'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    query: z.object({
      version: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .openapi({ param: { name: 'version', in: 'query' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowDefGetResponseSchema,
        },
      },
      description: 'Workflow definition retrieved successfully',
    },
  },
});

export const listWorkflowDefsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['workflow-defs'],
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
          schema: WorkflowDefListResponseSchema,
        },
      },
      description: 'Workflow definitions retrieved successfully',
    },
  },
});

export const deleteWorkflowDefRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['workflow-defs'],
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
      description: 'Workflow definition deleted successfully',
    },
  },
});
