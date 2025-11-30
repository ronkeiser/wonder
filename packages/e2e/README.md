# @wonder/e2e

End-to-end tests for the Wonderful workflow platform.

These tests exercise the entire stack: SDK → HTTP Service → API Service → Database

## Running Tests

```bash
# Run workflow E2E test
pnpm --filter @wonder/e2e test

# With custom name
pnpm --filter @wonder/e2e test -- --name "Alice"

# Against local development server
pnpm --filter @wonder/e2e test -- --url "http://localhost:8787"
```

## Test Structure

- `src/workflow-test.ts` - Full workflow lifecycle: create project, run workflow, cleanup
