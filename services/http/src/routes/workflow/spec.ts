/**
 * Workflow OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateWorkflowRunSchema,
  CreateWorkflowSchema,
  WorkflowCreateResponseSchema,
  WorkflowGetResponseSchema,
  WorkflowRunCreateResponseSchema,
  WorkflowRunStartResponseSchema,
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
    500: {
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }).openapi('WorkflowStartError'),
        },
      },
      description: 'Failed to start workflow',
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

export const createWorkflowRunRoute = createRoute({
  method: 'post',
  path: '/{id}/runs',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateWorkflowRunSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: WorkflowRunCreateResponseSchema,
        },
      },
      description: 'Workflow run created successfully',
    },
    500: {
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }).openapi('WorkflowRunCreateError'),
        },
      },
      description: 'Failed to create workflow run',
    },
  },
});

export const startWorkflowRunRoute = createRoute({
  method: 'post',
  path: '/{id}/runs/{run_id}/start',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
      run_id: ulid().openapi({ param: { name: 'run_id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowRunStartResponseSchema,
        },
      },
      description: 'Workflow run started successfully',
    },
    500: {
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }).openapi('WorkflowRunStartError'),
        },
      },
      description: 'Failed to start workflow run',
    },
  },
});
