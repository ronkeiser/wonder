# @wonder/sdk

Type-safe TypeScript SDK for the Wonder workflow orchestration platform.

## Overview

The SDK provides a unified client with four integrated layers:

1. **Resource Client** - Auto-generated resource-specific methods from OpenAPI spec
2. **Workflow Streaming** - Real-time workflow execution with event streaming
3. **WebSocket Events** - Low-level event streaming and subscription
4. **Raw HTTP Access** - Direct access to underlying HTTP client for custom requests
5. **Builder Helpers** - Ergonomic builders for creating workflow definitions, schemas, nodes, and transitions

## Quick Start

### Create a Client

```typescript
import { createClient } from '@wonder/sdk';

const wonder = createClient('https://wonder-http.ron-keiser.workers.dev');

// Resource client - CRUD operations
const workspaces = await wonder.workspaces.list();

// Workflow streaming - execute and stream events
const result = await wonder.workflows(workflowId).stream(input, options);

// Raw HTTP methods
const response = await wonder.GET('/api/custom-endpoint', {});
```

### Working with Resources

```typescript
import { createClient } from '@wonder/sdk';

const wonder = createClient('https://wonder-http.ron-keiser.workers.dev');

// List resources
const workspacesResponse = await wonder.workspaces.list();
console.log('Workspaces:', workspacesResponse?.workspaces);

// Create a resource
const createResponse = await wonder.workspaces.create({
  name: 'My Workspace',
  description: 'A workspace for AI workflows',
});
console.log('Created workspace:', createResponse?.workspace);

// Get a specific resource by ID
const workspace = await wonder.workspaces('workspace-id').get();

// Update a resource
await wonder.workspaces('workspace-id').patch({
  name: 'Updated Name',
});

// Delete a resource
await wonder.workspaces('workspace-id').delete();
```

### Streaming Workflow Execution

The SDK uses a two-phase workflow execution to guarantee zero event loss:

```typescript
import { createClient } from '@wonder/sdk';

const wonder = createClient('https://wonder-http.ron-keiser.workers.dev');

// Stream workflow execution with all events
const result = await wonder.workflows(workflowId).stream(
  { topic: 'AI workflows' },
  {
    timeout: 60000,
    idleTimeout: 10000,
  },
);

console.log('Status:', result.status); // 'completed' | 'failed' | 'timeout' | 'idle_timeout'
console.log('Events:', result.events.length);
console.log('Trace Events:', result.traceEvents.length);

// Stream with custom termination condition
const result = await wonder.workflows(workflowId).stream(input, {
  until: (event) => event.event_type === 'node_completed' && event.node_id === 'step3',
  timeout: 30000,
});

// Stream with event filtering
const result = await wonder.workflows(workflowId).stream(input, {
  subscribe: {
    event_types: ['workflow_started', 'workflow_completed', 'workflow_failed'],
  },
});
```

**How it works:**

1. Creates a workflow run (status: `pending`)
2. Subscribes to WebSocket events for that run
3. Starts execution after subscription is established
4. Collects events as they stream in real-time
5. Closes when workflow completes, fails, times out, or custom predicate matches
6. Returns all collected events

**Stream Options:**

- `subscribe`: Event filters (event_types, category, etc.)
- `until`: Custom predicate to determine when to close
- `timeout`: Total execution timeout (default: 5 minutes)
- `idleTimeout`: Max time between events (default: 30 seconds)

### Low-Level Event Streaming

For more control over event streaming:

```typescript
import { createClient } from '@wonder/sdk';

const wonder = createClient('https://wonder-http.ron-keiser.workers.dev');

// Wait for workflow completion
const status = await wonder.events.waitForCompletion('run_id', { timeout: 60000 });

// Subscribe to event streams
const subscription = await wonder.events.subscribe([
  {
    id: 'my-sub',
    stream: 'events',
    filters: { workflow_run_id: 'run_123' },
    callback: (event) => console.log('Event:', event.event_type),
  },
]);
subscription.close();

// Wait for specific events
const event = await wonder.events.waitForEvent(
  'run_123',
  (e) => e.event_type === 'node_completed' && e.node_id === 'process',
  { timeout: 30000, stream: 'events' },
);

// List events via HTTP
const eventsData = await wonder.events.list({
  workflow_run_id: 'run_123',
  event_type: 'node_started',
});
```

