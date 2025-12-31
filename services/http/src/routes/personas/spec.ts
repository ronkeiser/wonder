import { createRoute, z } from '@hono/zod-openapi';
import {
  CreatePersonaSchema,
  PersonaCreateResponseSchema,
  PersonaGetResponseSchema,
  PersonaListResponseSchema,
} from './schema';

export const createPersonaRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['personas'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreatePersonaSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: PersonaCreateResponseSchema,
        },
      },
      description: 'Persona created successfully',
    },
  },
});

export const listPersonasRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['personas'],
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
          schema: PersonaListResponseSchema,
        },
      },
      description: 'Personas retrieved successfully',
    },
  },
});

export const getPersonaRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['personas'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PersonaGetResponseSchema,
        },
      },
      description: 'Persona retrieved successfully (latest version)',
    },
  },
});

export const getPersonaVersionRoute = createRoute({
  method: 'get',
  path: '/{id}/versions/{version}',
  tags: ['personas'],
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
          schema: PersonaGetResponseSchema,
        },
      },
      description: 'Persona version retrieved successfully',
    },
  },
});

export const deletePersonaRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['personas'],
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
      description: 'Persona deleted successfully (all versions)',
    },
  },
});

export const deletePersonaVersionRoute = createRoute({
  method: 'delete',
  path: '/{id}/versions/{version}',
  tags: ['personas'],
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
      description: 'Persona version deleted successfully',
    },
  },
});
