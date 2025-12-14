# Debugging Wonder Workflows

Quick reference for querying workflow execution data via HTTP endpoints.

## Authentication

All API endpoints require an API key in the `X-API-Key` header. The key is stored in `.env` at the project root:

```bash
# Set the API key (from .env)
export API_KEY="ga5jSrsUxsZQtcIT8v1WEUeHhP+2S5o/gNSS7QLEFYM="

# Include in all requests
curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/api/logs?limit=10"
```

All curl examples below assume you've exported the `API_KEY` environment variable.

## Query Events

### Workflow Events

Business-level events (workflow started, node completed, etc.):

```bash
# All events for a workflow run
curl "https://api.wflow.app/api/events?workflow_run_id=run_123"

# Filter by event type
curl "https://api.wflow.app/api/events?workflow_run_id=run_123&event_type=node_completed"

# Filter by node
curl "https://api.wflow.app/api/events?workflow_run_id=run_123&node_id=process_step"

# Filter by token (specific execution branch)
curl "https://api.wflow.app/api/events?token_id=tok_abc123"

# Pagination
curl "https://api.wflow.app/api/events?workflow_run_id=run_123&limit=50&after_sequence=100"
```

**Query Parameters:**

- `workflow_run_id` - Filter by workflow run
- `parent_run_id` - Filter by parent run (for sub-workflows)
- `workspace_id` - Filter by workspace
- `project_id` - Filter by project
- `event_type` - Filter by event type
- `node_id` - Filter by node
- `token_id` - Filter by token (execution branch)
- `limit` - Max results (default: 100, max: 10000)
- `after_sequence` - Pagination cursor

### Trace Events

Internal execution events (decision logic, SQL queries, operations):

```bash
# All trace events for a workflow run (ordered by sequence)
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123"

# Filter by category (decision/operation/dispatch/sql)
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&category=decision"

# Filter by event type
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&type=decision.routing.start"

# Find slow SQL queries
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&category=sql&min_duration_ms=50"

# Debug specific token
curl "https://api.wflow.app/api/events/trace?token_id=tok_abc123"

# Performance profiling
curl "https://api.wflow.app/api/events/trace?workspace_id=ws_123&min_duration_ms=100&limit=50"
```

**Query Parameters:**

- `workflow_run_id` - Filter by workflow run
- `token_id` - Filter by token
- `node_id` - Filter by node
- `type` - Filter by trace event type (e.g., `decision.routing.start`)
- `category` - Filter by category: `decision`, `operation`, `dispatch`, `sql`
- `workspace_id` - Filter by workspace
- `project_id` - Filter by project
- `limit` - Max results (default: 1000, max: 10000)
- `min_duration_ms` - Filter operations slower than threshold

## Query Logs

Service-level logs (errors, warnings, debug info):

```bash
# All logs for a service
curl "https://api.wflow.app/api/logs?service=coordinator"

# Filter by log level
curl "https://api.wflow.app/api/logs?service=coordinator&level=error"

# Filter by trace ID (correlate across services)
curl "https://api.wflow.app/api/logs?trace_id=trace_abc123"

# Filter by workspace/project
curl "https://api.wflow.app/api/logs?workspace_id=ws_123&level=error"
```

**Query Parameters:**

- `service` - Filter by service name (coordinator, executor, etc.)
- `level` - Filter by level: `error`, `warn`, `info`, `debug`, `fatal`
- `event_type` - Filter by event type
- `trace_id` - Filter by trace ID
- `request_id` - Filter by request ID
- `workspace_id` - Filter by workspace
- `project_id` - Filter by project
- `user_id` - Filter by user
- `limit` - Max results (default: 100, max: 1000)

## Common Debugging Patterns

### Trace a Workflow Execution Path

```bash
# 1. Get workflow events (high-level flow)
curl "https://api.wflow.app/api/events?workflow_run_id=run_123&limit=1000" | jq '.events[] | {event_type, node_id, token_id}'

# 2. Get trace events (internal decisions)
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&category=decision" | jq '.events[] | {type, payload}'

# 3. Check for errors
curl "https://api.wflow.app/api/logs?trace_id=run_123&level=error"
```

### Debug Slow Workflows

```bash
# Find slow SQL queries
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&category=sql&min_duration_ms=50" | jq '.events[] | {type, duration_ms, payload}'

# Find slow operations
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&min_duration_ms=100" | jq '.events[] | {type, category, duration_ms}'
```

### Debug Synchronization Issues

```bash
# Get all synchronization events
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123&type=decision.sync.start"

# Get branch table lifecycle
curl "https://api.wflow.app/api/events/trace?workflow_run_id=run_123" | jq '.events[] | select(.type | contains("branch_table"))'
```

### Debug Specific Token (Branch)

```bash
# Trace single branch execution
curl "https://api.wflow.app/api/events?token_id=tok_abc123" | jq '.events[] | {sequence_number, event_type, node_id}'

# Internal operations for token
curl "https://api.wflow.app/api/events/trace?token_id=tok_abc123" | jq '.events[] | {sequence, type, payload}'
```

### Production Issue Investigation

```bash
# Find recent errors across workspace
curl "https://api.wflow.app/api/logs?workspace_id=ws_123&level=error&limit=100"

# Find workflows with slow queries
curl "https://api.wflow.app/api/events/trace?workspace_id=ws_123&category=sql&min_duration_ms=100" | jq 'group_by(.workflow_run_id) | map({workflow_run_id: .[0].workflow_run_id, slow_queries: length})'
```

## Response Format

All endpoints return JSON with consistent structure:

**Events:**

```json
{
  "events": [
    {
      "id": "01HX...",
      "timestamp": 1701234567890,
      "sequence_number": 0,
      "event_type": "workflow_started",
      "workflow_run_id": "run_123",
      "workspace_id": "ws_123",
      "project_id": "proj_123",
      "node_id": null,
      "token_id": null,
      "metadata": {
        /* event-specific data */
      }
    }
  ]
}
```

**Trace Events:**

```json
{
  "events": [
    {
      "type": "decision.routing.start",
      "token_id": "tok_abc123",
      "node_id": "node_start"
      /* ...rest of event payload */
    }
  ]
}
```

**Logs:**

```json
{
  "logs": [
    {
      "id": "01HX...",
      "timestamp": 1701234567890,
      "level": "error",
      "service": "coordinator",
      "message": "Failed to execute task",
      "metadata": {
        /* log-specific data */
      }
    }
  ]
}
```

## Tips

- **Default ordering**: Events ordered by `timestamp DESC`, trace events by `sequence ASC`
- **Limits**: Start with default limits, increase only if needed
- **Filtering**: Combine filters to narrow results (e.g., `workflow_run_id` + `event_type`)
- **Performance**: Use `min_duration_ms` to focus on slow operations
- **Correlation**: Use `trace_id` or `workflow_run_id` to correlate across logs/events
- **Pagination**: Use `limit` and `after_sequence` for large result sets

## Event Types Reference

### Workflow Events

- `workflow_started` - Workflow execution began
- `workflow_completed` - Workflow finished successfully
- `workflow_failed` - Workflow failed
- `node_started` - Node execution began
- `node_completed` - Node finished successfully
- `node_failed` - Node failed
- `token_spawned` - New token created (fan-out)
- `token_merged` - Tokens merged (fan-in)

### Trace Event Categories

- **decision** - Pure decision logic (`routing.*`, `sync.*`)
- **operation** - State operations (`tokens.*`, `context.*`)
- **dispatch** - Decision execution (`batch.*`, `decision.*`)
- **sql** - SQL query execution (`query`)

See [trace-events.md](./trace-events.md) for complete event type reference.
