/**
 * Workflow Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { workflowRuns } from './runs/route';
import {
  createWorkflowRoute,
  deleteWorkflowRoute,
  getWorkflowRoute,
  startWorkflowRoute,
} from './spec';

/** /workflows */
export const workflows = new OpenAPIHono<HttpEnv>();

/** POST / */
workflows.openapi(createWorkflowRoute, async (c) => {
  const validated = c.req.valid('json');
  using workflows = c.env.RESOURCES.workflows();
  const result = await workflows.create(validated);
  return c.json(result, 201);
});

/** GET /{id} */
workflows.openapi(getWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflows = c.env.RESOURCES.workflows();
  const result = await workflows.get(id);
  return c.json(result);
});

/** POST /{id}/start */
workflows.openapi(startWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');

  // 1. Create workflow run
  using workflowRunsResource = c.env.RESOURCES.workflowRuns();
  const { workflowRunId } = await workflowRunsResource.create(id, input);

  // 2. Start the coordinator DO
  const coordinatorId = c.env.COORDINATOR.idFromName(workflowRunId);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);
  await coordinator.start(workflowRunId);

  return c.json({ workflowRunId, durableObjectId: workflowRunId }, 200);
});

/** DELETE /{id} */
workflows.openapi(deleteWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflows = c.env.RESOURCES.workflows();
  const result = await workflows.delete(id);
  return c.json(result);
});

// Mount runs sub-router
workflows.route('/', workflowRuns);
