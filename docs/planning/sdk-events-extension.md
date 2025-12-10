# SDK Extension Strategy for E2E Test Support

## Overview

This strategy extends the SDK to support E2E test validation using workflow events and trace events.

**Current Limitations:**

- Events service has RPC methods but no HTTP endpoints for external access
- SDK has no methods to query or stream events
- Tests can't validate workflow execution beyond initial start
- No WebSocket subscription helpers for real-time event streaming

**Proposed Extensions:**

1. **Streamer DO Enhancement** - Add message-based subscriptions with server-side filtering to existing `/stream` WebSocket endpoint
2. **HTTP Event Routes** - Add REST endpoints (`GET /api/events`, `GET /api/events/trace`) to expose Events service RPC via OpenAPI
3. **SDK Testing Module** - Create `@wonder/sdk/testing` with WebSocket helpers that wrap auto-generated SDK + native WebSocket APIs
4. **Test Client Wrapper** - Combine SDK + events client with helper method `runWorkflow()` for end-to-end test orchestration

**What Gets Auto-Generated from OpenAPI:**

- `GET /api/events` → `sdk.getEvents(params)` - Query workflow events (one-time snapshots)
- `GET /api/events/trace` → `sdk.getTraceEvents(params)` - Query trace events (one-time snapshots)

**What Requires Custom SDK Testing Module:**

- `subscribe(filters, callback)` - WebSocket connection management + message handling
- `waitForEvent(workflowRunId, predicate)` - WebSocket-based wait for arbitrary event matching predicate
- `waitForCompletion(workflowRunId)` - WebSocket-based completion detection (wraps waitForEvent)
- `runWorkflow(workflowId, input, options)` - End-to-end helper: start workflow, wait for completion, fetch all events/trace/context

These helpers provide WebSocket functionality (not covered by OpenAPI) and test orchestration patterns. All HTTP queries use the auto-generated SDK directly, which already returns unwrapped data.

**Key Capabilities Enabled:**

- Query workflow events and trace events via auto-generated SDK methods
- Subscribe to event streams with server-side filtering (workflow_run_id, event_type, category, etc.)
- Wait for workflow completion using WebSocket subscriptions (real-time, no polling delay)
- Validate execution path, token lifecycle, context state, and performance via trace events
- Use same stream for both events and trace events with message discrimination

**Benefits:**

- Type-safe end-to-end
- Works in both local (Miniflare) and deployed (preview/staging) environments
- Production parity - same events used for debugging and testing
- Fast feedback - event-driven validation instead of timeouts
- Minimal code duplication - HTTP routes are thin wrappers over existing RPC

## Current State

### Events Service (RPC)

The Events service provides:

**Workflow Events RPC:**

- `write(context, input)` - Write single event
- `getEvents(options)` - Query events with filters
- Broadcasts to WebSocket clients via Streamer DO

**Trace Events RPC:**

- `writeTraceEvent(context, event)` - Write single trace event
- `writeTraceEvents(batch)` - Write batch of trace events
- `getTraceEvents(options)` - Query trace events with filters

**HTTP Endpoints (via fetch):**

- `GET /events?workflow_run_id=...` - Query workflow events
- `GET /` - UI for viewing events
- `GET /stream` - WebSocket connection for real-time streaming

**Missing:**

- No HTTP endpoint for trace events
- No SDK wrapper methods
- No WebSocket subscription helpers for testing

### SDK Current State

- Auto-generated from OpenAPI spec
- Builders for workflows, nodes, transitions, schemas
- Direct fetch client access via `createWonderClient(baseUrl)`
- No event/trace event methods

## Recommended Strategy

### Phase 1: HTTP Service Event Routes

Add event routes to HTTP service to expose Events service RPC via REST:

