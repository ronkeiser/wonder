The "edge test" is the test that validates our current work and lives in `packages/test/src/tests/edge`.

It can be run using the `pnpm test:edge` command in the root directory.

We validate all of our work against edge tests via trace events. After running a test, you can query the trace events like this:

```bash
# All trace events for a workflow run (ordered by sequence)
curl "https://wonder-http.ron-keiser.workers.dev/api/events/trace?workflow_run_id=run_123"

# Filter by category (decision/operation/dispatch/sql)
curl "https://wonder-http.ron-keiser.workers.dev/api/events/trace?workflow_run_id=run_123&category=decision"

# Filter by event type
curl "https://wonder-http.ron-keiser.workers.dev/api/events/trace?workflow_run_id=run_123&type=decision.routing.start"
```

All API endpoints require an API key in the `X-API-Key` header. The key is stored in `.env` at the project root:

```bash
# Set the API key (from .env)
export API_KEY="ga5jSrsUxsZQtcIT8v1WEUeHhP+2S5o/gNSS7QLEFYM="

# Include in all requests
curl -H "X-API-Key: $API_KEY" "https://wonder-http.ron-keiser.workers.dev/api/events/trace?workflow_run_id=run_123"
```

Do you understand?
