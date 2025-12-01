import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateWorkflowSchema,
  ulid,
  WorkflowCreateResponseSchema,
  WorkflowGetResponseSchema,
} from '../schemas.js';

export const workflows = new OpenAPIHono<{ Bindings: Env }>();

const createWorkflowRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['workflows'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWorkflowSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: WorkflowCreateResponseSchema,
        },
      },
      description: 'Workflow created successfully',
    },
  },
});

workflows.openapi(createWorkflowRoute, async (c) => {
  const validated = c.req.valid('json');
  using workflows = c.env.RESOURCES.workflows();
  const result = await workflows.create(validated);
  return c.json(result, 201);
});

const getWorkflowRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkflowGetResponseSchema,
        },
      },
      description: 'Workflow retrieved successfully',
    },
  },
});

workflows.openapi(getWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflows = c.env.RESOURCES.workflows();
  const result = await workflows.get(id);
  return c.json(result);
});

const startWorkflowRoute = createRoute({
  method: 'post',
  path: '/{id}/start',
  tags: ['workflows'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()).openapi({ example: { input: 'value' } }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              workflow_run_id: ulid(),
              durable_object_id: z.string(),
            })
            .openapi('WorkflowStartResponse'),
        },
      },
      description: 'Workflow execution started successfully',
    },
  },
});

workflows.openapi(startWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  using workflowsResource = c.env.RESOURCES.workflows();
  const result = await workflowsResource.start(id, input);

  // Trigger workflow execution via coordinator DO
  // For minimal implementation, send a mock execution request
  const coordinatorId = c.env.COORDINATOR.idFromName(result.durable_object_id);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);
  
  // Trigger execution by calling the DO's fetch with a special path
  try {
    const coordinatorResponse = await coordinator.fetch(
      new Request(`http://internal/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_run_id: result.workflow_run_id,
          input,
        }),
      }),
    );
    
    if (!coordinatorResponse.ok) {
      const errorText = await coordinatorResponse.text();
      console.error('Coordinator error:', errorText);
      throw new Error(`Coordinator returned ${coordinatorResponse.status}: ${errorText}`);
    }
  } catch (error) {
    console.error('Failed to trigger coordinator:', error);
    throw error;
  }

  return c.json(result);
});