```typescript
// services/http/src/routes/event/route.ts

import { createRoute, z } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';

const app = new OpenAPIHono<{ Bindings: Env }>();

// Workflow events
const getEventsRoute = createRoute({
  method: 'get',
  path: '/',
  request: {
    query: z.object({
      workflow_run_id: z.string().optional(),
      parent_run_id: z.string().optional(),
      workspace_id: z.string().optional(),
      project_id: z.string().optional(),
      event_type: z.string().optional(),
      node_id: z.string().optional(),
      token_id: z.string().optional(),
      limit: z.coerce.number().optional(),
      after_sequence: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of workflow events',
      content: {
        'application/json': {
          schema: z.object({
            events: z.array(z.any()), // EventEntry[]
          }),
        },
      },
    },
  },
});

app.openapi(getEventsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.EVENTS.getEvents(query);
  return c.json(result);
});

// Trace events
const getTraceEventsRoute = createRoute({
  method: 'get',
  path: '/trace',
  request: {
    query: z.object({
      workflow_run_id: z.string().optional(),
      token_id: z.string().optional(),
      node_id: z.string().optional(),
      type: z.string().optional(),
      category: z.enum(['decision', 'operation', 'dispatch', 'sql']).optional(),
      workspace_id: z.string().optional(),
      project_id: z.string().optional(),
      limit: z.coerce.number().optional(),
      min_duration_ms: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of trace events',
      content: {
        'application/json': {
          schema: z.object({
            events: z.array(z.any()), // TraceEventInput[]
          }),
        },
      },
    },
  },
});

app.openapi(getTraceEventsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.EVENTS.getTraceEvents(query);
  return c.json(result);
});

export const events = app;
```

```typescript
// services/http/src/index.ts

import { events } from './routes/event/route';

const routes = app
  .route('/api/workspaces', workspaces)
  // ... existing routes
  .route('/api/events', events); // Add events route
```

### Phase 2: WebSocket Subscription Enhancement

Update Streamer DO to support message-based subscriptions:

```typescript
// services/events/src/streamer.ts

interface SubscriptionFilter {
  // Workflow execution context
  workflow_run_id?: string;
  parent_run_id?: string;
  workspace_id?: string;
  project_id?: string;

  // Event classification
  event_type?: string;
  event_types?: string[];

  // Execution elements
  node_id?: string;
  token_id?: string;
  path_id?: string;

  // Trace event specific
  category?: 'decision' | 'operation' | 'dispatch' | 'sql';
  type?: string;
  min_duration_ms?: number;
}

interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  id: string; // Client-provided subscription ID
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
}

interface Subscription {
  id: string;
  stream: 'events' | 'trace';
  filters: SubscriptionFilter;
}

export class Streamer extends DurableObject {
  private db = drizzle(this.env.DB);
  private subscriptions = new WeakMap<WebSocket, Map<string, Subscription>>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Serve the UI on the root path
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(uiHTML, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Handle WebSocket connections on /stream
    if (url.pathname === '/stream') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      // Initialize empty subscription map for this connection
      this.subscriptions.set(server, new Map());

      // Send recent events (last 5 minutes) to initialize the client
      await this.sendRecentEvents(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle incoming WebSocket messages for subscription management
   */
  webSocketMessage(ws: WebSocket, message: string): void {
    try {
      const msg = JSON.parse(message) as SubscriptionMessage;
      const subs = this.subscriptions.get(ws);

      if (!subs) return;

      if (msg.type === 'subscribe') {
        subs.set(msg.id, {
          id: msg.id,
          stream: msg.stream,
          filters: msg.filters,
        });
      } else if (msg.type === 'unsubscribe') {
        subs.delete(msg.id);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid subscription message',
        }),
      );
    }
  }

  /**
   * Broadcast workflow event to subscribed clients
   */
  broadcastEvent(eventEntry: EventEntry): void {
    this.ctx.getWebSockets().forEach((ws) => {
      const subs = this.subscriptions.get(ws);
      if (!subs) return;

      // Find matching subscriptions
      for (const sub of subs.values()) {
        if (sub.stream === 'events' && this.matchesEventFilter(eventEntry, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'event',
                stream: 'events',
                subscription_id: sub.id,
                event: eventEntry,
              }),
            );
          } catch (error) {
            console.error('Error broadcasting event to WebSocket:', error);
          }
        }
      }
    });
  }

  /**
   * Broadcast trace event to subscribed clients
   */
  broadcastTraceEvent(traceEntry: TraceEventEntry): void {
    this.ctx.getWebSockets().forEach((ws) => {
      const subs = this.subscriptions.get(ws);
      if (!subs) return;

      // Find matching subscriptions
      for (const sub of subs.values()) {
        if (sub.stream === 'trace' && this.matchesTraceFilter(traceEntry, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'event',
                stream: 'trace',
                subscription_id: sub.id,
                event: traceEntry,
              }),
            );
          } catch (error) {
            console.error('Error broadcasting trace event to WebSocket:', error);
          }
        }
      }
    });
  }

  /**
   * Check if workflow event matches subscription filter
   */
  private matchesEventFilter(event: EventEntry, filter: SubscriptionFilter): boolean {
    if (filter.workflow_run_id && event.workflow_run_id !== filter.workflow_run_id) return false;
    if (filter.parent_run_id && event.parent_run_id !== filter.parent_run_id) return false;
    if (filter.workspace_id && event.workspace_id !== filter.workspace_id) return false;
    if (filter.project_id && event.project_id !== filter.project_id) return false;
    if (filter.node_id && event.node_id !== filter.node_id) return false;
    if (filter.token_id && event.token_id !== filter.token_id) return false;
    if (filter.path_id && event.path_id !== filter.path_id) return false;
    if (filter.event_type && event.event_type !== filter.event_type) return false;
    if (filter.event_types && !filter.event_types.includes(event.event_type)) return false;

    return true;
  }

  /**
   * Check if trace event matches subscription filter
   */
  private matchesTraceFilter(event: TraceEventEntry, filter: SubscriptionFilter): boolean {
    if (filter.workflow_run_id && event.workflow_run_id !== filter.workflow_run_id) return false;
    if (filter.workspace_id && event.workspace_id !== filter.workspace_id) return false;
    if (filter.project_id && event.project_id !== filter.project_id) return false;
    if (filter.token_id && event.token_id !== filter.token_id) return false;
    if (filter.node_id && event.node_id !== filter.node_id) return false;
    if (filter.category && event.category !== filter.category) return false;
    if (filter.type && event.type !== filter.type) return false;
    if (
      filter.min_duration_ms &&
      (!event.duration_ms || event.duration_ms < filter.min_duration_ms)
    )
      return false;

    return true;
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    this.subscriptions.delete(ws);
    ws.close(code, reason);
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.error('WebSocket error:', error);
    this.subscriptions.delete(ws);
  }
}
```

