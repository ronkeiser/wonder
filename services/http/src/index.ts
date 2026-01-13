/**
 * Wonder HTTP Worker
 * Thin HTTP-to-RPC bridge for REST API and WebSocket gateway
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { auth } from './middleware/auth';
import { errorHandler, errorLoggerMiddleware } from './middleware/error';
import { loggerMiddleware } from './middleware/logger';
import { actions } from './routes/actions/route';
import { agents } from './routes/agents/route';
import { artifactTypes } from './routes/artifact-types/route';
import { conversations } from './routes/conversations/route';
import { events } from './routes/events/route';
import { logs } from './routes/logs/route';
import { messages } from './routes/messages/route';
import { modelProfiles } from './routes/model-profiles/route';
import { personas } from './routes/personas/route';
import { projects } from './routes/projects/route';
import { promptSpecs } from './routes/prompt-specs/route';
import { streams } from './routes/streams/route';
import { tasks } from './routes/tasks/route';
import { tools } from './routes/tools/route';
import { workflowDefs } from './routes/workflow-defs/route';
import { workflowRuns } from './routes/workflow-runs/route';
import { workflows } from './routes/workflows/route';
import { workspaces } from './routes/workspaces/route';
import type { HttpEnv } from './types';

const app = new OpenAPIHono<HttpEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      c.var.logger?.warn({
        eventType: 'validation_error',
        requestId: c.var.requestId,
        message: 'Request validation failed',
        metadata: { error: result.error },
      });
      return c.json({ error: result.error }, 400);
    }
  },
});

// Global error handler - returns structured JSON error responses
app.onError(errorHandler);

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
  .route('/actions', actions)
  .route('/agents', agents)
  .route('/artifact-types', artifactTypes)
  .route('/conversations', conversations)
  .route('/events', events)
  .route('/logs', logs)
  .route('/messages', messages)
  .route('/model-profiles', modelProfiles)
  .route('/personas', personas)
  .route('/projects', projects)
  .route('/prompt-specs', promptSpecs)
  .route('/streams', streams)
  .route('/tasks', tasks)
  .route('/tools', tools)
  .route('/workflow-defs', workflowDefs)
  .route('/workflow-runs', workflowRuns)
  .route('/workflows', workflows)
  .route('/workspaces', workspaces);

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
