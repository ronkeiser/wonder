# Debugging Guide

## Overview

The "edge test" is the test that validates our current work and lives in `packages/test/src/tests/edge`.

It can be run using the `pnpm test:edge` command in the root directory.

## Querying Trace Events

We validate all of our work against edge tests via trace events. After running a test, you can query the trace events like this:

**IMPORTANT:** All API endpoints require authentication. First, set your API key (from `.env` at the project root):

```bash
export API_KEY="ga5jSrsUxsZQtcIT8v1WEUeHhP+2S5o/gNSS7QLEFYM="
```

Then include the `-H "X-API-Key: $API_KEY"` header in **every** request:

```bash
# All trace events for a workflow run (ordered by sequence)
curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/events/trace?workflow_run_id=run_123"

# Filter by category (decision/operation/dispatch/sql)
curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/events/trace?workflow_run_id=run_123&category=decision"

# Filter by event type
curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/events/trace?workflow_run_id=run_123&type=decision.routing.start"
```

### Response Structure

All event endpoints return a **wrapped object**, not a raw array:

```json
{
  "events": [...]
}
```

When using `jq`, access the `.events` array first:

```bash
# WRONG - will error with "Cannot index object with number"
curl -s -H "X-API-Key: $API_KEY" "https://api.wflow.app/events?limit=5" | jq '.[0]'

# CORRECT - access the events array first
curl -s -H "X-API-Key: $API_KEY" "https://api.wflow.app/events?limit=5" | jq '.events[0]'

# Get the workflow_run_id from the most recent event
curl -s -H "X-API-Key: $API_KEY" "https://api.wflow.app/events?limit=1" | jq -r '.events[0].workflow_run_id'
```

### Trace Event Types

Trace events are defined in the events service in `services/events/src/types.ts`. Whenever we add new events to the `coordinator` or `executor` services, we need to update the event types.

## Deployment

When ever you make changes to the code in preparation to run a new test, you must deploy the service. The root package.json provide these scripts:

```typescript
  "scripts": {
    "test": "vitest run --config packages/test/vitest.config.ts",
    "test:edge": "vitest run --config packages/test/vitest.config.ts tests/edge",
    "types": "pnpm --filter @wonder/env run build-services",
    "typecheck": "pnpm run --parallel --filter \"./services/*\" typecheck",
    "deploy:all": "pnpm -r --filter './services/*' --workspace-concurrency 1 deploy",
    "deploy:coordinator": "wrangler deploy --config services/coordinator/wrangler.jsonc",
    "deploy:events": "wrangler deploy --config services/events/wrangler.jsonc",
    "deploy:executor": "wrangler deploy --config services/executor/wrangler.jsonc",
    "deploy:http": "wrangler deploy --config services/http/wrangler.jsonc",
    "deploy:logs": "wrangler deploy --config services/logs/wrangler.jsonc",
    "deploy:resources": "wrangler deploy --config services/resources/wrangler.jsonc",
    "deploy:web": "pnpm --filter web run deploy"
  },
```

## Logging

Sometimes, it may be necessary for debugging to add logs. For this, use the `@wonder/logs` client, DO NOT use `console.log`. You can query the logs like this:

```bash
# All logs for a service
curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/logs?service=coordinator"

# Filter by log level
curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/logs?service=coordinator&level=error"

# Filter by trace ID (correlate across services)
curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/logs?trace_id=trace_abc123"
```

## Type Checking and Regeneration

After making edits, before announcing completion of work, you MUST run a typecheck. You can do this by running `pnpm typecheck` at the root.

If you changed any of the RPC signatures of any of the services, you must regenerate the types with `pnpm types`.

### Updating Trace Event Types

**NOTE:** It is common to have to update the trace event types (after adding new trace events to coordinator) at `services/events/src/types.ts`. HOWEVER, if you do so, you **MUST ALSO:**

- update the http service zod schemas at `services/http/src/routes/event/schema.ts`
- run `pnpm types` from the root. Doing this will BOTH generate worker configurations for all services AND run typechecks against all services.
- run `pnpm gen:sdk` from the root to regenerate the sdk.

## Getting the Workflow Run ID

Run the edge test, then query the events for the last minute to get the workflow_run_id. You can then use that id to perform any other queries you need.