Update Events service to broadcast trace events:

```typescript
// services/events/src/index.ts

export class EventsService extends WorkerEntrypoint<Env> {
  // ... existing code ...

  /**
   * RPC method - writes event to D1 and broadcasts to WebSocket
   */
  write(context: EventContext, input: EventInput): void {
    this.ctx.waitUntil(
      (async () => {
        try {
          const eventEntry = {
            id: ulid(),
            timestamp: Date.now(),
            ...context,
            ...input,
            sequence_number: input.sequence_number ?? 0,
            metadata: JSON.stringify(input.metadata || {}),
          };

          await this.db.insert(workflowEvents).values(eventEntry);

          // Broadcast to WebSocket clients
          const id = this.env.STREAMER.idFromName('events-streamer');
          const stub = this.env.STREAMER.get(id);
          await stub.broadcastEvent(eventEntry);
        } catch (error) {
          console.error('[EVENTS] Failed to process event:', error);
        }
      })(),
    );
  }

  /**
   * RPC method - writes trace event to D1 and broadcasts to WebSocket
   */
  writeTraceEvent(context: TraceEventContext, event: TraceEventInput & { sequence: number }): void {
    this.ctx.waitUntil(
      (async () => {
        try {
          const entry: TraceEventEntry = {
            id: ulid(),
            timestamp: Date.now(),
            ...context,
            ...event,
            category: getEventCategory(event.type),
            token_id: event.token_id ?? null,
            node_id: event.node_id ?? null,
            duration_ms: event.duration_ms ?? null,
            payload: JSON.stringify(event),
          };

          await this.db.insert(traceEvents).values(entry);

          // Broadcast to WebSocket clients
          const id = this.env.STREAMER.idFromName('events-streamer');
          const stub = this.env.STREAMER.get(id);
          await stub.broadcastTraceEvent(entry);
        } catch (error) {
          console.error('[EVENTS] Failed to process trace event:', error);
        }
      })(),
    );
  }
}
```

### Phase 3: HTTP Routes for Events

Add HTTP routes to expose Events service via REST. These will be auto-generated into the SDK via OpenAPI:

