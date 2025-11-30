import { Hono } from 'hono';

interface Env {
  API: any;
}

export const workflowDefs = new Hono<{ Bindings: Env }>();

workflowDefs.post('/', async (c) => {
  try {
    using workflowDefs = c.env.API.workflowDefs();
    const data = await c.req.json();
    const result = await workflowDefs.create(data);
    return c.json(result, 201);
  } catch (err) {
    console.error('Failed to create workflow def:', err);
    return c.json(
      {
        error: 'Failed to create workflow def',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      500,
    );
  }
});

workflowDefs.get('/:id', async (c) => {
  using workflowDefs = c.env.API.workflowDefs();
  const id = c.req.param('id');
  const version = c.req.query('version');
  const result = await workflowDefs.get(id, version ? parseInt(version) : undefined);
  return c.json(result);
});

workflowDefs.get('/owner/:owner', async (c) => {
  using workflowDefs = c.env.API.workflowDefs();
  const owner = c.req.param('owner');
  const result = await workflowDefs.listByOwner(owner);
  return c.json(result);
});
