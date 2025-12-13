# Test Client

## Purpose

The test client is a specialized version of the Wonder API client designed specifically for integration testing. It addresses two key pain points in test code:

1. **Response unwrapping** - API responses wrap resources in objects with ID keys (e.g., `{ workspace_id: "...", workspace: {...} }`), requiring manual extraction and validation in tests
2. **Resource cleanup** - Tests create many resources that must be deleted in reverse order to avoid referential integrity errors

## Core Concepts

### Auto-Unwrapping

Standard API responses return wrapper objects:

```typescript
// Standard client response
const response = await wonder.workspaces.create({ name: 'Test' });
// response = { workspace_id: "123", workspace: { id: "123", name: "Test", ... } }

if (!response?.workspace) {
  throw new Error('Failed to create workspace');
}
const workspace = response.workspace;
```

The test client automatically unwraps to return the resource directly:

```typescript
// Test client response
const workspace = await testClient.workspaces.create({ name: 'Test' });
// workspace = { id: "123", name: "Test", ... }
```

This eliminates:

- Manual extraction of the resource from the wrapper
- Validation checks that the resource exists
- Boilerplate error handling

### Auto-Tracking

Every resource created through the test client is automatically tracked for cleanup. The tracker maintains a list of deletable resources in creation order.

```typescript
const testClient = createTestClient();

// All creates are tracked automatically
const workspace = await testClient.workspaces.create({...});
const project = await testClient.projects.create({...});
const modelProfile = await testClient.modelProfiles.create({...});

// Single cleanup call deletes all in reverse order (LIFO)
await testClient.tracker.cleanup();
```

### LIFO Deletion Order

Resources are deleted in reverse order of creation (Last In, First Out) to respect referential integrity:

```
Create: workspace → project → model profile → prompt spec
Delete: prompt spec → model profile → project → workspace
```

This prevents deletion errors from foreign key constraints.

### Error Resilience

Cleanup continues even if individual deletions fail. This handles:

- Resources already deleted manually
- Cascade deletions (parent deletion already removed child)
- Transient network errors

Failed deletions log warnings but don't stop the cleanup process.

## API Surface

### Creating a Test Client

```typescript
import { createTestClient } from '@wonder/sdk';

const testClient = createTestClient();
```

The test client provides the same collections as the standard client:

- `workspaces`
- `projects`
- `modelProfiles`
- `promptSpecs`
- `actions`
- `taskDefs`
- `workflowDefs`
- `workflows`

### Using Create Methods

All `create()` methods have the same signature as the standard client but return unwrapped resources:

```typescript
// Input: same as standard client
const workspace = await testClient.workspaces.create({
  name: "Test Workspace",
  settings: { ... }
});

// Output: unwrapped resource (not { workspace_id, workspace })
console.log(workspace.id);   // Direct access to properties
console.log(workspace.name);
```

### Cleanup

The tracker provides:

```typescript
// Get count of tracked resources
testClient.tracker.count;

// Clean up all tracked resources
await testClient.tracker.cleanup();
```

Cleanup output:

```
✨ Cleaning up 6 resources...
🧹 Cleanup complete!
```

### Test Project Scaffolding

Most workflow tests need the same basic infrastructure: a workspace, project, and model profile. The test client provides a scaffolding helper that creates this foundation and executes a workflow in one call.

```typescript
const result = await testClient.scaffold({
  workflowDef: (modelProfileId) =>
    workflowDef({
      name: 'Test Workflow',
      project_id: '{{project_id}}', // Injected by scaffold
      input_schema: schema.object({ count: schema.number() }),
      output_schema: schema.object({ result: schema.number() }),
      output_mapping: { result: '$.output.value' },
      initial_node_ref: 'process',
      nodes: [
        node({
          ref: 'process',
          task_id: taskDef({
            name: 'Process Task',
            project_id: '{{project_id}}', // Injected by scaffold
            input_schema: schema.object({ count: schema.number() }),
            output_schema: schema.object({ value: schema.number() }),
            steps: [
              step({
                ref: 'llm',
                ordinal: 0,
                action_id: action({
                  name: 'LLM Action',
                  kind: 'llm_call',
                  implementation: {
                    prompt_spec_id: promptSpec.id,
                    model_profile_id: modelProfileId, // Uses scaffolded model profile
                  },
                }).id,
                input_mapping: { input: '$.input.count' },
                output_mapping: { 'output.value': '$.result' },
              }),
            ],
          }).id,
          input_mapping: { count: '$.input.count' },
          output_mapping: { 'output.value': '$.value' },
        }),
      ],
      transitions: [],
    }),
  input: { count: 42 },
});

// result = { output, runId, workspace, project, modelProfile }
```

The `workflowDef` parameter is a **function** that receives the model profile ID and returns a workflow definition. This allows the workflow to reference actions that use the scaffolded model profile.

Scaffold encapsulates the pattern:

1. Create workspace
2. Create project
3. Create model profile
4. Call `workflowDef(modelProfileId)` to get the workflow structure
5. Create all nested resources (prompt specs, actions, task defs, workflow def)
6. Create and execute workflow run
7. Return unwrapped result with infrastructure context

All created resources are automatically tracked for cleanup. The scaffold method returns both the workflow output and the infrastructure resources, allowing tests to:

- Assert on workflow results
- Access infrastructure for additional test operations
- Run multiple workflows in the same scaffolded environment

```typescript
// Run first workflow
const { output, workspace, project, modelProfile } = await testClient.scaffold({
  workflowDef: (modelProfileId) => /* ... uses modelProfileId ... */,
  input: { ... }
});

// Can create additional resources in the same project
const promptSpec = await testClient.promptSpecs.create({
  project_id: project.id,
  ...
});

// All tracked for cleanup
await testClient.tracker.cleanup();
```

For tests that need custom scaffolding (specific model profiles, multiple projects, etc.), the low-level `create()` methods remain available.

## Design Constraints

### Generated Code

The test client is **code-generated** from the OpenAPI specification, not hand-written. This ensures:

- It stays in sync with API changes automatically
- Type safety is maintained through generated types
- No manual updates needed when collections are added/removed

### Collection Coverage

The test client only wraps collections with `create()` methods. Read-only collections or collections without create operations are not included.

### No Proxy Magic

Earlier implementations used runtime Proxies to transform responses. This was abandoned because:

- TypeScript cannot infer proxy transformations
- Type assertions (`as any`) would be required throughout tests
- Runtime behavior differs from compile-time types

The generated approach provides full type safety without runtime surprises.

## Comparison to Standard Client

| Aspect          | Standard Client             | Test Client                          |
| --------------- | --------------------------- | ------------------------------------ |
| Response format | `{ resource_id, resource }` | `resource` (unwrapped)               |
| Validation      | Manual                      | Automatic (throws if creation fails) |
| Cleanup         | Manual per-resource         | Automatic batch cleanup              |
| Deletion order  | User manages                | LIFO (automatic)                     |
| Type safety     | Full                        | Full                                 |
| Use case        | Production code             | Integration tests                    |

## Integration with Test Helpers

Test helper functions can accept either client:

```typescript
// Works with test client
const ctx = await setupTestContext(testClient);

// Works with standard client
const ctx = await setupTestContext(wonder);
```

Helper functions use duck typing - they only care that the client has the required `create()` methods, not which specific client type it is.
