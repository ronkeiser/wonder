import { Hono } from 'hono';

interface Env {
  API: any;
}

export const actions = new Hono<{ Bindings: Env }>();

actions.post('/', async (c) => {
  try {
    using actions = c.env.API.actions();
    const data = await c.req.json();
    const result = await actions.create(data);
    return c.json(result, 201);
  } catch (err) {
    console.error('Failed to create action:', err);
    return c.json(
      {
        error: 'Failed to create action',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      500,
    );
  }
});

actions.get('/:id', async (c) => {
  using actions = c.env.API.actions();
  const id = c.req.param('id');
  const result = await actions.get(id);
  return c.json(result);
});
