import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateToolSchema,
  ToolBatchRequestSchema,
  ToolCreateResponseSchema,
  ToolGetResponseSchema,
  ToolListResponseSchema,
} from './schema';

export const createToolRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['tools'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateToolSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ToolCreateResponseSchema,
        },
      },
      description: 'Tool created successfully',
    },
  },
});

export const listToolsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['tools'],
  request: {
    query: z.object({
      libraryId: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ToolListResponseSchema,
        },
      },
      description: 'Tools retrieved successfully',
    },
  },
});

export const getToolRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['tools'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ToolGetResponseSchema,
        },
      },
      description: 'Tool retrieved successfully',
    },
  },
});

export const batchGetToolsRoute = createRoute({
  method: 'post',
  path: '/batch',
  tags: ['tools'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ToolBatchRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ToolListResponseSchema,
        },
      },
      description: 'Tools retrieved successfully',
    },
  },
});

export const deleteToolRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['tools'],
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
      description: 'Tool deleted successfully',
    },
  },
});
