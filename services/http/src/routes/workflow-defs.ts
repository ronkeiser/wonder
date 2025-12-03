import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateWorkflowDefSchema,
  ulid,
  WorkflowDefCreateResponseSchema,
  WorkflowDefGetResponseSchema,
  WorkflowDefListResponseSchema,
  WorkflowDefSchema,
} from '../schemas.js';

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
          schema: WorkflowDefCreateResponseSchema,
        },
      },
      description: 'Workflow definition created successfully',
    },
  },
});

workflowDefs.openapi(createWorkflowDefRoute, async (c) => {
  const validated = c.req.valid('json');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
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
      version: z.coerce.number().int().positive().optional().openapi({ param: { name: 'version', in: 'query' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowDefGetResponseSchema,
        },
      },
      description: 'Workflow definition retrieved successfully',
    },
  },
});

workflowDefs.openapi(getWorkflowDefRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { version } = c.req.valid('query');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.get(id, version);
  return c.json(result);
});

const listWorkflowDefsByProjectRoute = createRoute({
  method: 'get',
  path: '/project/{project_id}',
  tags: ['workflow-defs'],
  request: {
    params: z.object({
      project_id: ulid().openapi({ param: { name: 'project_id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowDefListResponseSchema,
        },
      },
      description: 'Workflow definitions retrieved successfully',
    },
  },
});

workflowDefs.openapi(listWorkflowDefsByProjectRoute, async (c) => {
  const { project_id } = c.req.valid('param');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.listByProject(project_id);
  return c.json(result);
});

const listWorkflowDefsByLibraryRoute = createRoute({
  method: 'get',
  path: '/library/{library_id}',
  tags: ['workflow-defs'],
  request: {
    params: z.object({
      library_id: ulid().openapi({ param: { name: 'library_id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowDefListResponseSchema,
        },
      },
      description: 'Workflow definitions retrieved successfully',
    },
  },
});

workflowDefs.openapi(listWorkflowDefsByLibraryRoute, async (c) => {
  const { library_id } = c.req.valid('param');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.listByLibrary(library_id);
  return c.json(result);
});
