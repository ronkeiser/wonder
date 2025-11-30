import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { CreateWorkflowSchema, ulid, WorkflowSchema } from '../schemas.js';

interface Env {
  API: any;
}

export const workflows = new OpenAPIHono<{ Bindings: Env }>();

const createWorkflowRoute = createRoute({
  method: 'post',
  path: '/',
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
          schema: WorkflowSchema,
        },
      },
      description: 'Workflow created successfully',
    },
  },
});

workflows.openapi(createWorkflowRoute, async (c) => {
  const validated = c.req.valid('json');
  using workflows = c.env.API.workflows();
  const result = await workflows.create(validated);
  return c.json(result, 201);
});

const getWorkflowRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowSchema,
        },
      },
      description: 'Workflow retrieved successfully',
    },
  },
});

workflows.openapi(getWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflows = c.env.API.workflows();
  const result = await workflows.get(id);
  return c.json(result);
});

const startWorkflowRoute = createRoute({
  method: 'post',
  path: '/{id}/start',
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()).openapi({ example: { input: 'value' } }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()),
        },
      },
      description: 'Workflow execution started successfully',
    },
  },
});

workflows.openapi(startWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  using workflows = c.env.API.workflows();
  const result = await workflows.start(id, input);
  return c.json(result);
});
