# @wonder/sdk

Client SDK for interacting with the Wonder workflow orchestration platform.

## Usage

```typescript
import { WonderfulClient } from '@wonder/sdk';

const client = new WonderfulClient('https://your-api.workers.dev');

// Start a workflow and stream events
for await (const event of client.executeWorkflow({
  workflow_id: 'my-workflow-id',
  input: { name: 'World' },
})) {
  console.log(event.kind, event.payload);
}

// Note: In Node.js CLI scripts, call process.exit(0) after the loop
// WebSockets keep the event loop alive even after completion
process.exit(0);
```

## API

### `WonderfulClient`

#### `startWorkflow(input: WorkflowInput): Promise<WorkflowStartResponse>`

Start a workflow execution and get the run ID and Durable Object ID.

#### `streamEvents(durableObjectId: string): AsyncGenerator<WorkflowEvent>`

Connect to a workflow's event stream via WebSocket. Yields events as they occur.

#### `executeWorkflow(input: WorkflowInput): AsyncGenerator<WorkflowEvent>`

Convenience method that combines `startWorkflow` and `streamEvents`.

## Event Types

Events include:

- `workflow_started`, `workflow_completed`, `workflow_failed`
- `node_started`, `node_completed`, `node_failed`
- `token_spawned`, `token_merged`, `token_cancelled`
- `subworkflow_started`, `subworkflow_completed`
- `artifact_created`, `context_updated`

## WebSocket Lifecycle

WebSockets maintain persistent connections and keep the Node.js event loop alive even after `close()` is called. In CLI scripts, explicitly call `process.exit()` after consuming all events to terminate the process.