```typescript
// services/http/src/routes/event/route.ts

import { createRoute, z } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';

const app = new OpenAPIHono<{ Bindings: Env }>();

// GET /api/events - Query workflow events
const getEventsRoute = createRoute({
  method: 'get',
  path: '/',
  request: {
    query: z.object({
      workflow_run_id: z.string().optional(),
      parent_run_id: z.string().optional(),
      workspace_id: z.string().optional(),
      project_id: z.string().optional(),
      event_type: z.string().optional(),
      node_id: z.string().optional(),
      token_id: z.string().optional(),
      limit: z.coerce.number().optional(),
      after_sequence: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of workflow events',
      content: {
        'application/json': {
          schema: z.object({
            events: z.array(z.any()),
          }),
        },
      },
    },
  },
});

app.openapi(getEventsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.EVENTS.getEvents(query);
  return c.json(result);
});

// GET /api/events/trace - Query trace events
const getTraceEventsRoute = createRoute({
  method: 'get',
  path: '/trace',
  request: {
    query: z.object({
      workflow_run_id: z.string().optional(),
      token_id: z.string().optional(),
      node_id: z.string().optional(),
      type: z.string().optional(),
      category: z.enum(['decision', 'operation', 'dispatch', 'sql']).optional(),
      workspace_id: z.string().optional(),
      project_id: z.string().optional(),
      limit: z.coerce.number().optional(),
      min_duration_ms: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of trace events',
      content: {
        'application/json': {
          schema: z.object({
            events: z.array(z.any()),
          }),
        },
      },
    },
  },
});

app.openapi(getTraceEventsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.EVENTS.getTraceEvents(query);
  return c.json(result);
});

export const events = app;
```

```typescript
// services/http/src/index.ts

import { events } from './routes/event/route';

const routes = app
  .route('/api/workspaces', workspaces)
  .route('/api/projects', projects)
  // ... existing routes
  .route('/api/events', events);
```

### Phase 4: SDK Extension Module

Create WebSocket utilities and configure SDK for testing:

```typescript
// packages/sdk/src/testing/events.ts

import type { paths } from '../generated/schema';
import type { Client } from 'openapi-fetch';

export interface SubscriptionFilter {
  workflow_run_id?: string;
  parent_run_id?: string;
  workspace_id?: string;
  project_id?: string;
  event_type?: string;
  event_types?: string[];
  node_id?: string;
  token_id?: string;
  path_id?: string;
  category?: 'decision' | 'operation' | 'dispatch' | 'sql';
  type?: string;
  min_duration_ms?: number;
}

export interface EventStreamSubscription {
  close(): void;
  onEvent(callback: (event: any) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface EventsTestingClient {
  /**
   * Subscribe to event/trace stream via WebSocket with server-side filtering
   */
  subscribe(
    subscriptions: Array<{
      id: string;
      stream: 'events' | 'trace';
      filters: SubscriptionFilter;
      callback: (event: any) => void;
    }>,
  ): Promise<EventStreamSubscription>;

  /**
   * Wait for any event matching predicate via WebSocket subscription
   */
  waitForEvent(
    workflowRunId: string,
    predicate: (event: any) => boolean,
    options?: { timeout?: number; stream?: 'events' | 'trace' },
  ): Promise<any>;

  /**
   * Wait for workflow completion via WebSocket subscription
   */
  waitForCompletion(
    workflowRunId: string,
    options?: { timeout?: number },
    sdk: Client<paths>,
  ): Promise<'completed' | 'failed'>;
}

/**
 * Create events testing client
 */
export function createEventsTestingClient(baseUrl: string, sdk: Client<paths>): EventsTestingClient {
  const eventsUrl = baseUrl.replace('wonder-http', 'wonder-events');
  const wsUrl = eventsUrl.replace('https://', 'wss://').replace('http://', 'ws://');

  return {
    /**
     * Subscribe to event/trace stream via WebSocket with server-side filtering.
     * Returns a subscription object that can be closed.
     */
    async subscribe(subscriptions) {
      const ws = new WebSocket(`${wsUrl}/stream`);
      const callbacks = new Map(subscriptions.map((s) => [s.id, s.callback]));

      await new Promise<void>((resolve, reject) => {
        ws.addEventListener('open', () => {
          // Send subscription messages
          for (const sub of subscriptions) {
            ws.send(
              JSON.stringify({
                type: 'subscribe',
                id: sub.id,
                stream: sub.stream,
                filters: sub.filters,
              }),
            );
          }
          resolve();
        });

        ws.addEventListener('error', () => {
          reject(new Error('WebSocket connection failed'));
        });
      });

      // Handle incoming messages
      ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'event' && data.subscription_id) {
          const callback = callbacks.get(data.subscription_id);
          if (callback) {
            callback(data.event);
          }
        }
      });

      return {
        close() {
          ws.close();
        },
        onEvent(callback) {
          ws.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'event') {
              callback(data.event);
            }
          });
        },
        onError(callback) {
          ws.addEventListener('error', () => {
            callback(new Error('WebSocket error'));
          });
        },
      };
    },

    /**
     * Wait for any event matching predicate via WebSocket subscription.
     * Returns the first event that matches the predicate.
     */
    async waitForEvent(workflowRunId, predicate, options = {}) {
      const timeout = options.timeout ?? 30000;
      const stream = options.stream ?? 'events';

      let subscription: EventStreamSubscription | null = null;

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          subscription?.close();
          reject(new Error(`Timeout waiting for event after ${timeout}ms`));
        }, timeout);

        this.subscribe([
          {
            id: 'wait-event',
            stream,
            filters: { workflow_run_id: workflowRunId },
            callback: (event) => {
              if (predicate(event)) {
                clearTimeout(timeoutId);
                subscription?.close();
                resolve(event);
              }
            },
          },
    /**
     * Wait for workflow completion via WebSocket subscription.
     * Returns 'completed' or 'failed' based on the completion event.
     */
    async waitForCompletion(workflowRunId, options = {}, sdk) {
      // First check if already completed via HTTP to avoid race condition
      const { data } = await sdk.GET('/api/events', {
        params: {
          query: {
            workflow_run_id: workflowRunId,
            event_type: 'workflow_completed,workflow_failed'
          }
        }
      });

      if (data?.events && data.events.length > 0) {
        const event = data.events[0];
        return event.event_type === 'workflow_completed' ? 'completed' : 'failed';
      }

      // Not completed yet, subscribe and wait
      const event = await this.waitForEvent(
        workflowRunId,
        (e) => e.event_type === 'workflow_completed' || e.event_type === 'workflow_failed',
        options,
      );

      return event.event_type === 'workflow_completed' ? 'completed' : 'failed';
    },
  };
}
```

