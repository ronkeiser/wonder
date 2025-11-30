/**
 * Wonder HTTP Worker
 * Thin HTTP-to-RPC bridge for REST API and WebSocket gateway
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  API: any; // RPC binding to wonder-api
  WORKFLOW_COORDINATOR: DurableObjectNamespace; // Direct DO binding for WebSocket upgrades
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors());

// Health check
app.get('/health', (c) => c.text('OK'));

// Projects
app.post('/api/projects', async (c) => {
  using projects = c.env.API.projects();
  const data = await c.req.json();
  const result = await projects.create(data);
  return c.json(result, 201);
});

app.get('/api/projects/:id', async (c) => {
  using projects = c.env.API.projects();
  const id = c.req.param('id');
  const result = await projects.get(id);
  return c.json(result);
});

app.delete('/api/projects/:id', async (c) => {
  using projects = c.env.API.projects();
  const id = c.req.param('id');
  await projects.delete(id);
  return c.json({ success: true });
});

// Actions
app.post('/api/actions', async (c) => {
  using actions = c.env.API.actions();
  const data = await c.req.json();
  const result = await actions.create(data);
  return c.json(result, 201);
});

app.get('/api/actions/:id', async (c) => {
  using actions = c.env.API.actions();
  const id = c.req.param('id');
  const result = await actions.get(id);
  return c.json(result);
});

// Prompt Specs
app.post('/api/prompt-specs', async (c) => {
  using promptSpecs = c.env.API.promptSpecs();
  const data = await c.req.json();
  const result = await promptSpecs.create(data);
  return c.json(result, 201);
});

app.get('/api/prompt-specs/:id', async (c) => {
  using promptSpecs = c.env.API.promptSpecs();
  const id = c.req.param('id');
  const result = await promptSpecs.get(id);
  return c.json(result);
});

// Model Profiles
app.get('/api/model-profiles', async (c) => {
  using modelProfiles = c.env.API.modelProfiles();
  const provider = c.req.query('provider');
  const filters = provider ? { provider } : undefined;
  const result = await modelProfiles.list(filters);
  return c.json(result);
});

app.get('/api/model-profiles/:id', async (c) => {
  using modelProfiles = c.env.API.modelProfiles();
  const id = c.req.param('id');
  const result = await modelProfiles.get(id);
  return c.json(result);
});

app.post('/api/model-profiles', async (c) => {
  using modelProfiles = c.env.API.modelProfiles();
  const data = await c.req.json();
  const result = await modelProfiles.create(data);
  return c.json(result, 201);
});

// Workflow Definitions
app.post('/api/workflow-defs', async (c) => {
  using workflowDefs = c.env.API.workflowDefs();
  const data = await c.req.json();
  const result = await workflowDefs.create(data);
  return c.json(result, 201);
});

app.get('/api/workflow-defs/:id', async (c) => {
  using workflowDefs = c.env.API.workflowDefs();
  const id = c.req.param('id');
  const version = c.req.query('version');
  const result = await workflowDefs.get(id, version ? parseInt(version) : undefined);
  return c.json(result);
});

app.get('/api/workflow-defs/owner/:owner', async (c) => {
  using workflowDefs = c.env.API.workflowDefs();
  const owner = c.req.param('owner');
  const result = await workflowDefs.listByOwner(owner);
  return c.json(result);
});

// Workflows (bindings)
app.post('/api/workflows', async (c) => {
  using workflows = c.env.API.workflows();
  const data = await c.req.json();
  const result = await workflows.create(data);
  return c.json(result, 201);
});

app.get('/api/workflows/:id', async (c) => {
  using workflows = c.env.API.workflows();
  const id = c.req.param('id');
  const result = await workflows.get(id);
  return c.json(result);
});

app.post('/api/workflows/:id/start', async (c) => {
  using workflows = c.env.API.workflows();
  const id = c.req.param('id');
  const input = await c.req.json();
  const result = await workflows.start(id, input);
  return c.json(result);
});

// WebSocket event streaming: /api/coordinator/:doId/stream
app.get('/api/coordinator/:doId/stream', async (c) => {
  const doId = c.req.param('doId');
  const upgradeHeader = c.req.header('Upgrade');

  if (upgradeHeader !== 'websocket') {
    return c.json(
      {
        error: 'WebSocket upgrade required',
        received_upgrade: upgradeHeader,
      },
      400,
    );
  }

  try {
    // Get DO stub directly and forward WebSocket upgrade
    const id = c.env.WORKFLOW_COORDINATOR.idFromString(doId);
    const stub = c.env.WORKFLOW_COORDINATOR.get(id);

    // Create new request with /stream path for DO
    const url = new URL(c.req.url);
    url.pathname = '/stream';
    const doRequest = new Request(url, c.req.raw);

    return await stub.fetch(doRequest);
  } catch (err) {
    return c.json(
      {
        error: 'Invalid durable object ID',
        message: err instanceof Error ? err.message : String(err),
      },
      400,
    );
  }
});

export default app;
