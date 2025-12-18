/**
 * Workflow Run OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

/** Workflow run summary schema */
const workflowRunSummarySchema = z
  .object({
    id: z.string(),
    project_id: z.string(),
    workflow_id: z.string(),
    workflow_name: z.string(),
    workflow_def_id: z.string(),
    workflow_version: z.number(),
    status: z.enum(['running', 'completed', 'failed', 'waiting']),
    parent_run_id: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    completed_at: z.string().nullable(),
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
      project_id: z.string().optional().openapi({ description: 'Filter by project ID' }),
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

export const streamWorkflowRunRoute = createRoute({
  method: 'get',
  path: '/{id}/stream',
  tags: ['workflow-runs'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    101: {
      description: 'WebSocket connection established',
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            received_upgrade: z.string().optional(),
          }),
        },
      },
      description: 'WebSocket upgrade required',
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
