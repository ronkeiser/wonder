# Testing Strategy

## Philosophy

Wonder uses a **dual-layer testing approach** that balances speed and confidence:

1. **Unit Tests** - Fast, isolated tests for business logic using real miniflare bindings
2. **E2E Tests** - Full-system tests against deployed infrastructure validating actual user workflows

We avoid the "middle ground" of complex integration tests with mocked infrastructure. Either test isolated logic quickly, or test the entire system realistically.

## Why This Approach?

**Unit tests are valuable for:**

- DB query logic (repositories)
- Business logic with simple mocked dependencies
- Pure functions (validation, parsing, etc.)
- Fast feedback during development

**E2E tests are essential because:**

- They test what users actually experience
- They catch integration bugs that mocks hide (serialization, networking, runtime behavior)
- They validate the entire Cloudflare stack (DO, WebSockets, Queues, AI, D1)
- They prove your system works in production

**We learned the hard way:** Miniflare has limitations (e.g., WebSockets + DOs + isolated storage don't work together). Fighting these limitations with workarounds wastes time. Real infrastructure testing catches real issues.

## Test Structure

```
services/api/
├── vitest.config.ts
├── test/
│   ├── tsconfig.json       # Extends root, adds cloudflare:test types
│   ├── env.d.ts            # ProvidedEnv type declaration
│   ├── setup.ts            # Global test setup
│   ├── helpers/            # Test utilities (db, fixtures)
│   ├── unit/               # Fast isolated tests with miniflare
│   │   ├── execution/      # Service + repository tests
│   │   ├── events/         # Event repository tests
│   │   ├── ai/             # AI repository tests
│   │   └── ...
│   └── e2e/                # Full E2E tests using @wonder/sdk
│       ├── helpers.ts      # Test utilities and fixtures
│       ├── workflow-lifecycle.test.ts
│       ├── workflow-streaming.test.ts
│       ├── error-handling.test.ts
│       └── ...

packages/sdk/
├── src/
│   ├── index.ts            # Pure client library
│   ├── client.ts           # WonderfulClient class
│   └── types.ts            # TypeScript types
└── scripts/
    └── run-workflow.ts     # Interactive workflow CLI (uses SDK)
```

**Why E2E tests live in services/api:**

- API owns and tests its own behavior
- Tests consume `@wonder/sdk` as a real client would
- Validates SDK works correctly while testing API
- Cleaner SDK package (pure client library, no test scripts)
- Natural in monorepo: API depends on SDK to test itself

## Configuration

### Vitest Config

```typescript
// services/api/vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.test.jsonc' },
        miniflare: {
          // Custom bindings for tests
          bindings: {
            TEST_SEED_SQL: readFileSync(resolve(__dirname, './test/fixtures/seed.sql'), 'utf-8'),
          },
        },
      },
    },
  },
});
```

Bindings are read from `wrangler.test.jsonc`. Override via `miniflare` key for test-specific bindings.

### Types

```typescript
// test/env.d.ts
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    // Test-only bindings
    TEST_SEED_SQL: string;
  }
}
```

```json
// test/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@cloudflare/vitest-pool-workers"]
  },
  "include": ["./**/*.ts", "../worker-configuration.d.ts"]
}
```

## Running Tests

### Unit Tests (Miniflare)

```bash
# All unit tests
pnpm --filter api test

# Watch mode
pnpm --filter api test:watch

# Specific file
pnpm --filter api test test/unit/execution/service.test.ts

# Filter by name
pnpm --filter api test -- -t "startWorkflow"
```

### E2E Tests

```bash
# Run E2E test suite
pnpm --filter api test:e2e

# Against wrangler dev (start dev server first)
wrangler dev --config services/api/wrangler.jsonc
API_BASE=http://localhost:8787 pnpm --filter api test:e2e

# Interactive workflow CLI (uses SDK)
pnpm --filter @wonder/sdk workflow:run --name "Alice"
```

## Test Conventions

| Pattern        | Example                                   |
| -------------- | ----------------------------------------- |
| File naming    | `*.test.ts`                               |
| Describe block | Domain or feature name                    |
| Test isolation | Automatic via `isolatedStorage: true`     |
| Seed data      | `test/fixtures/seed.sql` loaded per test  |
| Constants      | `SEED_*` prefix for IDs from seed data    |
| Test helpers   | `test/helpers/` (db, fixtures, utilities) |

## API Reference

### Cloudflare Test APIs

```typescript
import {
  env, // Test environment bindings
  SELF, // Service binding to current worker
  createExecutionContext, // Mock ExecutionContext
  waitOnExecutionContext, // Wait for ctx.waitUntil() promises
  listDurableObjectIds, // List all DO IDs in namespace
  runInDurableObject, // Execute function in DO context
  runDurableObjectAlarm, // Trigger DO alarm
} from 'cloudflare:test';

// D1
const db = drizzle(env.DB);
await db.select().from(workflows);

// Workers AI
const result = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
  messages: [{ role: 'user', content: 'Hello' }],
});

// Durable Objects
const id = env.WORKFLOW_COORDINATOR.newUniqueId();
const stub = env.WORKFLOW_COORDINATOR.get(id);

// Queues
await env.WORKFLOW_QUEUE.send({ workflowRunId: '...' });
```

### Test Helpers

```typescript
// Create test DB with migrations applied
import { createTestDb } from '~/test/helpers/db';
const db = createTestDb();

// Load seed data
import { env } from 'cloudflare:test';
// env.TEST_SEED_SQL contains seed.sql content
```

## Unit Testing with Miniflare

### Stack

- **Vitest ~3.2.0** + `@cloudflare/vitest-pool-workers`
- Tests run inside Workers runtime (miniflare)
- Real D1, Workers AI, KV, R2, Queue bindings via wrangler config

### What to Test

- **Repository layer** - DB queries with real miniflare D1
- **Service layer** - Business logic with mocked DO bindings (DOs are tested E2E)
- **Pure logic** - Validators, parsers, transformers
- **Error handling** - Exception paths and validation

### What NOT to Test with Miniflare

- WebSocket connections (known limitation with isolated storage)
- DO state persistence across multiple requests (use E2E tests)
- Cross-worker communication (test E2E instead)
- Real AI model behavior (mock the responses)

### Test Isolation

Tests use **isolated storage** by default (`isolatedStorage: true`):

- Each test gets a fresh copy of storage (D1, KV, R2, DO)
- Writes in one test don't affect others
- Tests can run in parallel safely
- `beforeAll()` hooks seed data that persists across tests in that suite

### Seed Data Pattern

```typescript
// Use seed.sql loaded via TEST_SEED_SQL binding
const SEED_WORKFLOW_ID = '01JDXSEED0000WORKFLOW0001';

beforeEach(async () => {
  const db = createTestDb();

  // Parse and load seed data
  const statements: string[] = [];
  let current = '';
  for (const line of env.TEST_SEED_SQL.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    current += ' ' + line;
    if (trimmed.endsWith(';')) {
      statements.push(current.trim().slice(0, -1));
      current = '';
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements.map((s: string) => env.DB.prepare(s)));
  }
});
```

### Mocking Guidelines

- **Prefer real miniflare bindings** over mocks when possible
- **Mock Durable Objects** in service tests (they're expensive to test in miniflare)
- **Mock external HTTP** via `vi.mock()` or MSW
- **Never mock D1** - always use real miniflare database
- **Mock AI responses** unless specifically testing AI integration

Example:

```typescript
// Good: Real DB, mocked DO
const mockCtx = {
  db: createTestDb(), // Real miniflare D1
  WORKFLOW_COORDINATOR: {
    newUniqueId: vi.fn().mockReturnValue(mockDOId),
    get: vi.fn().mockReturnValue(mockDOStub),
  },
};
```

## E2E Testing Strategy

### Purpose

E2E tests validate **the complete user experience** against real deployed infrastructure:

- HTTP API → Workflow execution → Durable Object → WebSocket streaming
- Real Cloudflare runtime behavior (not simulated)
- Actual network serialization and deserialization
- Real DO persistence and lifecycle
- Complete event streaming flow

### E2E Test Suite Structure

E2E tests live in `services/api/test/e2e/` and use `@wonder/sdk` to test the API:

```typescript
// services/api/test/e2e/helpers.ts
import { WonderfulClient } from '@wonder/sdk';

export function createE2EClient() {
  const baseUrl = process.env.RESOURCES_BASE || 'http://localhost:8787';
  return new WonderfulClient({ baseUrl });
}

export async function waitForEvent(
  ws: WebSocket,
  kind: string,
  timeout: number = 30000,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${kind}`)), timeout);

    ws.addEventListener('message', (msg) => {
      const event = JSON.parse(msg.data);
      if (event.kind === kind) {
        clearTimeout(timer);
        resolve(event);
      }
    });
  });
}
```

```typescript
// services/api/test/e2e/workflow-streaming.test.ts
import { describe, it, expect } from 'vitest';
import { createE2EClient, waitForEvent } from './helpers';

