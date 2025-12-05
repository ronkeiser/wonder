/**
 * Workflow OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateWorkflowSchema,
  WorkflowCreateResponseSchema,
  WorkflowGetResponseSchema,
} from './schema';

export const createWorkflowRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['workflows'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWorkflowSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: WorkflowCreateResponseSchema,
        },
      },
      description: 'Workflow created successfully',
    },
  },
});

export const getWorkflowRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowGetResponseSchema,
        },
      },
      description: 'Workflow retrieved successfully',
    },
  },
});

export const startWorkflowRoute = createRoute({
  method: 'post',
  path: '/{id}/start',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()).openapi({ example: { input: 'value' } }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              workflow_run_id: ulid(),
              durable_object_id: z.string(),
            })
            .openapi('WorkflowStartResponse'),
        },
      },
      description: 'Workflow execution started successfully',
    },
  },
});

export const deleteWorkflowRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }).openapi('WorkflowDeleteResponse'),
        },
      },
      description: 'Workflow deleted successfully',
    },
  },
});
