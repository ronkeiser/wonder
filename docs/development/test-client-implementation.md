# Test Client Implementation Plan

## Overview

Generate a test-specific client alongside the standard Wonder SDK client that provides auto-unwrapping and auto-tracking for integration tests.

## File Structure

```
packages/sdk/
├── scripts/
│   ├── generate-client.ts          # Modified: Add test client generation
│   └── generate-test-client.ts     # New: Test client code formatter
├── src/
│   ├── generated/
│   │   ├── client.ts               # Existing: Standard client
│   │   ├── test-client.ts          # New: Generated test client
│   │   └── schema.d.ts             # Existing: OpenAPI types
│   └── index.ts                    # Modified: Export createTestClient
```

## Phase 1: ResourceTracker

**Location**: `packages/sdk/scripts/generate-test-client.ts`

### Implementation

Create a standalone ResourceTracker class that manages cleanup:

```typescript
interface Deletable {
  delete: () => Promise<unknown>;
}

class ResourceTracker {
  private resources: Deletable[] = [];

  track(resource: Deletable): void {
    this.resources.push(resource);
  }

  get count(): number {
    return this.resources.length;
  }

  async cleanup(): Promise<void> {
    console.log(`✨ Cleaning up ${this.resources.length} resources...`);

    // LIFO: delete in reverse order
    const reversed = [...this.resources].reverse();

    for (const resource of reversed) {
      try {
        await resource.delete();
      } catch (error) {
        console.warn('Failed to delete resource:', error);
        // Continue cleanup despite errors
      }
    }

    this.resources = [];
    console.log('🧹 Cleanup complete!');
  }
}
```

**Key Decisions**:

- LIFO deletion order (reverse of creation)
- Error resilience (catch and continue)
- Console output with emojis for visibility
- Clear after cleanup (reusable tracker)

## Phase 2: Auto-Unwrapping Collections

**Location**: `packages/sdk/scripts/generate-test-client.ts`

### Strategy

Filter collections to only those with `create()` methods, then wrap them to:

1. Call the standard client's create method
2. Extract the resource from the wrapper response
3. Track the resource for cleanup
4. Return the unwrapped resource

### Code Generation Pattern

For each collection with a `create()` method:

```typescript
// Input: Standard client method signature
create(body: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse>

// Output: Test client method signature
create(body: CreateWorkspaceRequest): Promise<Workspace>
```

The generated wrapper:

```typescript
workspaces: {
  create: async (body: CreateWorkspaceRequest): Promise<Workspace> => {
    const response = await standardClient.workspaces.create(body);

    // Extract resource (convention: {resource_id, resource})
    const resource = response.workspace;
    if (!resource) {
      throw new Error('Failed to create workspace: resource not in response');
    }

    // Track for cleanup
    tracker.track({
      delete: () => standardClient.workspaces(resource.id).delete(),
    });

    return resource;
  };
}
```

### Type Extraction

Need to extract the resource type from the response wrapper. Given:

```typescript
type CreateWorkspaceResponse = {
  workspace_id: string;
  workspace: Workspace;
};
```

Extract `Workspace` type for the return value. Strategy:

1. Parse response type from paths
2. Find properties that match pattern `{collection_name}_id` and `{collection_name}`
3. Use the non-ID property as the resource type
4. Type: `CreateWorkspaceResponse['workspace']`

## Phase 3: Scaffold Method

**Location**: `packages/sdk/scripts/generate-test-client.ts`

### Signature

```typescript
interface ScaffoldOptions {
  workflowDef: (modelProfileId: string) => WorkflowDefinition;
  input: unknown;
}

interface ScaffoldResult {
  output: unknown;
  runId: string;
  workspace: Workspace;
  project: Project;
  modelProfile: ModelProfile;
}

scaffold(options: ScaffoldOptions): Promise<ScaffoldResult>
```

### Implementation Steps

The scaffold method orchestrates:

