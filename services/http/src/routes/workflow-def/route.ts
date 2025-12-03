/**
 * Workflow Definition Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import {
  createWorkflowDefRoute,
  getWorkflowDefRoute,
  listWorkflowDefsByLibraryRoute,
  listWorkflowDefsByProjectRoute,
} from './spec';

/** /workflow-defs */
export const workflowDefs = new OpenAPIHono<{ Bindings: Env }>();

/** POST / */
workflowDefs.openapi(createWorkflowDefRoute, async (c) => {
  const validated = c.req.valid('json');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.create(validated);
  return c.json(result, 201);
});

/** GET /{id} */
workflowDefs.openapi(getWorkflowDefRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { version } = c.req.valid('query');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.get(id, version);
  return c.json(result);
});

/** GET /project/{project_id} */
workflowDefs.openapi(listWorkflowDefsByProjectRoute, async (c) => {
  const { project_id } = c.req.valid('param');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.listByProject(project_id);
  return c.json(result);
});

/** GET /library/{library_id} */
workflowDefs.openapi(listWorkflowDefsByLibraryRoute, async (c) => {
  const { library_id } = c.req.valid('param');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.listByLibrary(library_id);
  return c.json(result);
});
