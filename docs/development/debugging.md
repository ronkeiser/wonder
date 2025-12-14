The "edge test" is the test that validates our current work and lives in `packages/test/src/tests/edge`.

It can be run using the `pnpm test:edge` command in the root directory.

We validate all of our work against edge tests via trace events. After running a test, you can query the trace events like this:

```bash
# All trace events for a workflow run (ordered by sequence)
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123"

# Filter by category (decision/operation/dispatch/sql)
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&category=decision"

# Filter by event type
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&type=decision.routing.start"
```

All API endpoints require an API key in the `X-API-Key` header. The key is stored in `.env` at the project root:

```bash
# Set the API key (from .env)
export API_KEY="ga5jSrsUxsZQtcIT8v1WEUeHhP+2S5o/gNSS7QLEFYM="

# Include in all requests
curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/api/events/trace?workflow_run_id=run_123"
```

Trace events are defined in the events service in `services/events/src/types.ts`. Whenever we add new events to the `coordinator` or `executor` services, we need to update the event types.

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

Sometimes, it may be necessary for debugging to add logs. For this, use the `@wonder/logs` client, DO NOT use `console.log`. You can query the logs like this:

```bash
# All logs for a service
curl "https://api.wflow.app/api/logs?service=coordinator"

# Filter by log level
curl "https://api.wflow.app/api/logs?service=coordinator&level=error"

# Filter by trace ID (correlate across services)
curl "https://api.wflow.app/api/logs?trace_id=trace_abc123"
```

After making edits, before announcing completion of work, you MUST run a typecheck. You can do this by running `pnpm typecheck` at the root.

If you changed any of the RPC signatures of any of the services, you must regenerate the types with `pnpm types`.
