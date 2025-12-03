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

export const listWorkflowDefsByProjectRoute = createRoute({
  method: 'get',
  path: '/project/{project_id}',
  tags: ['workflow-defs'],
  request: {
    params: z.object({
      project_id: ulid().openapi({ param: { name: 'project_id', in: 'path' } }),
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

export const listWorkflowDefsByLibraryRoute = createRoute({
  method: 'get',
  path: '/library/{library_id}',
  tags: ['workflow-defs'],
  request: {
    params: z.object({
      library_id: ulid().openapi({ param: { name: 'library_id', in: 'path' } }),
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
