# Debugging

## Testing Against Live Infrastructure

All tests run against live Cloudflare infrastructure, not local mocks. This means you must deploy services before running tests.

**Workflow:**

1. Make code changes
2. Deploy affected services (see monorepo root `package.json` for deploy scripts)
3. Run tests

**Deploy commands** (from monorepo root):

```bash
pnpm deploy:coordinator   # Deploy coordinator service
pnpm deploy:resources     # Deploy resources service
pnpm deploy:executor      # Deploy executor service
pnpm deploy:events        # Deploy events service
pnpm deploy:logs          # Deploy logs service
pnpm deploy:http          # Deploy HTTP service
pnpm deploy:all           # Deploy all services
```

## Live Observability Services

Two services expose HTTP endpoints for querying operational data in production:

### Logs Service

**Endpoint**: `https://wonder-logs.ron-keiser.workers.dev/logs`

Query application logs from all services (coordinator, resources, executor, etc.)

**Query parameters**:

- `service` - Filter by service name (e.g., `wonder-coordinator`, `resources`)
- `level` - Filter by log level (`debug`, `info`, `warn`, `error`, `fatal`)
- `event_type` - Filter by event type (e.g., `workflow_start_error`, `storage_init_start`)
- `trace_id` - Filter by trace ID
- `request_id` - Filter by request ID
- `workspace_id` - Filter by workspace
- `project_id` - Filter by project
- `user_id` - Filter by user
- `limit` - Number of results (default: 100)

**Example**:

```bash
# Get recent errors
curl -s "https://wonder-logs.ron-keiser.workers.dev/logs?level=error&limit=20" | jq '.'

# Get coordinator logs
curl -s "https://wonder-logs.ron-keiser.workers.dev/logs?service=wonder-coordinator&limit=50" | jq '.'

# Search for specific errors
curl -s "https://wonder-logs.ron-keiser.workers.dev/logs?limit=50" | jq '.logs[] | select(.level == "error")'
```

### Events Service

**Endpoint**: `https://wonder-events.ron-keiser.workers.dev/events`

Query workflow execution events (workflow lifecycle, node execution, token flow)

**Query parameters**:

- `workflow_run_id` - Filter by specific workflow run
- `parent_run_id` - Filter by parent workflow run (for sub-workflows)
- `workspace_id` - Filter by workspace
- `project_id` - Filter by project
- `event_type` - Filter by event type (e.g., `workflow_started`, `node_completed`)
- `node_id` - Filter by node
- `token_id` - Filter by token
- `limit` - Number of results (default: 100)
- `after_sequence` - Get events after sequence number (for pagination)

**Example**:

```bash
# Get recent workflow events
curl -s "https://wonder-events.ron-keiser.workers.dev/events?limit=20" | jq '.'

# Get events for specific workflow run
curl -s "https://wonder-events.ron-keiser.workers.dev/events?workflow_run_id=01KBFH5YBN6ZC8AXKB61AZARD8" | jq '.'

# Get only workflow completions
curl -s "https://wonder-events.ron-keiser.workers.dev/events?event_type=workflow_completed&limit=10" | jq '.'
```

## Common Patterns

### Correlating Logs and Events

1. Find failed workflow in logs:

```bash
curl -s "https://wonder-logs.ron-keiser.workers.dev/logs?level=error&event_type=workflow_start_error" | jq '.logs[0]'
```

2. Extract `workflow_run_id` from metadata, then query events:

```bash
curl -s "https://wonder-events.ron-keiser.workers.dev/events?workflow_run_id=<ID>" | jq '.'
```

### Time-based Filtering

Both services order by timestamp descending. Use `jq` to filter by recent time:

```bash
# Logs from last 10 minutes (timestamp in milliseconds)
NOW=$(date +%s)
TEN_MIN_AGO=$((NOW - 600))
curl -s "https://wonder-logs.ron-keiser.workers.dev/logs?limit=100" | \
  jq ".logs[] | select(.timestamp > ${TEN_MIN_AGO}000)"
```

### Debugging Workflow Failures

1. Check logs for the error:

```bash
curl -s "https://wonder-logs.ron-keiser.workers.dev/logs?level=error&limit=20"
```

2. Look for patterns in error messages (SQLite errors, timeouts, etc.)

3. Check if events were written (workflow may have failed before emitting events):

```bash
curl -s "https://wonder-events.ron-keiser.workers.dev/events?limit=20"
```

4. Compare timestamps: logs should show operational issues, events show execution flow
