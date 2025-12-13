# @wonder/e2e

End-to-end tests for the Wonder workflow platform.

## Quick Start

```typescript
import { action, node, promptSpec, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { runTestWorkflow } from '~/kit';

const { result, cleanup } = await runTestWorkflow(
  workflowDef({
    name: 'My Workflow',
    input_schema: schema.object({ name: schema.string() }),
    output_schema: schema.object({ greeting: schema.string() }),
    initial_node_ref: 'greet',
    nodes: [
      node({
        ref: 'greet',
        task: taskDef({
          name: 'Greet Task',
          steps: [
            step({
              ref: 'call',
              ordinal: 0,
              action: action({
                name: 'Greet',
                kind: 'llm_call',
                implementation: {
                  prompt_spec: promptSpec({
                    name: 'Greeting Prompt',
                    template: 'Greet {{name}}',
                    template_language: 'handlebars',
                    requires: { name: schema.string() },
                    produces: schema.object({ greeting: schema.string() }),
                  }),
                },
              }),
              input_mapping: { name: '$.input.name' },
              output_mapping: { 'output.greeting': '$.response.greeting' },
            }),
          ],
        }),
        input_mapping: { name: '$.input.name' },
        output_mapping: { 'output.greeting': '$.greeting' },
      }),
    ],
  }),
  { name: 'Alice' },
);

expect(result.status).toBe('completed');
await cleanup(); // ✨ Cleanup complete (8 resources)
```

## API

### `runTestWorkflow(workflow, input, options?)`

All-in-one helper that scaffolds, executes, and returns cleanup for a workflow.

**Parameters:**

- `workflow` - An `EmbeddedWorkflowDef` from the `workflowDef()` builder
- `input` - Input data for the workflow
- `options.timeout` - Max execution time (default: 30s)
- `options.idleTimeout` - Max time without events (default: 10s)
- `options.logEvents` - Stream events to console as they arrive

**Returns:** `{ result, setup, cleanup }`

### Composable Builders

Builders embed into each other - no manual ID wiring:

```
promptSpec() → action() → step() → taskDef() → node() → workflowDef()
```

`runTestWorkflow` walks the tree and creates resources in dependency order.

### Trace Helpers

The `result.trace` object provides semantic helpers for asserting on events:

```typescript
// Context operations
trace.context.initialize(); // Get initialization event
trace.context.validate(); // Get validation event
trace.context.writes(); // All context writes
trace.context.writesTo('output'); // Writes to specific table
trace.context.reads(); // All context reads
trace.context.readsFrom('input'); // Reads from specific table
trace.context.snapshots(); // All context snapshots

// Workflow lifecycle
trace.workflow.start();
trace.workflow.complete();
trace.workflow.fail();

// Nodes and tasks
trace.node.start();
trace.node.complete();
trace.task.start();
trace.task.complete();
```

## Running Tests

```bash
# Run all tests
pnpm --filter @wonder/e2e test

# Run with event logging
# (set logEvents: true in test options)
```

## Test Structure

```
src/
├── kit.ts              # Test helpers (runTestWorkflow, cleanup, etc.)
├── client.ts           # SDK client instance
└── tests/
    ├── edge/
    │   └── template.test.ts   # Simple workflow execution
    └── context.test.ts        # Context operations validation
```
