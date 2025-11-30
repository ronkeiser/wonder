import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { CreateWorkflowDefSchema, ulid, WorkflowDefSchema } from '../schemas.js';

interface Env {
  API: any;
}

export const workflowDefs = new OpenAPIHono<{ Bindings: Env }>();

const createWorkflowDefRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['workflow-defs'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWorkflowDefSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: WorkflowDefSchema,
        },
      },
      description: 'Workflow definition created successfully',
    },
  },
});

workflowDefs.openapi(createWorkflowDefRoute, async (c) => {
  const validated = c.req.valid('json');
  using workflowDefs = c.env.API.workflowDefs();
  const result = await workflowDefs.create(validated);
  return c.json(result, 201);
});

const getWorkflowDefRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['workflow-defs'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    query: z.object({
      version: z.string().optional().openapi({ param: { name: 'version', in: 'query' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowDefSchema,
        },
      },
      description: 'Workflow definition retrieved successfully',
    },
  },
});

workflowDefs.openapi(getWorkflowDefRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { version } = c.req.valid('query');
  using workflowDefs = c.env.API.workflowDefs();
  const result = await workflowDefs.get(id, version ? parseInt(version) : undefined);
  return c.json(result);
});

const listWorkflowDefsByOwnerRoute = createRoute({
  method: 'get',
  path: '/owner/{owner}',
  tags: ['workflow-defs'],
  request: {
    params: z.object({
      owner: z.string().openapi({ param: { name: 'owner', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(WorkflowDefSchema),
        },
      },
      description: 'Workflow definitions retrieved successfully',
    },
  },
});

workflowDefs.openapi(listWorkflowDefsByOwnerRoute, async (c) => {
  const { owner } = c.req.valid('param');
  using workflowDefs = c.env.API.workflowDefs();
  const result = await workflowDefs.listByOwner(owner);
  return c.json(result);
});
