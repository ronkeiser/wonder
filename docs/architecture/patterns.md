# Implementation Patterns

<!-- TODO: Cross-cutting patterns needed before Stage 0 implementation:

Already documented:
✅ Repository layer - pure functions with D1Database first param
✅ IDs - ULID, generated in repository
✅ Timestamps - ISO 8601, set in repository
✅ Error handling - null for not found, throw custom errors, propagate DB errors
✅ Type imports - from primitives.ts
✅ Discriminated unions - flatten to columns or JSON

Priority order (by Stage 0 step dependencies):

CRITICAL - Step 2 (Repository Layer):
1. Drizzle query patterns - inline vs helper functions for common operations?
2. Mapping between DB rows and types - inline or separate mapper functions?
3. Validation placement - repository validates structure only, or also business rules?

CRITICAL - Step 2 Tests:
4. Test isolation - schema reset between tests, transaction rollback, or separate DBs?
5. Test data creation - factories, builders, or inline in tests?

NEEDED - Step 4 (Workers AI Client):
6. Client wrapper pattern - how to wrap external services (Workers AI, OpenAI, etc.)?

NEEDED - Step 5 (Execution Service):
7. Service layer pattern - pure functions, classes, or factory pattern?

NEEDED - Step 6 (Integration Test):
8. Integration test structure - single test vs multiple scenarios, data setup strategy?
-->

## Repository Layer

Pure functions with D1Database as first parameter:

```typescript
export async function createWorkflowDef(
  db: D1Database,
  def: Omit<WorkflowDef, 'id' | 'created_at' | 'updated_at'>,
): Promise<WorkflowDef> {
  /* ... */
}
```

- CRUD operations on D1
- Map between TypeScript types and database schema
- Serialize discriminated unions to JSON columns
- Generate IDs and timestamps
- Not responsible for: business validation, business logic

## IDs

ULID format, generated in repository layer:

```typescript
import { ulid } from 'ulid';

const id = ulid(); // '01ARZ3NDEKTSV4RRFFQ69G5FAV'
```

- 26 characters, lexicographically sortable
- Timestamp-prefixed (first 48 bits)
- Repository generates on insert, caller omits from input

## Timestamps

ISO 8601 strings, set by repository:

```typescript
const now = new Date().toISOString(); // '2025-11-25T10:30:00.000Z'
```

- `created_at`: set on insert, immutable
- `updated_at`: set on insert, refreshed on every update
- Repository generates, caller omits from input

## Types

Repository imports canonical types from `primitives.ts`:

```typescript
import type { WorkflowDef, NodeDef } from '~/docs/architecture/primitives';
```

- `primitives.ts`: single source of truth
- `definitions.ts`: domain-specific aliases or extensions (if needed)
- `repository.ts`: uses canonical types

## Discriminated Unions

Flatten to columns when queryable, JSON when complex.

**Flatten example** (`WorkflowDefOwner`):

```typescript
// Type
type WorkflowDefOwner =
  | { type: 'project'; project_id: string }
  | { type: 'library'; library_id: string };

// Schema
owner_type: text('owner_type', { enum: ['project', 'library'] }),
owner_id: text('owner_id'),

// Serialize
owner_type: def.owner.type,
owner_id: def.owner.type === 'project' ? def.owner.project_id : def.owner.library_id,

// Deserialize
const owner: WorkflowDefOwner =
  row.owner_type === 'project'
    ? { type: 'project', project_id: row.owner_id }
    : { type: 'library', library_id: row.owner_id };
```

**Use JSON columns for:**

- Variable schemas (`implementation` discriminated by `kind`)
- Complex nesting (`merge` config, `fan_in` variants)
- Arrays and deep structures

## Errors

- **Not found**: return `null`
- **Validation**: throw custom error
- **Database**: propagate (don't catch)

Custom errors in `packages/types/src/errors.ts`:

```typescript
export class ValidationError extends Error {
  constructor(message: string, public path: string, public code: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

## Service Layer

TBD - implement in Stage 0, Step 5.

Expected responsibilities:

- Input validation
- Coordinate repository calls
- Business rules
- Protocol-agnostic (no HTTP/RPC)
