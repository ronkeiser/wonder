import { Hono } from 'hono';

interface Env {
  API: any;
}

export const projects = new Hono<{ Bindings: Env }>();

projects.post('/', async (c) => {
  using projects = c.env.API.projects();
  const data = await c.req.json();
  const result = await projects.create(data);
  return c.json(result, 201);
});

projects.get('/:id', async (c) => {
  using projects = c.env.API.projects();
  const id = c.req.param('id');
  const result = await projects.get(id);
  return c.json(result);
});

projects.delete('/:id', async (c) => {
  using projects = c.env.API.projects();
  const id = c.req.param('id');
  await projects.delete(id);
  return c.json({ success: true });
});
