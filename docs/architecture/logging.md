# Logging

## Streams

Two log streams, same infrastructure:

| Stream          | Source                   | Examples                                              |
| --------------- | ------------------------ | ----------------------------------------------------- |
| Workflow events | DOs/Workers during runs  | node_started, llm_call, fan_in_complete, error        |
| App logs        | Workers/DOs outside runs | auth_failed, webhook_received, slow_request, do_alarm |

App logs are selective—errors, auth, anomalies. Routine requests not persisted.

## Storage

- **D1**: Primary log store, 30-day retention
- **R2**: Archive after 30 days via scheduled worker
- **Analytics Engine**: Metrics aggregations (LLM spend, run duration, error rates)

## Schema

```sql
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,           -- debug, info, warn, error, fatal
  event_type TEXT NOT NULL,
  message TEXT,
  metadata TEXT,                 -- JSON blob: all context merged
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_level ON logs(level, timestamp);
```

Query by extracting JSON: `WHERE json_extract(metadata, '$.projectId') = 'proj_123'`

## Querying

- Filter by level, event_type, time range
- Extract metadata fields via `json_extract`
- `LIKE` on message for text search
- Click-to-expand for full metadata

## Archival

Scheduled worker runs daily:

1. Query logs older than 30 days
2. Batch write to R2 as NDJSON, keyed by date
3. Delete from D1

## Metrics

Analytics Engine tracks:

- Error rate by workflow/node
- LLM call latency and token spend
- Run duration distribution
- Fan-out/fan-in timing

Query via API or `wrangler analytics-engine`.

## Alerting

Worker-based, minimal:

- Catch errors → post to Slack/Discord webhook
- Optional: Analytics Engine scheduled query → alert on threshold breach

## UI

Simple log viewer in SvelteKit:

- Filter by level, event_type, time range
- Extract/filter metadata fields (project, workflow, run, etc.)
- Text search on message
- Table view, click row to expand metadata

## Logger Package

Generic logger package. App-specific context passed as metadata via `child()`.

### API

```typescript
// Create logger with D1 binding
const logger = createLogger({ db: env.DB });

// Add any metadata via child()
const requestLogger = logger.child({ requestId: "req_123" });
const childLogger = requestLogger.child({ userId: "user_456" });

// Log events (sync, buffers internally)
childLogger.info("request_started", { path: "/api/users" });
childLogger.warn("slow_query", { duration_ms: 500 });
childLogger.error("validation_failed", { field: "email" });

// Flush at request/alarm boundary
await logger.flush();
```

### Levels

- `debug` — verbose tracing, console only (not persisted)
- `info` — normal operations
- `warn` — recoverable issues
- `error` — failures, handled gracefully
- `fatal` — catastrophic, immediate flush + alert

### Behavior

- **Sync logging**: `logger.info()` returns void, buffers internally
- **Explicit flush**: `await logger.flush()` writes batch to D1
- **Auto-flush**: On buffer threshold (50 events)
- **Console output**: All levels write to `console.log` (JSON) for `wrangler tail`
- **Fatal**: Immediate flush + alert webhook, doesn't wait for batch

### Metrics Separate

Logger handles logs only. Analytics Engine metrics use a separate metrics package:

```typescript
metrics.increment("api_calls", { endpoint: "/users" });
metrics.timing("request_latency_ms", duration, { method: "POST" });
```

## No External Dependencies

- No Sentry
- No BetterStack
- `wrangler tail` for real-time debugging
- D1 queries for historical search
