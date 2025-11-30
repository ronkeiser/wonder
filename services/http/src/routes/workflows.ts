import { Hono } from 'hono';

interface Env {
  API: any;
}

export const workflows = new Hono<{ Bindings: Env }>();

workflows.post('/', async (c) => {
  try {
    using workflows = c.env.API.workflows();
    const data = await c.req.json();
    const result = await workflows.create(data);
    return c.json(result, 201);
  } catch (err) {
    console.error('Failed to create workflow:', err);
    return c.json(
      {
        error: 'Failed to create workflow',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      500,
    );
  }
});

workflows.get('/:id', async (c) => {
  using workflows = c.env.API.workflows();
  const id = c.req.param('id');
  const result = await workflows.get(id);
  return c.json(result);
});

workflows.post('/:id/start', async (c) => {
  using workflows = c.env.API.workflows();
  const id = c.req.param('id');
  const input = await c.req.json();
  const result = await workflows.start(id, input);
  return c.json(result);
});
