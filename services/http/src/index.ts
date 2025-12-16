/**
 * Wonder HTTP Worker
 * Thin HTTP-to-RPC bridge for REST API and WebSocket gateway
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { auth } from './middleware/auth';
import { errorLoggerMiddleware } from './middleware/error';
import { loggerMiddleware } from './middleware/logger';
import { actions } from './routes/action/route';
import { events } from './routes/event/route';
import { logs } from './routes/log/route';
import { modelProfiles } from './routes/model-profile/route';
import { projects } from './routes/project/route';
import { promptSpecs } from './routes/prompt-spec/route';
import { taskDefs } from './routes/task-def/route';
import { workflowDefs } from './routes/workflow-def/route';
import { workflowRuns } from './routes/workflow-run/route';
import { workflows } from './routes/workflow/route';
import { workspaces } from './routes/workspace/route';
import type { HttpEnv } from './types';

const app = new OpenAPIHono<HttpEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      c.var.logger?.warn({
        event_type: 'validation_error',
        request_id: c.var.requestId,
        message: 'Request validation failed',
        metadata: { error: result.error },
      });
      return c.json({ error: result.error }, 400);
    }
  },
});

// CORS middleware
app.use('/*', cors());

// Logger middleware - creates logger instance and tracks request lifecycle
app.use('/*', loggerMiddleware);

// Error logging middleware - catches and logs errors
app.use('/*', errorLoggerMiddleware);

// Health check (no auth required)
app.get('/health', (c) => c.text('OK'));

// API key authentication for all API routes
app.use('/*', auth);

// Mount resource routes
const routes = app
  .route('/workspaces', workspaces)
  .route('/projects', projects)
  .route('/actions', actions)
  .route('/prompt-specs', promptSpecs)
  .route('/model-profiles', modelProfiles)
  .route('/task-defs', taskDefs)
  .route('/workflow-defs', workflowDefs)
  .route('/workflows', workflows)
  .route('/workflow-runs', workflowRuns)
  .route('/events', events)
  .route('/logs', logs);

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
