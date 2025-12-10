# SDK Testing Utilities

WebSocket-based event streaming helpers for testing Wonder workflows.

## Installation

```typescript
import { createWonderTestClient } from '@wonder/sdk/testing';
```

## Usage

### Basic WebSocket Event Subscription

```typescript
import { createEventsTestingClient } from '@wonder/sdk/testing';

const events = createEventsTestingClient('https://wonder-http.your-env.workers.dev');

// Subscribe to workflow events
const subscription = await events.subscribe([
  {
    id: 'my-sub',
    stream: 'events',
    filters: { workflow_run_id: 'run_123' },
    callback: (event) => {
      console.log('Event:', event.event_type);
    },
  },
]);

// Clean up
subscription.close();
```

### Wait for Specific Events

```typescript
// Wait for a specific event
const completionEvent = await events.waitForEvent(
  'run_123',
  (event) => event.event_type === 'workflow_completed',
  { timeout: 30000 },
);

// Wait for workflow completion (convenience helper)
const status = await events.waitForCompletion('run_123', { timeout: 60000 });
console.log('Workflow status:', status); // 'completed' or 'failed'
```

### Full Test Client

The test client combines the auto-generated SDK with WebSocket helpers:

```typescript
import { createWonderTestClient } from '@wonder/sdk/testing';

const wonder = createWonderTestClient('https://wonder-http.your-env.workers.dev');

// Use SDK methods normally
const workspace = await wonder.workspaces.create({ name: 'Test' });
const workflow = await wonder['workflow-defs'].create({
  /* ... */
});

// Run workflow to completion and get all results
const result = await wonder.runWorkflow('workflow_123', { input: 'data' });

console.log('Run ID:', result.workflow_run_id);
console.log('Status:', result.status);
console.log('Events:', result.events.length);
console.log('Trace Events:', result.traceEvents.length);
```

### Multiple Stream Subscriptions

You can subscribe to both workflow events and trace events simultaneously:

```typescript
const subscription = await events.subscribe([
  {
    id: 'workflow-events',
    stream: 'events',
    filters: { workflow_run_id: 'run_123' },
    callback: (event) => console.log('Workflow event:', event.event_type),
  },
  {
    id: 'trace-events',
    stream: 'trace',
    filters: {
      workflow_run_id: 'run_123',
      category: 'decision',
    },
    callback: (event) => console.log('Trace event:', event.type),
  },
]);
```

### Filtering Options

Server-side filtering reduces network traffic and client-side processing:

```typescript
const filters = {
  // Workflow context
  workflow_run_id: 'run_123',
  parent_run_id: 'run_000',
  workspace_id: 'ws_123',
  project_id: 'proj_123',

  // Event classification
  event_type: 'node_completed',
  event_types: ['node_started', 'node_completed'],

  // Execution elements
  node_id: 'node_abc',
  token_id: 'tok_xyz',
  path_id: 'path_001',

  // Trace event specific
  category: 'decision',
  type: 'evaluate_transitions',
  min_duration_ms: 100,
};
```

## Architecture

The WebSocket helpers connect to the Events service's Streamer DO:

```
SDK Test Client
    ↓
WebSocket (wss://wonder-events.{env}.workers.dev/stream)
    ↓
Streamer DO (services/events/src/streamer.ts)
    ↓
Server-side filtering → Event broadcast
```

The Streamer DO:

- Accepts WebSocket connections at `/stream`
- Handles subscription messages (subscribe/unsubscribe)
- Filters events server-side based on subscription filters
- Broadcasts matching events to subscribed clients
- Sends recent event history (last 5 minutes) on connection

## API Reference

### EventsTestingClient

**`subscribe(subscriptions)`**

- Creates WebSocket connection and sends subscription messages
- Returns `EventStreamSubscription` with `close()`, `onEvent()`, `onError()` methods

**`waitForEvent(workflowRunId, predicate, options)`**

- Waits for any event matching the predicate function
- Returns Promise that resolves with the matching event
- Options: `{ timeout?: number, stream?: 'events' | 'trace' }`

**`waitForCompletion(workflowRunId, options)`**

- Convenience method for waiting for workflow completion
- Returns Promise<'completed' | 'failed'>
- Options: `{ timeout?: number }`

### WonderTestClient

**`runWorkflow(workflowId, input, options)`**

- Starts workflow via SDK
- Waits for completion via WebSocket
- Fetches all events, trace events
- Returns complete workflow run results
- Options: `{ timeout?: number }`

## Notes

- WebSocket subscriptions are real-time - no polling delays
- Server-side filtering reduces network traffic
- Trace events require `TRACE_EVENTS_ENABLED=true` in Coordinator environment
- HTTP endpoints (`/api/events`, `/api/events/trace`) need to be added to HTTP service for `runWorkflow()` to fetch results
