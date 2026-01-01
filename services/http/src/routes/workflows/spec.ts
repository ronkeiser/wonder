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

const StartWorkflowRequestSchema = z
  .object({
    stream: z.boolean().optional().openapi({
      description: 'If true, returns SSE stream of events instead of JSON response',
      example: false,
    }),
    input: z.record(z.string(), z.unknown()).optional().openapi({
      description: 'Input data for the workflow',
      example: { key: 'value' },
    }),
  })
  .openapi('StartWorkflowRequest');

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
          schema: StartWorkflowRequestSchema,
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
              workflowRunId: ulid(),
              durableObjectId: z.string(),
            })
            .openapi('WorkflowStartResponse'),
        },
        'text/event-stream': {
          schema: z.string().openapi({
            description: 'SSE stream of workflow events',
            example: 'data: {"stream":"events","event":{...}}\n\n',
          }),
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