### Raw HTTP Methods

Access the underlying HTTP client for custom requests:

```typescript
import { createClient } from '@wonder/sdk';

const wonder = createClient('https://wonder-http.ron-keiser.workers.dev');

// Raw GET
const response = await wonder.GET('/api/workspaces', {});

// Raw POST
await wonder.POST('/api/workspaces', {
  body: { name: 'Test', description: 'Created via raw HTTP' },
});

// Other HTTP methods
await wonder.PUT('/api/resource/{id}', { params: { path: { id: '123' } }, body: {...} });
await wonder.DELETE('/api/resource/{id}', { params: { path: { id: '123' } } });
await wonder.PATCH('/api/resource/{id}', { params: { path: { id: '123' } }, body: {...} });
```

### Using Workflow Builders

```typescript
import { schema, node, transition, workflowDef } from '@wonder/sdk';

// Create a workflow definition using builders
const myWorkflow = workflowDef({
  name: 'Content Generator',
  description: 'Generates content based on a topic',
  input_schema: schema.object({
    topic: schema.string({ minLength: 1 }),
    tone: schema.string({ enum: ['formal', 'casual', 'technical'] }),
  }),
  output_schema: schema.object({
    content: schema.string(),
    wordCount: schema.integer({ minimum: 0 }),
  }),
  context_schema: schema.object({
    apiKey: schema.string(),
  }),
  initial_node_ref: 'generate',
  nodes: [
    node({
      ref: 'generate',
      name: 'Generate Content',
      action_id: 'llm-call',
      action_version: 1,
      input_mapping: {
        prompt: '$.input.topic',
        tone: '$.input.tone',
        api_key: '$.context.apiKey',
      },
    }),
    node({
      ref: 'validate',
      name: 'Validate Output',
      action_id: 'validator',
      input_mapping: {
        content: '$.generate.output',
      },
    }),
  ],
  transitions: [
    transition({
      from_node_ref: 'generate',
      to_node_ref: 'validate',
      priority: 1,
    }),
  ],
  output_mapping: {
    content: '$.validate.content',
    wordCount: '$.validate.wordCount',
  },
});

// Create the workflow via API
const workflowDefResponse = await wonder['workflow-defs'].create(myWorkflow);
console.log('Created workflow:', workflowDefResponse?.workflow_def);
```

## Builder API

### Schema Builders

Create JSON Schema definitions with type safety:

```typescript
import { schema } from '@wonder/sdk';

// Basic types
const str = schema.string();
const num = schema.integer({ min: 1, max: 100 });
const bool = schema.boolean();
const nullable = schema.null();

// Complex types
const obj = schema.object(
  {
    name: schema.string({ minLength: 1 }),
    age: schema.integer({ min: 0 }),
    email: schema.string({ pattern: '^[^@]+@[^@]+\\.[^@]+$' }),
  },
  { required: ['name', 'email'] },
);

const arr = schema.array(schema.string(), { minItems: 1, maxItems: 10, uniqueItems: true });

// Enums
const status = schema.enum(['pending', 'active', 'completed']);
```

### Node Builder

Create workflow nodes:

```typescript
import { node } from '@wonder/sdk';

const myNode = node({
  ref: 'process_data',
  name: 'Process Data',
  action_id: 'data-processor',
  action_version: 2,
  input_mapping: {
    data: '$.input.rawData',
    config: '$.context.processorConfig',
  },
  output_mapping: {
    result: '$.output.processed',
  },
});
```

### Transition Builder

Create workflow transitions:

```typescript
import { transition } from '@wonder/sdk';

// Simple transition
const simple = transition({
  from_node_ref: 'start',
  to_node_ref: 'end',
  priority: 1,
});

// Conditional transition
const conditional = transition({
  from_node_ref: 'check',
  to_node_ref: 'process',
  priority: 1,
  condition: {
    expression: '$.check.output.isValid === true',
  },
});

// Parallel execution with spawn
const parallel = transition({
  from_node_ref: 'split',
  to_node_ref: 'worker',
  priority: 1,
  spawn_count: 5,
});

// For-each transition
const forEach = transition({
  from_node_ref: 'start',
  to_node_ref: 'process_item',
  priority: 1,
  foreach: {
    items: '$.input.items',
    item_var: 'current_item',
  },
});
```

