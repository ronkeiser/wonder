import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateLibrarySchema,
  LibraryCreateResponseSchema,
  LibraryGetResponseSchema,
  LibraryListResponseSchema,
} from './schema';

export const createLibraryRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['libraries'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateLibrarySchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: LibraryCreateResponseSchema,
        },
      },
      description: 'Library created successfully',
    },
  },
});

export const listLibrariesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['libraries'],
  request: {
    query: z.object({
      workspaceId: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: LibraryListResponseSchema,
        },
      },
      description: 'Libraries retrieved successfully',
    },
  },
});

export const getLibraryRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['libraries'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: LibraryGetResponseSchema,
        },
      },
      description: 'Library retrieved successfully',
    },
  },
});

export const deleteLibraryRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['libraries'],
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
      description: 'Library deleted successfully',
    },
  },
});
