/**
 * Log OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { LogsResponseSchema } from './schema';

export const getLogsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['logs'],
  request: {
    query: z.object({
      service: z.string().optional(),
      level: z.enum(['error', 'warn', 'info', 'debug', 'fatal']).optional(),
      eventType: z.string().optional(),
      traceId: z.string().optional(),
      requestId: z.string().optional(),
      workspaceId: z.string().optional(),
      projectId: z.string().optional(),
      userId: z.string().optional(),
      limit: z.coerce.number().int().positive().max(1000).optional().default(100),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: LogsResponseSchema,
        },
      },
      description: 'Logs retrieved successfully',
    },
  },
});
