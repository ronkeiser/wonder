/**
 * Workflow Run OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const streamWorkflowRunRoute = createRoute({
  method: 'get',
  path: '/{id}/stream',
  tags: ['workflow-runs'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    101: {
      description: 'WebSocket connection established',
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            received_upgrade: z.string().optional(),
          }),
        },
      },
      description: 'WebSocket upgrade required',
    },
  },
});
