# Implementation Patterns

<!-- TODO: Cross-cutting patterns needed before Stage 0 implementation:

Already documented:
✅ Repository layer - pure functions with D1Database first param
✅ IDs - ULID, generated in repository
✅ Timestamps - ISO 8601, set in repository
✅ Error handling - null for not found, throw custom errors, propagate DB errors
✅ Type imports - Drizzle inference from schema
✅ Discriminated unions - flatten to columns or JSON
✅ Drizzle query patterns - inline transformations
✅ Test isolation - fresh schema + transaction rollback
✅ Test data creation - inline in tests
✅ Service layer pattern - pure functions

Defer until implementation:
⏸️ Mapping between DB rows and types - start inline, extract if repetitive
⏸️ Validation placement - principle clear, specifics need domain logic
⏸️ Client wrapper pattern - needs actual external API to evaluate
⏸️ Integration test structure - needs actual flow to test
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

Repository uses Drizzle-inferred types from schema:

```typescript
import { workflowDefs } from '~/infrastructure/db/schema';

type WorkflowDef = typeof workflowDefs.$inferSelect;
type NewWorkflowDef = typeof workflowDefs.$inferInsert;
```

- Drizzle schema is single source of truth
- Types inferred directly from schema definition
- No manual synchronization needed
- `docs/architecture/primitives.ts` is reference documentation only

## Discriminated Unions

Flatten to columns when queryable, JSON when complex.

Repository layer transforms between flattened DB schema and domain discriminated unions.

**Flatten example** (`WorkflowDefOwner`):

```typescript
// Domain type (what services receive)
type WorkflowDefOwner =
  | { type: 'project'; project_id: string }
  | { type: 'library'; library_id: string };

// Drizzle schema (what DB stores)
export const workflowDefs = sqliteTable('workflow_defs', {
  id: text('id').primaryKey(),
  owner_type: text('owner_type', { enum: ['project', 'library'] }).notNull(),
  owner_id: text('owner_id').notNull(),
  // ...
});

// Repository transforms on read
export async function getWorkflowDef(db: D1Database, id: string): Promise<WorkflowDef | null> {
  const row = await db.select().from(workflowDefs).where(eq(workflowDefs.id, id)).get();
  if (!row) return null;

  return {
    ...row,
    owner:
      row.owner_type === 'project'
        ? { type: 'project', project_id: row.owner_id }
        : { type: 'library', library_id: row.owner_id },
  };
}

// Repository transforms on write
export async function createWorkflowDef(db: D1Database, def: NewWorkflowDef): Promise<WorkflowDef> {
  const row = {
    id: ulid(),
    owner_type: def.owner.type,
    owner_id: def.owner.type === 'project' ? def.owner.project_id : def.owner.library_id,
    created_at: new Date().toISOString(),
    // ...
  };

  await db.insert(workflowDefs).values(row).run();
  return getWorkflowDef(db, row.id)!;
}
```

**Use JSON columns for:**

- Variable schemas (`ActionDef.implementation` discriminated by `kind`)
- Complex nesting (`merge` config, `fan_in` variants)
- Arrays and deep structures
- When flattening would create too many nullable columns

## Errors

