/**
 * Workflow Run Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { cancelWorkflowRunRoute, deleteWorkflowRunRoute, listWorkflowRunsRoute } from './spec';

/** /workflow-runs */
export const workflowRuns = new OpenAPIHono<HttpEnv>();

/** GET / - List workflow runs */
workflowRuns.openapi(listWorkflowRunsRoute, async (c) => {
  const { limit, offset, status, projectId } = c.req.valid('query');

  using workflowRunsResource = c.env.RESOURCES.workflowRuns();
  const result = await workflowRunsResource.list({
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
    status: status
      ? (status.split(',') as ('running' | 'completed' | 'failed' | 'waiting')[])
      : undefined,
    projectId,
  });

  return c.json(result);
});

/** DELETE /{id} */
workflowRuns.openapi(deleteWorkflowRunRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflowRuns = c.env.RESOURCES.workflowRuns();
  const result = await workflowRuns.delete(id);
  return c.json(result);
});

/** POST /{id}/cancel */
workflowRuns.openapi(cancelWorkflowRunRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const reason = body?.reason ?? 'User requested cancellation';
  const coordinatorId = c.env.COORDINATOR.idFromName(id);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);
  await coordinator.cancel(reason);
  return c.json({ cancelled: true, workflowRunId: id }, 200);
});
