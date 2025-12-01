/**
 * Wonder HTTP Worker
 * Thin HTTP-to-RPC bridge for REST API and WebSocket gateway
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { actions } from './routes/actions';
import { coordinator } from './routes/coordinator';
import { modelProfiles } from './routes/model-profiles';
import { projects } from './routes/projects';
import { promptSpecs } from './routes/prompt-specs';
import { workflowDefs } from './routes/workflow-defs';
import { workflows } from './routes/workflows';
import { workspaces } from './routes/workspaces';

interface Env {
  API: any; // RPC binding to wonder-api
}

const app = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }
  },
});

// CORS middleware
app.use('/*', cors());

// Health check
app.get('/health', (c) => c.text('OK'));

// Mount resource routes
const routes = app
  .route('/api/workspaces', workspaces)
  .route('/api/projects', projects)
  .route('/api/actions', actions)
  .route('/api/prompt-specs', promptSpecs)
  .route('/api/model-profiles', modelProfiles)
  .route('/api/workflow-defs', workflowDefs)
  .route('/api/workflows', workflows)
  .route('/api/coordinator', coordinator);

// OpenAPI documentation
routes.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Wonder API',
    description: 'Workflow orchestration and AI coordination platform',
  },
});

export default routes;

// OpenAPIHono extends Hono, so we can safely cast for RPC client type inference
export type AppType = typeof routes;
