import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ActionCreateResponseSchema,
  ActionGetResponseSchema,
  CreateActionSchema,
} from '../schemas.js';

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
          schema: ActionCreateResponseSchema,
        },
      },
      description: 'Action created successfully',
    },
  },
});

actions.openapi(createActionRoute, async (c) => {
  const validated = c.req.valid('json');
  using actions = c.env.RESOURCES.actions();
  const result = await actions.create(validated);
  return c.json(result, 201);
});

const getActionRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['actions'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' }, example: 'send-email' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ActionGetResponseSchema,
        },
      },
      description: 'Action retrieved successfully',
    },
  },
});

actions.openapi(getActionRoute, async (c) => {
  const { id } = c.req.valid('param');
  using actions = c.env.RESOURCES.actions();
  const result = await actions.get(id);
  return c.json(result);
});

const deleteActionRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['actions'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' }, example: 'send-email' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Action deleted successfully',
    },
  },
});

actions.openapi(deleteActionRoute, async (c) => {
  const { id } = c.req.valid('param');
  using actions = c.env.RESOURCES.actions();
  await actions.delete(id);
  return c.json({ success: true });
});