```typescript
// packages/sdk/src/testing/index.ts

export { createEventsTestingClient } from './events';
export type { EventsTestingClient, EventStreamSubscription, SubscriptionFilter } from './events';
```

```typescript
// packages/sdk/src/client.ts

// Note: SDK is generated with auto-unwrapping - all methods return response.data directly.
// See packages/sdk/src/generated/client.ts for implementation.
```

```typescript
// packages/sdk/src/index.ts

export * from './client';
export * from './testing';
```

### Phase 5: Test Helper Integration

Create test-specific wrapper that combines SDK with events client:

```typescript
// packages/test/src/helpers/wonder-test-client.ts

import { createEventsTestingClient } from '@wonder/sdk/testing';
import type { EventsTestingClient } from '@wonder/sdk/testing';
import { createWonderClient } from '@wonder/sdk';

export interface WonderTestClient extends ReturnType<typeof createWonderClient> {
  events: EventsTestingClient;

  /**
   * Helper: Run workflow to completion and return events
   */
  runWorkflow(
    workflowId: string,
    input: unknown,
    options?: { timeout?: number },
  ): Promise<{
    workflow_run_id: string;
    status: 'completed' | 'failed';
    events: EventEntry[];
    traceEvents: TraceEventEntry[];
    context: unknown;
  }>;
}

export function createWonderTestClient(baseUrl: string): WonderTestClient {
  const sdk = createWonderClient(baseUrl);
  const events = createEventsTestingClient(baseUrl, sdk);

  return {
    ...sdk,
    events,

    async runWorkflow(workflowId, input, options = {}) {
      // Start workflow using SDK directly
      // Note: Trace events are controlled by TRACE_EVENTS_ENABLED env var in coordinator,
      // not by HTTP headers. This is set at deployment/environment level.
      const response = await sdk.POST('/api/workflows/{id}/start', {
        params: { path: { id: workflowId } },
        body: input,
      });

      if (!response?.workflow_run_id) {
        throw new Error('Failed to start workflow');
      }

      const workflow_run_id = response.workflow_run_id;

      // Wait for completion via WebSocket
      const status = await events.waitForCompletion(workflow_run_id, options, sdk);

      // Fetch all events, trace events, and final context
      const [eventsData, traceData, context] = await Promise.all([
        sdk.GET('/api/events', {
          params: { query: { workflow_run_id } },
        }),
        sdk.GET('/api/events/trace', {
          params: { query: { workflow_run_id } },
        }),
        sdk.GET('/api/workflow-runs/{id}/context', {
          params: { path: { id: workflow_run_id } },
        }),
      ]);

      return {
        workflow_run_id,
        status,
        events: eventsData.events,
        traceEvents: traceData.events,
        context,
      };
    },
  };
}
```

