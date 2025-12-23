/**
 * Workflow Runs OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../../validators';
import {
  CancelWorkflowRunSchema,
  CreateWorkflowRunSchema,
  StartWorkflowRunSchema,
  WorkflowRunCancelResponseSchema,
  WorkflowRunCreateResponseSchema,
  WorkflowRunStartResponseSchema,
} from './schema';

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
  path: '/{id}/runs/{runId}/start',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
      runId: ulid().openapi({ param: { name: 'runId', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: StartWorkflowRunSchema,
        },
      },
      required: false,
    },
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

export const cancelWorkflowRunRoute = createRoute({
  method: 'post',
  path: '/{id}/runs/{runId}/cancel',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
      runId: ulid().openapi({ param: { name: 'runId', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: CancelWorkflowRunSchema,
        },
      },
      required: false,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowRunCancelResponseSchema,
        },
      },
      description: 'Workflow run cancelled successfully',
    },
    500: {
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }).openapi('WorkflowRunCancelError'),
        },
      },
      description: 'Failed to cancel workflow run',
    },
  },
});
