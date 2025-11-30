/**
 * Wonder HTTP Worker
 * Thin HTTP-to-RPC bridge for REST API and WebSocket gateway
 */

import { Hono } from 'hono';
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
  WORKFLOW_COORDINATOR: DurableObjectNamespace; // Direct DO binding for WebSocket upgrades
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors());

// Health check
app.get('/health', (c) => c.text('OK'));

// Mount resource routes
app.route('/api/workspaces', workspaces);
app.route('/api/projects', projects);
app.route('/api/actions', actions);
app.route('/api/prompt-specs', promptSpecs);
app.route('/api/model-profiles', modelProfiles);
app.route('/api/workflow-defs', workflowDefs);
app.route('/api/workflows', workflows);
app.route('/api/coordinator', coordinator);

export default app;