- **Not found**: return `null`
- **Validation**: throw custom error
- **Database**: propagate (don't catch)

Custom errors in `services/api/src/errors.ts`:

```typescript
export class ValidationError extends Error {
  constructor(message: string, public path: string, public code: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string, public entity: string, public id: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
```

## Drizzle Query Patterns

**Transformation helpers**: Extract discriminated union transformations to pure functions. With 50-100 repository modules, centralized transformations ensure consistency and reduce duplication.

```typescript
// domains/graph/transforms.ts
export function toWorkflowDefOwner(owner_type: string, owner_id: string): WorkflowDefOwner {
  return owner_type === 'project'
    ? { type: 'project', project_id: owner_id }
    : { type: 'library', library_id: owner_id };
}

export function fromWorkflowDefOwner(owner: WorkflowDefOwner): {
  owner_type: string;
  owner_id: string;
} {
  return {
    owner_type: owner.type,
    owner_id: owner.type === 'project' ? owner.project_id : owner.library_id,
  };
}

// domains/graph/repository.ts
export async function getWorkflowDef(db: D1Database, id: string): Promise<WorkflowDef | null> {
  const row = await db.select().from(workflowDefs).where(eq(workflowDefs.id, id)).get();
  if (!row) return null;

  return {
    ...row,
    owner: toWorkflowDefOwner(row.owner_type, row.owner_id),
  };
}
```

**Query composition**: For complex multi-table joins, create reusable query fragments.

```typescript
// domains/graph/queries.ts
export function withNodes(workflowDefId: string) {
  return db.select().from(nodes).where(eq(nodes.workflow_def_id, workflowDefId));
}

export function withTransitions(workflowDefId: string) {
  return db.select().from(transitions).where(eq(transitions.workflow_def_id, workflowDefId));
}
```

Benefits:

- Transformations tested once, reused everywhere
- Easy to update when schema changes
- Clear separation: repository calls DB, transforms handle mapping

## Test Isolation

Fresh schema per test file, transaction rollback per test case.

```typescript
import { beforeAll, beforeEach, afterEach, test } from 'vitest';
import { db } from './test-db';
import { migrate } from './migrate';

beforeAll(async () => {
  await migrate(db); // Fresh schema for this test file
});

beforeEach(async (ctx) => {
  ctx.tx = await db.transaction(); // Start transaction
});

afterEach(async (ctx) => {
  await ctx.tx.rollback(); // Rollback after each test
});

test('creates workflow def', async ({ tx }) => {
  const def = await createWorkflowDef(tx, {
    /* ... */
  });
  // ...
});
```

Benefits:

- Fast - no schema rebuilds between tests
- Isolated - each test sees clean slate
- Parallel-safe - separate transactions

## Test Data Creation

**Builder functions per domain**: Create consistent, composable test data builders from the start. With 10 domains, standardized builders prevent chaos.

```typescript
// domains/graph/fixtures.ts
export async function buildWorkspace(
  db: D1Database,
  overrides?: Partial<NewWorkspace>,
): Promise<Workspace> {
  return await createWorkspace(db, {
    name: 'Test Workspace',
    owner_email: 'test@example.com',
    ...overrides,
  });
}

export async function buildProject(
  db: D1Database,
  overrides?: Partial<NewProject>,
): Promise<Project> {
  const workspace = overrides?.workspace_id ? null : await buildWorkspace(db);

  return await createProject(db, {
    workspace_id: workspace?.id ?? overrides!.workspace_id!,
    name: 'Test Project',
    ...overrides,
  });
}

export async function buildWorkflowDef(
  db: D1Database,
  overrides?: Partial<NewWorkflowDef>,
): Promise<WorkflowDef> {
  const project = overrides?.project_id ? null : await buildProject(db);

  return await createWorkflowDef(db, {
    project_id: project?.id ?? overrides!.project_id!,
    name: 'Test Workflow',
    initial_node_id: 'node_1',
    ...overrides,
  });
}

// In tests - clean and composable
test('creates workflow run', async ({ tx }) => {
  const def = await buildWorkflowDef(tx, {
    name: 'Custom Workflow',
  });

  const run = await createWorkflowRun(tx, { workflow_def_id: def.id });
  expect(run.status).toBe('running');
});

// Cross-domain testing
test('workflow with custom model profile', async ({ tx }) => {
  const profile = await buildModelProfile(tx, {
    model: 'gpt-4',
  });
  const def = await buildWorkflowDef(tx);
  const node = await buildNode(tx, {
    workflow_def_id: def.id,
    action: buildLLMCallAction({ model_profile_id: profile.id }),
  });
  // ...
});
```

Benefits:

- Consistent defaults across all tests
- Easy to override specific fields
- Handles foreign key dependencies automatically
- Scales across 10 domains with hundreds of entities

## Service Layer

**Context object pattern**: Group dependencies into a context object for clean composition across domains.

```typescript
// infrastructure/context.ts
export interface ServiceContext {
  db: D1Database;
  workersAI: WorkersAI;
  vectorize: Vectorize;
  logger: Logger;
  // Add external clients as needed
}

export function createContext(env: Env): ServiceContext {
  return {
    db: env.DB,
    workersAI: env.WORKERS_AI,
    vectorize: env.VECTORIZE,
    logger: createLogger({ db: env.DB }),
  };
}

// domains/execution/service.ts
export async function executeWorkflow(
  ctx: ServiceContext,
  workflowDefId: string,
  input: unknown,
): Promise<WorkflowRun> {
  ctx.logger.info('workflow_execution_started', { workflowDefId });

  // Input validation
  const validated = validateWorkflowInput(workflowDefId, input);

  // Load workflow definition (may span multiple domains)
  const def = await getWorkflowDef(ctx.db, workflowDefId);
  if (!def) {
    throw new NotFoundError('WorkflowDef not found', 'WorkflowDef', workflowDefId);
  }

  // Business rules
  if (!canExecute(def)) {
    throw new ValidationError('Cannot execute workflow', 'status', 'INVALID_STATE');
  }

  // Coordinate across repositories
  const run = await createWorkflowRun(ctx.db, {
    workflow_def_id: workflowDefId,
    input: validated,
  });

  await createWorkflowToken(ctx.db, {
    workflow_run_id: run.id,
    node_id: def.initial_node_id,
  });

  ctx.logger.info('workflow_execution_created', { runId: run.id });
  return run;
}

// Cross-domain service composition
export async function executeNodeAction(
  ctx: ServiceContext,
  nodeId: string,
  tokenId: string,
): Promise<ActionResult> {
  // Uses repositories from multiple domains
  const node = await getNode(ctx.db, nodeId); // graph domain
  const action = await getAction(ctx.db, node.action_id); // effects domain
  const token = await getToken(ctx.db, tokenId); // execution domain

  // Dispatch based on action type
  switch (action.kind) {
    case 'llm_call':
      return await executeLLMCall(ctx, action, token); // ai domain
    case 'mcp_tool':
      return await executeMCPTool(ctx, action, token); // effects domain
    // ...
  }
}
```

**Service organization per domain**:

```
domains/execution/
├── repository.ts      # Data access (WorkflowRun, Token, etc.)
├── service.ts         # Business operations (executeWorkflow, processToken)
├── validation.ts      # Input/business rule validation
└── transforms.ts      # DB <-> Domain type conversions
```

Benefits:

- Single context parameter scales to any number of dependencies
- Easy to mock entire context for testing
- Services can call other domain services via shared context
- Clear dependency graph (context creation shows all external deps)
- Supports cross-domain operations without tight coupling