### Workflow Definition Builder

Combine everything into a complete workflow:

```typescript
import { workflowDef, schema, node, transition } from '@wonder/sdk';

const workflow = workflowDef({
  name: 'My Workflow',
  description: 'Does something useful',
  project_id: 'proj-123', // optional
  tags: ['production', 'automated'], // optional
  input_schema: schema.object({
    /* ... */
  }),
  output_schema: schema.object({
    /* ... */
  }),
  context_schema: schema.object({
    /* ... */
  }), // optional
  initial_node_ref: 'start',
  nodes: [
    node({ ref: 'start', name: 'Start' /* ... */ }),
    node({ ref: 'end', name: 'End' /* ... */ }),
  ],
  transitions: [transition({ from_node_ref: 'start', to_node_ref: 'end', priority: 1 })],
  output_mapping: {
    // optional
    result: '$.end.output',
  },
});
```

The builder validates:

- `initial_node_ref` exists in nodes
- All transition refs (`from_node_ref`, `to_node_ref`) exist in nodes
- Throws clear error messages if validation fails

## Type Safety

The SDK provides full TypeScript type safety:

- **HTTP Client**: Auto-generated types from OpenAPI spec via `openapi-fetch`
  - Autocomplete for all API paths
  - Type-safe request bodies and parameters
  - Type-safe response types
- **Builders**: Strongly typed builder functions
  - Schema constraints validated at compile time
  - Node and transition references type-checked
  - Full IntelliSense support

## HTTP Client Details

### Response Format

All API methods return:

```typescript
{
  data: T | undefined,
  error: Error | undefined,
  response: Response
}
```

### Error Handling

```typescript
const { data, error } = await client.POST('/api/workspaces', {
  body: { name: 'Test' },
});

if (error) {
  console.error('API error:', error);
  return;
}

// TypeScript knows data is defined here
console.log('Success:', data.workspace);
```

### Common Operations

```typescript
// List resources with pagination
const { data } = await client.GET('/api/workspaces', {
  params: { query: { limit: 10, offset: 0 } },
});

// Get a specific resource
const { data } = await client.GET('/api/workspaces/{id}', {
  params: { path: { id: 'workspace-id' } },
});

// Update a resource
const { data } = await client.PATCH('/api/workspaces/{id}', {
  params: { path: { id: 'workspace-id' } },
  body: { name: 'Updated Name' },
});

// Delete a resource
const { data } = await client.DELETE('/api/workspaces/{id}', {
  params: { path: { id: 'workspace-id' } },
});
```

## Development

### Regenerate Types

After the HTTP service OpenAPI spec changes:

```bash
pnpm generate
```

This fetches the latest OpenAPI spec and regenerates `src/generated/schema.d.ts`. TypeScript will automatically catch any breaking changes.

### Running Tests

```bash
pnpm test
```

### Environment Variables

- `API_URL` - Base URL for the Wonder API (default: `https://wonder-http.ron-keiser.workers.dev`)

## Architecture

The SDK uses a layered architecture:

1. **Generated Client Layer**
   - Auto-generated from OpenAPI spec
   - Uses `openapi-typescript` for type generation
   - Uses `openapi-fetch` for runtime client
   - Located in `src/generated/`

2. **Enhanced Clients Layer**
   - `WorkflowsClient`: Extends workflows with `.stream()` method
   - `EventsClient`: Adds WebSocket subscriptions and event waiting
   - Wraps generated client with additional functionality

3. **Builder Helpers Layer**
   - Hand-written ergonomic builders
   - Built on top of generated types
   - No runtime overhead (plain object construction)
   - Located in `src/builders/`

This separation ensures:

- Generated types stay clean and maintainable
- Enhanced clients provide high-level abstractions
- Builders can evolve independently
- Users can choose their preferred level of abstraction

## Examples

See `demo/` directory for complete examples:

- `workflow-def-schemas.ts` - Creating workflow definitions with schemas