const HELLO_WORLD_WORKFLOW_ID = '01JDXSEED0000WORKFLOW0001';

describe('Workflow Streaming E2E', () => {
  it('streams events from workflow execution', async () => {
    const client = createE2EClient();

    // Start workflow via HTTP API
    const run = await client.startWorkflow(HELLO_WORLD_WORKFLOW_ID, {
      name: 'E2E Test',
    });

    expect(run.workflow_run_id).toBeDefined();
    expect(run.durable_object_id).toBeDefined();

    // Connect WebSocket to stream events
    const ws = await client.connectWebSocket(run.durable_object_id);

    const events: Event[] = [];
    ws.addEventListener('message', (msg) => {
      events.push(JSON.parse(msg.data));
    });

    // Wait for workflow completion
    await waitForEvent(ws, 'workflow_completed', 30000);
    ws.close();

    // Validate event stream
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].kind).toBe('workflow_started');
    expect(events[events.length - 1].kind).toBe('workflow_completed');
  });
});
```

**Why this approach is 100x more valuable:**

- Tests actual production behavior end-to-end
- Catches serialization bugs, WebSocket issues, DO persistence problems
- Validates `@wonder/sdk` works correctly as a client
- API owns its tests but uses its own public SDK
- Takes seconds to run, gives high confidence

### E2E Test Coverage

Current and planned E2E tests in `services/api/test/e2e/`:

- `workflow-streaming.test.ts` - WebSocket event streaming, complete lifecycle
- `workflow-lifecycle.test.ts` - Start, pause, resume, cancel operations
- `error-handling.test.ts` - Network failures, timeouts, retries
- `state-persistence.test.ts` - DO survives across multiple requests
- `parallel-workflows.test.ts` - Multiple concurrent workflows
- `workflow-input-validation.test.ts` - Input validation and error responses

### CI Strategy

```yaml
# .github/workflows/test.yml
jobs:
  unit-tests:
    - pnpm --filter api test
    - Fast feedback with miniflare (< 1 minute)

  e2e-tests:
    - Deploy API to Cloudflare preview environment
    - API_BASE=https://preview.workers.dev pnpm --filter api test:e2e
    - Validates real behavior against deployed infrastructure
    - Cleanup preview deployment
    - Slower but high confidence (< 5 minutes)
```

E2E tests use `@wonder/sdk` to call the deployed API, validating:

- The API service works correctly
- The SDK client library works correctly
- The entire stack integrates properly

## Known Limitations

### Miniflare Limitations

From [Cloudflare's Known Issues](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/):

1. **WebSockets + DOs + isolated storage** - Cannot be tested together in miniflare
   - Error: SQLite WAL files prevent proper storage cleanup
   - Solution: Test WebSockets via E2E tests against real infrastructure
2. **DO alarms** - Don't respect isolated storage
   - Must manually delete/run alarms with `runDurableObjectAlarm()` in each test
3. **Fake timers** - Don't apply to KV/R2/cache expiration

### When to Skip Miniflare Tests

Skip miniflare tests when:

- Testing WebSocket connections (use E2E)
- Testing cross-worker RPC with complex state (use E2E)
- Testing DO persistence across multiple requests (use E2E)
- Fighting miniflare limitations takes more time than writing E2E test

**Rule of thumb:** If you spend >30 minutes fighting a miniflare limitation, write an E2E test instead.
