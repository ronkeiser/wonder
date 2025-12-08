# SDK Architecture: Generation + Builders

## Overview

The SDK is a two-layer architecture:

1. **Generated client** - Type-safe HTTP client auto-generated from OpenAPI spec
2. **Hand-written builders** - Composition functions for building complex workflow definitions

This keeps the SDK maintainable (OpenAPI changes auto-sync) while making E2E tests ergonomic (no 500-line JSON objects).

## Layer 1: Generated Client

### Generation Strategy

Use `openapi-typescript` v7 with **transform hooks** to handle recursive types:

- OpenAPI spec generates 95% of types correctly
- Transform hook intercepts `input_schema`, `output_schema`, `context_schema` fields
- Replaces `Record<string, any>` with `SchemaType` imported from `@wonder/context`
- Result: Fully type-safe client with proper schema types

Use `openapi-fetch` for the client implementation:

- Generates named methods from `operationId` fields in OpenAPI spec
- Example: `POST /workflow-defs` (operationId: `createWorkflowDef`) → `client.createWorkflowDef()`
- Cleaner than raw HTTP verbs (`POST()`, `GET()`, etc.)

### File Structure

```
packages/sdk/
├── scripts/
│   └── generate.ts              # Custom generator with transform hooks
├── src/
│   ├── generated/
│   │   └── schema.d.ts          # openapi-typescript output
│   └── client.ts                # createClient() using openapi-fetch
```

### Implementation Notes

**Why this works:**

- Resources service stores schemas as `Record<string, any>` (RPC compatibility)
- OpenAPI reflects this in the spec
- SDK needs proper types for validation/autocomplete
- Transform hook bridges the gap without post-processing

**Why not import types from Resources?**

- Maintains service isolation (services don't import from each other)
- SDK is a client of the HTTP API, types derived from OpenAPI contract
- `@wonder/context` is a shared library, importing from it is fine

## Layer 2: Hand-Written Builders

### Purpose

Composition functions that return plain typed objects. No magic, no HTTP calls, just ergonomic builders.

### File Structure

```
packages/sdk/
├── src/
│   ├── builders/
│   │   ├── node.ts              # node() builder
│   │   ├── transition.ts        # transition() builder
│   │   └── workflow.ts          # workflowDef() builder
│   └── index.ts                 # Export both client + builders
```

### Design Principles

- **Plain objects** - Builders return typed objects, not classes
- **No abstraction** - Still working with `WorkflowDef`, `NodeDef`, etc.
- **Composable** - Build complex definitions from smaller pieces
- **Type-safe** - Full autocomplete and validation
- **Testable** - Helpers can be unit tested independently

### Usage Example

```typescript
import { createClient } from '@wonder/sdk';
import { node, transition, workflowDef } from '@wonder/sdk/builders';

const client = createClient({ baseUrl: '...' });

// Compose workflow from pieces (pure functions)
const workflow = workflowDef({
  name: 'Research Pipeline',
  nodes: [
    node({ id: 'ideate', action_id: action1.id }),
    node({ id: 'judge', action_id: action2.id })
  ],
  transitions: [
    transition({ from: 'ideate', to: 'judge', spawn_count: 5 })
  ],
  input_schema: { type: 'object', properties: { ... } }
});

// Use generated client for HTTP (named method from operationId)
await client.createWorkflowDef({ body: workflow });
```

**Why named imports (not namespace import):**

- Cleaner code without `builders.` prefix everywhere
- `node`, `transition`, `workflowDef` are unambiguous in context
- Standard pattern for factory/builder functions

**Why separate imports (not attached to client):**

- Builders are pure functions, don't need client instance
- No false coupling
- Cleaner separation of concerns

## Maintenance

**Generated client:**

- OpenAPI changes → run `pnpm generate` → types auto-update
- Zero manual maintenance

**Builders:**

- Hand-written, ~100 lines total
- Update only when adding new composition patterns
- Low churn (entity shapes stable)

## Alternatives Considered

### Option 1: Pure CRUD (no builders)

- ❌ 500-line JSON objects in tests
- ✅ Zero builder maintenance

### Option 2: Fluent Builder API

- ✅ Very ergonomic
- ❌ Couples tests to SDK abstraction
- ❌ More code to maintain
- ❌ Hides HTTP calls

### Option 3: Shared types package

- ❌ Breaks service isolation
- ❌ Creates coupling across monorepo

**Chosen approach (generation + builders)** balances ergonomics with maintainability and keeps services isolated.
