import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ActionSchema, CreateActionSchema, ulid } from '../schemas.js';

interface Env {
  API: any;
}

export const actions = new OpenAPIHono<{ Bindings: Env }>();

const createActionRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['actions'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateActionSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ActionSchema,
        },
      },
      description: 'Action created successfully',
    },
  },
});

actions.openapi(createActionRoute, async (c) => {
  const validated = c.req.valid('json');
  using actions = c.env.API.actions();
  const result = await actions.create(validated);
  return c.json(result, 201);
});

const getActionRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['actions'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ActionSchema,
        },
      },
      description: 'Action retrieved successfully',
    },
  },
});

actions.openapi(getActionRoute, async (c) => {
  const { id } = c.req.valid('param');
  using actions = c.env.API.actions();
  const result = await actions.get(id);
  return c.json(result);
});
