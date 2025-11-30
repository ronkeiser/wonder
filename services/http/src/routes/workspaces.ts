import { Hono } from 'hono';

interface Env {
  API: any;
}

export const workspaces = new Hono<{ Bindings: Env }>();

workspaces.post('/', async (c) => {
  try {
    using workspaces = c.env.API.workspaces();
    const data = await c.req.json();
    const result = await workspaces.create(data);
    return c.json(result, 201);
  } catch (err) {
    console.error('Failed to create workspace:', err);
    return c.json(
      {
        error: 'Failed to create workspace',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      500,
    );
  }
});

workspaces.get('/:id', async (c) => {
  try {
    using workspaces = c.env.API.workspaces();
    const id = c.req.param('id');
    const result = await workspaces.get(id);
    return c.json(result);
  } catch (err) {
    console.error('Failed to get workspace:', err);
    return c.json(
      {
        error: 'Failed to get workspace',
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

workspaces.delete('/:id', async (c) => {
  try {
    using workspaces = c.env.API.workspaces();
    const id = c.req.param('id');
    await workspaces.delete(id);
    return c.json({ success: true });
  } catch (err) {
    console.error('Failed to delete workspace:', err);
    return c.json(
      {
        error: 'Failed to delete workspace',
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
