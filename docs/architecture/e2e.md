# End-to-End Testing

## Overview

E2E tests run against real Cloudflare infrastructure instead of the vitest-pool-workers test environment. This allows testing features that don't work in isolated tests, particularly Durable Objects with WebSocket connections and SQLite storage.

## Why E2E Tests?

The vitest-pool-workers test framework has limitations:

- Cannot properly clean up Durable Object SQLite storage after tests
- WebSocket connections to DOs cause storage isolation failures
- Some real-world scenarios (multi-DO coordination, queue behavior) are hard to simulate

E2E tests solve this by running against actual Workers infrastructure.

## Approaches

### 1. Wrangler Dev Environment Tests

Run tests against `wrangler dev` for local development:

```typescript
// test/e2e/websocket-streaming.e2e.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('WebSocket Streaming E2E', () => {
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = 'http://localhost:8787';
    // Assumes wrangler dev is already running
  });

  it('should stream events via WebSocket', async () => {
    // Start a workflow
    const response = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: '01JDXSEED0000WORKFLOW0001',
        input: { name: 'Alice' },
      }),
    });

    expect(response.ok).toBe(true);
    const { workflow_run_id, durable_object_id } = await response.json();

    // Connect WebSocket to DO
    const ws = new WebSocket(`ws://localhost:8787/stream/${workflow_run_id}`);

    const events: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        events.push(data);

        // Complete after receiving workflow_started
        if (data.kind === 'workflow_started') {
          ws.close();
          resolve();
        }
      };

      ws.onerror = (error) => {
        reject(error);
      };

      ws.onclose = () => {
        resolve();
      };

      // Timeout
      setTimeout(() => {
        ws.close();
        reject(new Error('Test timeout'));
      }, 5000);
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'workflow_started')).toBe(true);
  });
});
```

**Usage:**

```bash
# Terminal 1: Start dev server
pnpm wrangler dev --port 8787

# Terminal 2: Run E2E tests
E2E_ENABLED=true pnpm vitest run test/e2e
```

### 2. Preview Environment Tests

Deploy to a Cloudflare preview environment for CI/CD:

```toml
# wrangler.preview.jsonc
name = "wonderful-api-preview"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "wonderful-preview-db"
database_id = "..." # separate preview database

[[durable_objects.bindings]]
name = "WORKFLOW_COORDINATOR"
class_name = "WorkflowCoordinator"
```

```json
// package.json
{
  "scripts": {
    "deploy:preview": "wrangler deploy --config wrangler.preview.jsonc",
    "test:e2e:preview": "E2E_BASE_URL=https://wonderful-api-preview.your-subdomain.workers.dev pnpm vitest run test/e2e",
    "test:e2e": "pnpm deploy:preview && pnpm test:e2e:preview"
  }
}
```

### 3. Dedicated Test Environment

Set up a permanent test environment with its own resources:

```toml
# wrangler.test.jsonc
name = "wonderful-api-test"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "wonderful-test-db"
database_id = "..." # dedicated test database

[[durable_objects.bindings]]
name = "WORKFLOW_COORDINATOR"
class_name = "WorkflowCoordinator"

[[queues.producers]]
binding = "WORKFLOW_QUEUE"
queue = "wonderful-workflow-queue-test"

[[queues.consumers]]
queue = "wonderful-workflow-queue-test"
max_batch_size = 10
max_batch_timeout = 5
```

**Advantages:**

- Persistent environment for testing
- Can be used by entire team
- Closer to production setup
- Good for integration testing between services

**Setup:**

```bash
# Deploy test environment
pnpm wrangler deploy --config wrangler.test.jsonc

# Run migrations
pnpm wrangler d1 migrations apply wonderful-test-db --remote

# Seed test data
pnpm wrangler d1 execute wonderful-test-db --remote --file=test/fixtures/seed.sql
```

### 4. Simple E2E Setup (Recommended Starting Point)

Create minimal E2E infrastructure:

```typescript
// test/e2e/setup.ts
export const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8787';
export const E2E_ENABLED = process.env.E2E_ENABLED === 'true';

export async function waitForCondition(
  fn: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Condition not met within timeout');
}
```

```typescript
// test/e2e/websocket.e2e.test.ts
import { describe, it, expect } from 'vitest';
import { E2E_BASE_URL, E2E_ENABLED } from './setup';

describe.skipIf(!E2E_ENABLED)('WebSocket E2E', () => {
  it('streams workflow events in real-time', async () => {
    // Test implementation here
  });

  it('handles multiple concurrent connections', async () => {
    // Test multiple WebSocket clients
  });

  it('recovers from connection drops', async () => {
    // Test reconnection logic
  });
});
```

```typescript
// vitest.e2e.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e.test.ts'],
    testTimeout: 30000, // Longer timeout for E2E
    hookTimeout: 10000,
  },
});
```

## Running E2E Tests

### Local Development

```bash
# Start the dev server
pnpm wrangler dev --port 8787

# In another terminal
E2E_ENABLED=true pnpm vitest run --config vitest.e2e.config.ts
```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Preview
        run: |
          pnpm wrangler deploy --config wrangler.preview.jsonc
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Run E2E Tests
        run: |
          E2E_BASE_URL=https://wonderful-api-preview.your-subdomain.workers.dev \
          E2E_ENABLED=true \
          pnpm vitest run --config vitest.e2e.config.ts
```

## Best Practices

1. **Keep E2E tests separate** - Don't mix with unit/integration tests
2. **Use environment variables** - Make base URLs configurable
3. **Clean up after tests** - Delete test data or use separate test DB
4. **Test real scenarios** - Focus on things that can't be unit tested
5. **Don't over-test** - E2E tests are slow; use sparingly
6. **Mock external dependencies** - Use test API keys for external services

## What to E2E Test

**Good candidates:**

- WebSocket connections to Durable Objects
- Queue message processing end-to-end
- Multi-DO coordination scenarios
- Real AI model calls (with test budget limits)
- MCP server interactions
- Complex workflow execution paths

**Keep in unit tests:**

- Repository functions
- Data transformations
- Validation logic
- Error handling
- Token management
- Context manipulation

## Current Status

We currently use manual testing via `test-websocket.html` for WebSocket streaming verification. This works well for development but could be automated with the E2E approach above when needed.
