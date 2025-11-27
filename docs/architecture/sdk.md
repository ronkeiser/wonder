# SDK Architecture

## Overview

The Wonder SDK is a TypeScript-first client for defining and executing workflows as code. It provides a fluent builder API with type safety, enabling workflows to be version-controlled, tested, and composed like regular application code.

## Design Principles

1. **Workflows as Code** - Workflows are TypeScript/JavaScript modules, not JSON blobs
2. **Type Safety** - Input/output schemas enforced at build time
3. **Explicit Scoping** - Project context required at client instantiation
4. **Declarative Dependencies** - SDK materializes the entity graph (PromptSpecs, Actions, etc.)
5. **Dogfooding** - Internal test workflows use the same SDK external users will use

## Client Instantiation

The client must be instantiated with either an explicit `projectId` or the `devProject` flag:

```typescript
// Production: explicit project
const client = new WonderClient({
  workspaceId: 'workspace_456',
  projectId: 'proj_production',
});

// Development: ephemeral project
const devClient = new WonderClient({
  workspaceId: 'workspace_456',
  devProject: true, // Creates/reuses "Dev Workflows" project
});

// Error: neither provided
const badClient = new WonderClient({
  workspaceId: 'workspace_456',
}); // throws: "Must provide either projectId or devProject: true"
```

All workflows, runs, and artifacts created through the client are scoped to this project.

## Workflow Definition

### Basic Structure

```typescript
const summarizeArticle = client
  .workflow('summarize-article')
  .input({ url: 'string', max_length: 'number' })
  .output({ summary: 'string', key_points: 'array' })

  .node('fetch', (n) =>
    n.action('http_request', { method: 'GET', url: '{{url}}' }).outputTo('state.raw_content'),
  )

  .node('summarize', (n) =>
    n
      .llmCall({
        prompt: 'Summarize this in {{max_length}} words: {{raw_content}}',
        model: '@cf/meta/llama-3.1-8b-instruct',
      })
      .outputTo('state.summary'),
  )

  .transition('fetch', 'summarize')
  .build();
```

### Deployment

```typescript
// Deploy to the client's project context
await client.workflows.deploy(summarizeArticle);
```

Behind the scenes, `deploy()`:

1. Creates or updates the `WorkflowDef` record
2. Creates dependent entities (PromptSpecs, ModelProfiles, Actions) if they don't exist
3. Creates or updates the `Workflow` record (binds def to project)
4. Returns the deployed workflow metadata

## Execution

```typescript
const run = await client.workflows.run('summarize-article', {
  url: 'https://example.com/article',
  max_length: 100,
});

console.log(run.id); // workflow_run_id
console.log(run.status); // 'running' | 'completed' | 'failed'

// Wait for completion
const result = await run.wait();
console.log(result.output); // { summary: '...', key_points: [...] }
```

## Entity Scoping

All entities created through the SDK inherit the client's project context:

```typescript
const client = new WonderClient({
  workspaceId: 'ws_123',
  projectId: 'proj_abc',
});

await client.workflows.deploy(myWorkflow);

// Creates:
// - workflow_def (owner: { type: 'project', project_id: 'proj_abc' })
// - workflow (project_id: 'proj_abc')
// - prompt_specs (project_id: 'proj_abc')
// - model_profiles (project_id: 'proj_abc')
// - actions (project_id: 'proj_abc')

const run = await client.workflows.run('my-workflow', { input });

// Creates:
// - workflow_run (project_id: 'proj_abc')
// - Any artifacts written: artifact.project_id = 'proj_abc'
```

## Dependency Materialization

The SDK uses **declarative dependencies** - you define workflows inline, and the SDK creates the underlying entities:

```typescript
.node('summarize', (n) => n
  .llmCall({
    prompt: 'Summarize: {{input.text}}',
    model: '@cf/meta/llama-3.1-8b-instruct'
  })
)

// SDK creates:
// 1. PromptSpec with template "Summarize: {{input.text}}"
// 2. ModelProfile for the specified model
// 3. Action of kind 'llm_call' linking them
// 4. Node referencing the action
```

### Reusing Entities

You can also reference existing entities by ID:

```typescript
.node('summarize', (n) => n
  .action('action_existing_123')  // Reference existing action
)
```

## File Structure

```
services/api/
├── src/
│   ├── domains/...
│   └── sdk/
│       ├── client.ts          # WonderClient class
│       ├── builders/
│       │   ├── workflow.ts    # Workflow builder
│       │   ├── node.ts        # Node builder
│       │   └── action.ts      # Action helpers
│       └── index.ts           # Public exports
└── workflows/
    ├── hello-world.ts         # Example: single-node workflow
    ├── multi-judge.ts         # Example: fan-out consensus
    └── summarize-article.ts   # Example: chained execution
```

## Future: Standalone Package

Once the API stabilizes, the SDK will be extracted to `packages/sdk/` as a standalone npm package. This will enable:

- External users to define workflows in their own repos
- Publishing to npm for broader distribution
- Separate versioning from the platform API

For now, keeping it in `services/api/src/sdk/` enables rapid iteration with direct access to internal types.

## Related Docs

- `docs/REQUIREMENTS.md` - Platform requirements and constraints
- `docs/architecture/data-model.md` - Entity relationships and schemas
- `docs/architecture/execution.md` - How workflows execute at runtime
