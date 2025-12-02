# Logs vs Events

## The Core Distinction

Ask "Why am I recording this?"

### Operational Logs

**Purpose:** Debug service problems, track operations, investigate errors

**Package:** `@wonder/logger`  
**Storage:** D1 (operational database)  
**Retention:** 30 days → R2 archive

**Examples:**

- `service=http, event_type=request_received` - Track incoming traffic
- `service=resources, event_type=action_not_found` - Debug invalid requests
- `service=coordinator, event_type=do_alarm_failed` - Service failure
- `service=executor, event_type=rpc_timeout` - Infrastructure issue

### Workflow Events

**Purpose:** Understand execution flow, optimize workflows, enable replay/audit

**Service:** Event service (DO + RPC)  
**Storage:** D1 (events database) + Analytics Engine  
**Retention:** 90+ days for audit/compliance

**Examples:**

- `event_type=node_started, workflow_run_id=run_123` - Execution flow
- `event_type=llm_call_completed, tokens=500, cost_usd=0.02` - Cost tracking
- `event_type=fan_out_triggered, branches=5` - Parallelism analysis
- `event_type=transition_evaluated, condition=true` - Routing logic

## Decision Matrix

| Scenario                | Operational Log?          | Workflow Event?         |
| ----------------------- | ------------------------- | ----------------------- |
| Coordinator DO created  | ✅ Service lifecycle      | ❌                      |
| Workflow run started    | ✅ Operation received     | ✅ Run initiated        |
| Node execution began    | ❌                        | ✅ Execution state      |
| Executor task received  | ✅ Service tracking       | ❌                      |
| LLM call completed      | ❌                        | ✅ Cost/performance     |
| RPC timeout             | ✅ Infrastructure failure | ❌                      |
| Context corrupted       | ✅ Critical error         | ❌                      |
| Token spawned (fan-out) | ❌                        | ✅ Parallelism tracking |
| Database query slow     | ✅ Performance issue      | ❌                      |
| Transition evaluated    | ❌                        | ✅ Routing optimization |

## Service Responsibilities

### Coordinator

- **Operational logs:** DO lifecycle, RPC errors, storage failures, alarm handling
- **Workflow events:** ALL execution state changes (calls event service via RPC)

### Executor

- **Operational logs:** Task receipt, execution errors, timeout handling
- **Workflow events:** None (coordinator owns the event stream)

### Resources

- **Operational logs:** CRUD operations, validation failures, DB errors
- **Workflow events:** None (not part of execution)

### HTTP

- **Operational logs:** Request routing, auth failures, rate limiting
- **Workflow events:** None (entry point only)

## Edge Cases

### "Workflow run started"

Both:

- **Operational:** Coordinator received work and began processing
- **Workflow event:** Run officially initiated with initial context

### "Node execution failed"

Both:

- **Operational:** If it's a service/infrastructure failure (executor crash, timeout)
- **Workflow event:** Always record for execution history and replay

### "Validation error in workflow input"

Operational only:

- It's a malformed request, not an execution event
- Run never actually started

## Storage Architecture

```
┌─────────────────────────────────────────────────┐
│                  Services                       │
│  (Coordinator, Executor, Resources, HTTP)       │
└─────────────────────────────────────────────────┘
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
┌──────────────────┐  ┌──────────────────┐
│  @wonder/logger  │  │  Event Service   │
│                  │  │   (DO + RPC)     │
└─────────┬────────┘  └────────┬─────────┘
          │                    │
          ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│  D1 (ops logs)   │  │ D1 (events) +    │
│  30-day retain   │  │ Analytics Engine │
└──────────────────┘  └──────────────────┘
          │                    │
          ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│  R2 Archive      │  │  Long-term       │
│  (historical)    │  │  (90+ days)      │
└──────────────────┘  └──────────────────┘
```

## Query Patterns

### Operational Logs

```sql
-- Service errors in last hour
WHERE service = 'executor' AND level = 'error' AND timestamp > ?

-- Slow database queries
WHERE event_type = 'db_query_slow' AND json_extract(metadata, '$.duration_ms') > 1000

-- All operations for a request trace
WHERE request_id = 'req_abc123'
```

### Workflow Events

```sql
-- Complete execution history for a run
WHERE workflow_run_id = 'run_xyz789' ORDER BY timestamp

-- LLM cost analysis
WHERE event_type = 'llm_call_completed' 
  AND timestamp > ? 
  GROUP BY workspace_id

-- Fan-out performance
WHERE event_type IN ('fan_out_triggered', 'fan_in_complete')
  AND workflow_run_id = 'run_xyz789'
```

## Key Principles

1. **Separation of concerns** - Service health vs execution observability
2. **Different lifetimes** - Operational logs are ephemeral, workflow events are audit trails
3. **Optimized storage** - Each system indexed for its query patterns
4. **Clear ownership** - Coordinator emits events, all services emit logs
5. **No mixing** - Don't put workflow metadata in operational logs (use event service)
