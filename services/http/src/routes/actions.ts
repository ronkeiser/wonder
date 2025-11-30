import { Hono } from 'hono';

interface Env {
  API: any;
}

export const actions = new Hono<{ Bindings: Env }>();

actions.post('/', async (c) => {
  using actions = c.env.API.actions();
  const data = await c.req.json();
  const result = await actions.create(data);
  return c.json(result, 201);
});

actions.get('/:id', async (c) => {
  using actions = c.env.API.actions();
  const id = c.req.param('id');
  const result = await actions.get(id);
  return c.json(result);
});
