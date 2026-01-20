import { createRoute, z } from '@hono/zod-openapi';
import {
  StandardLibraryDefinitionsResponseSchema,
  StandardLibraryListResponseSchema,
  StandardLibraryManifestSchema,
} from './schema';

export const listStandardLibrariesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['standard-library'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: StandardLibraryListResponseSchema,
        },
      },
      description: 'List of all standard libraries',
    },
  },
});

export const getStandardLibraryManifestRoute = createRoute({
  method: 'get',
  path: '/manifest',
  tags: ['standard-library'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: StandardLibraryManifestSchema,
        },
      },
      description: 'Manifest of all standard library definitions for validation',
    },
  },
});

export const listStandardLibraryDefinitionsRoute = createRoute({
  method: 'get',
  path: '/{library}',
  tags: ['standard-library'],
  request: {
    params: z.object({
      library: z.string().openapi({ param: { name: 'library', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: StandardLibraryDefinitionsResponseSchema,
        },
      },
      description: 'List of definitions in a standard library',
    },
  },
});
