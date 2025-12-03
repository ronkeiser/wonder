/**
 * Workspace OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateWorkspaceSchema,
  UpdateWorkspaceSchema,
  WorkspaceCreateResponseSchema,
  WorkspaceGetResponseSchema,
  WorkspaceListResponseSchema,
  WorkspaceUpdateResponseSchema,
} from './schema';

export const listWorkspacesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['workspaces'],
  request: {
    query: z.object({
      limit: z.coerce.number().int().positive().max(100).optional().openapi({ example: 10 }),
      offset: z.coerce.number().int().nonnegative().optional().openapi({ example: 0 }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkspaceListResponseSchema,
        },
      },
      description: 'Workspaces retrieved successfully',
    },
  },
});

export const createWorkspaceRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['workspaces'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWorkspaceSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: WorkspaceCreateResponseSchema,
        },
      },
      description: 'Workspace created successfully',
    },
  },
});

export const getWorkspaceRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['workspaces'],
  request: {
    params: z.object({
      id: ulid().openapi({
        param: { name: 'id', in: 'path' },
        example: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkspaceGetResponseSchema,
        },
      },
      description: 'Workspace retrieved successfully',
    },
  },
});

export const deleteWorkspaceRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['workspaces'],
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
      description: 'Workspace deleted successfully',
    },
  },
});

export const updateWorkspaceRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['workspaces'],
  request: {
    params: z.object({
      id: ulid().openapi({
        param: { name: 'id', in: 'path' },
        example: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateWorkspaceSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkspaceUpdateResponseSchema,
        },
      },
      description: 'Workspace updated successfully',
    },
  },
});
