import { Hono } from 'hono';

interface Env {
  API: any;
}

export const promptSpecs = new Hono<{ Bindings: Env }>();

promptSpecs.post('/', async (c) => {
  try {
    using promptSpecs = c.env.API.promptSpecs();
    const data = await c.req.json();
    const result = await promptSpecs.create(data);
    return c.json(result, 201);
  } catch (err) {
    console.error('Failed to create prompt spec:', err);
    return c.json(
      {
        error: 'Failed to create prompt spec',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      500,
    );
  }
});

promptSpecs.get('/:id', async (c) => {
  using promptSpecs = c.env.API.promptSpecs();
  const id = c.req.param('id');
  const result = await promptSpecs.get(id);
  return c.json(result);
});
