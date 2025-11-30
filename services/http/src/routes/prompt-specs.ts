import { Hono } from 'hono';

interface Env {
  API: any;
}

export const promptSpecs = new Hono<{ Bindings: Env }>();

promptSpecs.post('/', async (c) => {
  using promptSpecs = c.env.API.promptSpecs();
  const data = await c.req.json();
  const result = await promptSpecs.create(data);
  return c.json(result, 201);
});

promptSpecs.get('/:id', async (c) => {
  using promptSpecs = c.env.API.promptSpecs();
  const id = c.req.param('id');
  const result = await promptSpecs.get(id);
  return c.json(result);
});
