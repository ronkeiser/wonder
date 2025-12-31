import { createRoute, z } from '@hono/zod-openapi';
import {
  ArtifactTypeCreateResponseSchema,
  ArtifactTypeGetResponseSchema,
  ArtifactTypeListResponseSchema,
  CreateArtifactTypeSchema,
} from './schema';

export const createArtifactTypeRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['artifact-types'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateArtifactTypeSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ArtifactTypeCreateResponseSchema,
        },
      },
      description: 'Artifact type created successfully',
    },
  },
});

export const listArtifactTypesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['artifact-types'],
  request: {
    query: z.object({
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ArtifactTypeListResponseSchema,
        },
      },
      description: 'Artifact types retrieved successfully',
    },
  },
});

export const getArtifactTypeRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['artifact-types'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ArtifactTypeGetResponseSchema,
        },
      },
      description: 'Artifact type retrieved successfully (latest version)',
    },
  },
});

export const getArtifactTypeVersionRoute = createRoute({
  method: 'get',
  path: '/{id}/versions/{version}',
  tags: ['artifact-types'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' } }),
      version: z.coerce.number().int().positive().openapi({ param: { name: 'version', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ArtifactTypeGetResponseSchema,
        },
      },
      description: 'Artifact type version retrieved successfully',
    },
  },
});

export const deleteArtifactTypeRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['artifact-types'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Artifact type deleted successfully (all versions)',
    },
  },
});

export const deleteArtifactTypeVersionRoute = createRoute({
  method: 'delete',
  path: '/{id}/versions/{version}',
  tags: ['artifact-types'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' } }),
      version: z.coerce.number().int().positive().openapi({ param: { name: 'version', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Artifact type version deleted successfully',
    },
  },
});
