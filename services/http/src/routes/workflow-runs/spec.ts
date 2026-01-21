/**
 * Workflow Run OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

/** Workflow run summary schema */
const workflowRunSummarySchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    workflowId: z.string().nullable(), // Nullable for def-only runs (agent workflows)
    workflowName: z.string(),
    workflowDefId: z.string(),
    workflowVersion: z.number(),
    status: z.enum(['running', 'completed', 'failed', 'waiting']),
    parentRunId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .openapi('WorkflowRunSummary');

/** GET / - List workflow runs */
export const listWorkflowRunsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['workflow-runs'],
  request: {
    query: z.object({
      limit: z.string().optional().openapi({ description: 'Max results (default 50)' }),
      offset: z.string().optional().openapi({ description: 'Pagination offset' }),
      status: z
        .string()
        .optional()
        .openapi({ description: 'Filter by status (comma-separated: running,completed,failed)' }),
      projectId: z.string().optional().openapi({ description: 'Filter by project ID' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              runs: z.array(workflowRunSummarySchema),
              total: z.number(),
              limit: z.number(),
              offset: z.number(),
            })
            .openapi('WorkflowRunListResponse'),
        },
      },
      description: 'List of workflow runs',
    },
  },
});

export const deleteWorkflowRunRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['workflow-runs'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }).openapi('WorkflowRunDeleteResponse'),
        },
      },
      description: 'Workflow run deleted successfully',
    },
  },
});

export const cancelWorkflowRunRoute = createRoute({
  method: 'post',
  path: '/{id}/cancel',
  tags: ['workflow-runs'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              reason: z.string().optional().openapi({
                description: 'Reason for cancellation',
                example: 'User requested cancellation',
              }),
            })
            .openapi('CancelWorkflowRunRequest'),
        },
      },
      required: false,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              cancelled: z.boolean(),
              workflowRunId: z.string(),
            })
            .openapi('WorkflowRunCancelResponse'),
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