1. **Create Infrastructure**

   ```typescript
   const workspace = await this.workspaces.create({
     name: `Test Workspace ${Date.now()}`,
   });

   const project = await this.projects.create({
     workspace_id: workspace.id,
     name: `Test Project ${Date.now()}`,
   });

   const modelProfile = await this.modelProfiles.create({
     name: `Test Model ${Date.now()}`,
     provider: 'cloudflare',
     model: '@cf/meta/llama-3.1-8b-instruct',
   });
   ```

2. **Build Workflow Definition**

   ```typescript
   const workflow = options.workflowDef(modelProfile.id);
   ```

3. **Inject project_id**
   - Walk the workflow definition
   - Replace `'{{project_id}}'` placeholders with `project.id`
   - Handle nested task definitions, actions, prompt specs

4. **Create Workflow Resources**

   ```typescript
   // Create all prompt specs referenced in workflow
   // Create all actions referenced in workflow
   // Create all task defs referenced in workflow
   // Create workflow definition
   ```

5. **Execute Workflow**

   ```typescript
   const workflowRun = await this.workflows.create({
     workflow_def_id: workflowDef.id,
     input: options.input,
   });

   const result = await pollForCompletion(workflowRun.id);
   ```

6. **Return Result**
   ```typescript
   return {
     output: result.output,
     runId: workflowRun.id,
     workspace,
     project,
     modelProfile,
   };
   ```

### Challenges

**Resource Extraction**: The workflow definition contains embedded resource definitions (prompt specs, actions, tasks). Need to:

- Traverse the workflow structure
- Extract these definitions
- Create them via API
- Replace definitions with IDs in the workflow

**Alternative Approach**: Require the workflow definition to reference already-created resources by ID. The scaffold only creates infrastructure, not domain resources.

```typescript
// Simpler: User creates resources, scaffold creates infrastructure
const result = await testClient.scaffold({
  workflowDef: workflowDefObject,  // Already has all IDs populated
  input: { ... }
});
```

This shifts responsibility:

- Test client: Create workspace, project, model profile, workflow def, execute
- User: Create prompt specs, actions, tasks (using the model profile ID)

**Recommendation**: Start with simpler approach. Scaffold creates infrastructure + executes workflow def that references existing resources.

## Phase 4: Generator Integration

**Location**: `packages/sdk/scripts/generate-client.ts`

### Modify Generation Script

Add test client generation step after standard client generation:

```typescript
// In main() or generateAll()
async function generateAll() {
  const spec = await loadOpenAPISpec();
  const routes = parseRoutes(spec);

  // Generate standard client (existing)
  const clientCode = formatClientCode(generateRootClient(routes));
  await writeFile('./src/generated/client.ts', clientCode);

  // Generate test client (new)
  const testClientCode = formatTestClientCode(generateRootClient(routes));
  await writeFile('./src/generated/test-client.ts', testClientCode);
}
```

### Test Client Formatter

Create `formatTestClientCode()` that:

1. Imports standard client and types
2. Includes ResourceTracker class
3. Generates unwrapping wrappers for create() methods
4. Generates scaffold() method
5. Exports `createTestClient()` factory

### Template Structure

```typescript
// Generated file header
import { createClient, paths } from './client';
import type {} from /* specific types */ './schema';

// ResourceTracker class
class ResourceTracker {
  /* ... */
}

// Test client factory
export function createTestClient(baseUrl?: string, apiKey?: string) {
  const standardClient = createClient(baseUrl, apiKey);
  const tracker = new ResourceTracker();

  return {
    tracker,

    // Generated collections (only those with create)
    workspaces: {
      create: async (body) => {
        /* unwrap + track */
      },
    },
    projects: {
      create: async (body) => {
        /* unwrap + track */
      },
    },
    // ... etc

    // Scaffold method
    scaffold: async (options) => {
      /* infrastructure + execute */
    },
  };
}
```

## Phase 5: Export from SDK