### Phase 6: Update Test Client

```typescript
// packages/test/src/client.ts

import { createWonderTestClient } from './helpers/wonder-test-client';

export const wonder = createWonderTestClient(
  process.env.RESOURCES_URL || 'https://wonder-http.ron-keiser.workers.dev',
);
```

### Phase 7: Enhanced E2E Test Pattern

```typescript
// packages/test/src/tests/edge.test.ts

import { describe, expect, it } from 'vitest';
import { wonder } from '~/client';

describe('Edge Test - Hello World', () => {
  it('single hello world node with full validation', async () => {
    // Setup (workspace, project, model, prompt, action, workflow)
    // ... existing setup code ...

    // Execute workflow with helper
    const result = await wonder.runWorkflow(workflowId, {}, { timeout: 30000 });

    // Validate completion
    expect(result.status).toBe('completed');
    console.log('✓ Workflow completed successfully');

    // Validate execution path
    const nodeEvents = result.events.filter(
      (e) => e.event_type === 'node_started' || e.event_type === 'node_completed',
    );
    expect(nodeEvents).toHaveLength(2); // Started and completed

    // Validate token lifecycle via trace events
    const tokenCreates = result.traceEvents.filter((e) => e.type === 'operation.tokens.create');
    const tokenUpdates = result.traceEvents.filter(
      (e) => e.type === 'operation.tokens.update_status' && e.payload.to === 'completed',
    );
    expect(tokenCreates.length).toBe(tokenUpdates.length);

    // Validate no slow queries
    const sqlEvents = result.traceEvents.filter((e) => e.category === 'sql');
    const slowQueries = sqlEvents.filter((e) => e.duration_ms && e.duration_ms > 50);
    expect(slowQueries).toHaveLength(0);

    // Validate final context
    expect(result.context.output).toBeDefined();
    expect(result.context.output.message).toBeDefined();

    console.log('✓ All validations passed');
  });
});
```

## Benefits

1. **Type-safe**: Full TypeScript types from Events service to SDK
2. **Reusable**: Events client can be used in any test or debugging tool
3. **Flexible**: Supports both snapshots (getEvents) and real-time streaming (subscribe)
4. **Production parity**: Same events used in production for debugging
5. **Self-documenting**: Test assertions describe expected behavior
6. **Fast feedback**: Wait for events instead of arbitrary timeouts
7. **Debuggable**: Failed tests show exact event sequence
8. **Minimal duplication**: HTTP routes are thin wrappers over Events RPC
9. **OpenAPI compatible**: Event routes integrate with existing spec generation

## Implementation Order

1. ✅ **Events Service RPC exists** (already implemented)
2. **Update Streamer DO** - Add message-based subscription support (`services/events/src/streamer.ts`)
3. **Update Events Service** - Broadcast trace events to Streamer (`services/events/src/index.ts`)
4. **Add HTTP routes** - Event query endpoints (`services/http/src/routes/event/route.ts`)
5. **SDK testing module** - WebSocket subscription helpers (`packages/sdk/src/testing/events.ts`)
6. **Test client wrapper** - Combines SDK + events (`packages/test/src/helpers/wonder-test-client.ts`)
7. **Update test imports** - Use new client (`packages/test/src/client.ts`)
8. **Enhance E2E tests** - Add validation using events/trace events

## Alternative: Direct RPC Access

If HTTP routes add too much overhead, tests could directly call Events service RPC:

```typescript
// packages/test/src/helpers/direct-events-client.ts

import type EventsService from '@wonder/events';

export function createDirectEventsClient(env: { EVENTS: EventsService }) {
  return {
    async getEvents(options) {
      return env.EVENTS.getEvents(options);
    },
    async getTraceEvents(options) {
      return env.EVENTS.getTraceEvents(options);
    },
    // ... other methods call RPC directly
  };
}
```

**Trade-off**: Tests would require binding to EVENTS service (only possible in Miniflare/local), not deployable E2E tests.

## Recommendation

**Use HTTP routes + SDK wrapper approach:**

- Works for both local (Miniflare) and deployed (preview/staging) E2E tests
- Consistent with existing architecture (HTTP service as thin gateway)
- Enables external tools to query events (debugging, dashboards)
- OpenAPI spec auto-documents event endpoints
- Tests are production-like (HTTP, not direct RPC)
