import { Hono } from 'hono';

interface Env {
  API: any;
}

export const modelProfiles = new Hono<{ Bindings: Env }>();

modelProfiles.get('/', async (c) => {
  using modelProfiles = c.env.API.modelProfiles();
  const provider = c.req.query('provider');
  const filters = provider ? { provider } : undefined;
  const result = await modelProfiles.list(filters);
  return c.json(result);
});

modelProfiles.get('/:id', async (c) => {
  using modelProfiles = c.env.API.modelProfiles();
  const id = c.req.param('id');
  const result = await modelProfiles.get(id);
  return c.json(result);
});

modelProfiles.post('/', async (c) => {
  using modelProfiles = c.env.API.modelProfiles();
  const data = await c.req.json();
  const result = await modelProfiles.create(data);
  return c.json(result, 201);
});