**Location**: `packages/sdk/src/index.ts`

Add export:

```typescript
export { createTestClient } from './generated/test-client';
export type { ScaffoldOptions, ScaffoldResult } from './generated/test-client';
```

## Phase 6: Update Test Package

**Location**: `packages/test/src/client.ts`

Replace wonder client with test client:

```typescript
import { createTestClient } from '@wonder/sdk';

export const testClient = createTestClient('https://api.wonder.dev', process.env.API_KEY);
```

**Location**: `packages/test/src/tests/template.test.ts`

Update test to use scaffold:

```typescript
import { testClient } from '~/client';

it('executes workflow', async () => {
  const result = await testClient.scaffold({
    workflowDef: (modelProfileId) =>
      workflowDef({
        name: 'Test',
        project_id: '{{project_id}}',
        // ... use modelProfileId in actions
      }),
    input: { name: 'test', count: 42 },
  });

  expect(result.output).toEqual({
    /* ... */
  });

  await testClient.tracker.cleanup();
});
```

## Type Safety Verification

### Requirements

- No `as any` casts
- No type assertions
- Full inference from OpenAPI types
- TypeScript strict mode passes

### Key Types

```typescript
// Extract resource type from response
type ExtractResource<T> = T extends { [K: string]: infer R }
  ? R extends object
    ? R
    : never
  : never;

// Example usage
type CreateWorkspaceResponse =
  paths['/api/workspaces']['post']['responses']['201']['content']['application/json'];
type Workspace = ExtractResource<CreateWorkspaceResponse>; // Should infer Workspace type
```

## Testing Strategy

### Unit Tests

Test the generator logic:

- `formatTestClientCode()` produces valid TypeScript
- ResourceTracker LIFO deletion order
- Error handling in cleanup

### Integration Tests

Test the generated test client:

- Auto-unwrapping works for all collections
- Tracking adds resources to cleanup list
- Scaffold creates infrastructure correctly
- Cleanup deletes in reverse order

### Edge Cases

- Empty cleanup list (no-op)
- Failed deletion (continues with others)
- Multiple scaffolds (all tracked)
- Resource already deleted (cleanup handles gracefully)

## Dependencies

### New Dependencies

None - uses existing OpenAPI types and client infrastructure

### Modified Files

- `packages/sdk/scripts/generate-client.ts` - Add test client generation
- `packages/sdk/src/index.ts` - Export test client
- `packages/test/src/client.ts` - Use test client
- `packages/test/src/tests/template.test.ts` - Use scaffold

### New Files

- `packages/sdk/scripts/generate-test-client.ts` - Test client formatter
- `packages/sdk/src/generated/test-client.ts` - Generated output

## Rollout Plan

1. **Phase 1-2**: Generate basic test client with auto-unwrapping (no scaffold)
2. **Test**: Verify auto-unwrapping + tracking works in one test
3. **Phase 3**: Add scaffold method
4. **Test**: Convert template.test.ts to use scaffold
5. **Phase 4-5**: Full integration and export
6. **Phase 6**: Update all tests to use test client

## Open Questions

1. **Scaffold complexity**: Should scaffold create embedded resources (prompt specs, actions) or only infrastructure?
   - **Recommendation**: Start simple - only infrastructure, user creates domain resources

2. **Collection detection**: How to identify which response property is the resource?
   - **Recommendation**: Convention - property that matches collection name (e.g., `workspace` in `CreateWorkspaceResponse`)

3. **Type extraction**: Can we infer resource types from OpenAPI, or do we need manual mapping?
   - **Recommendation**: Parse response schemas, extract non-ID properties

4. **Error messages**: How specific should unwrapping failures be?
   - **Recommendation**: Include collection name and response structure in error

5. **Scaffold flexibility**: Should we support custom infrastructure (multiple model profiles, etc.)?
   - **Recommendation**: V1 uses single model profile, add `scaffoldCustom()` later if needed
