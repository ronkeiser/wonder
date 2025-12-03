/**
 * Workflow Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { createWorkflowRoute, getWorkflowRoute, startWorkflowRoute } from './spec';

/** /workflows */
export const workflows = new OpenAPIHono<{ Bindings: Env }>();

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
  using workflowsResource = c.env.RESOURCES.workflows();
  const result = await workflowsResource.start(id, input);

  // Trigger workflow execution via coordinator DO
  const coordinatorId = c.env.COORDINATOR.idFromName(result.durable_object_id);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);

  try {
    const coordinatorResponse = await coordinator.fetch(
      new Request(`http://internal/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_run_id: result.workflow_run_id,
          input,
        }),
      }),
    );

    if (!coordinatorResponse.ok) {
      const errorText = await coordinatorResponse.text();
      console.error('Coordinator error:', errorText);
      throw new Error(`Coordinator returned ${coordinatorResponse.status}: ${errorText}`);
    }
  } catch (error) {
    console.error('Failed to trigger coordinator:', error);
    throw error;
  }

  return c.json(result);
});
