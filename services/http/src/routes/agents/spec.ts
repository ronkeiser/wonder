import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  AgentCreateResponseSchema,
  AgentGetResponseSchema,
  AgentListResponseSchema,
  CreateAgentSchema,
} from './schema';

export const createAgentRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['agents'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateAgentSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: AgentCreateResponseSchema,
        },
      },
      description: 'Agent created successfully',
    },
  },
});

export const listAgentsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['agents'],
  request: {
    query: z.object({
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AgentListResponseSchema,
        },
      },
      description: 'Agents retrieved successfully',
    },
  },
});

export const getAgentRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['agents'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AgentGetResponseSchema,
        },
      },
      description: 'Agent retrieved successfully',
    },
  },
});

export const deleteAgentRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['agents'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Agent deleted successfully',
    },
  },
});
