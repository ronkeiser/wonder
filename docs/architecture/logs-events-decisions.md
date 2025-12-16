# Logs, Events, and Decisions

## The Three-Layer Architecture

### Foundation: Actor Model

Our system is built on Cloudflare's implementation of the **Actor Model**:

- **Durable Objects = Actors** with isolated state (SQLite)
- **RPC calls = Messages** between actors
- **Single-threaded execution** per actor (no race conditions)

We enhance this with a **Decision Layer** for testability and observability.

### The Fundamental Relationship

**Events are the results of Decisions.**

```
Decision (pure data) → Execute (actor message) → Event (outcome)
```

A decision describes what you _want_ to happen. An event records what _actually happened_. Most decisions produce a corresponding event after successful execution.

### 1. Decisions (Pure Logic)

**Purpose:** Pure decision logic - describes _what to do_

**Location:** Return types from coordinator decision functions  
**Tense:** Future/declarative - decisions not yet executed  
**Lifecycle:** Ephemeral - created and immediately executed  
**Actor Model:** Converted to actor messages (RPC calls)

**Examples:**

```typescript
{ type: 'CREATE_TOKEN', node_id: 'node_2', path_id: 'path_a' }
{ type: 'UPDATE_CONTEXT', key: 'user.name', value: 'Alice' }
{ type: 'DISPATCH_TASK', token_id: 'tok_123', action: {...} }
{ type: 'COMPLETE_WORKFLOW', output: { result: 42 } }
```

**Key Characteristics:**

- Return values from pure functions (no I/O, testable)
- Describe intent as data, not implementation
- Enable testing without spinning up actors
- Converted to actor messages by coordinator
- **Each decision typically produces a corresponding event**

### 2. Events (Workflow Observability)

**Purpose:** Track _what happened_ during workflow execution - usually as the result of a decision

**Service:** Event service (DO + RPC)  
**Tense:** Past - observations after execution  
**Storage:** D1 (events database) + Analytics Engine  
**Retention:** 90+ days for audit/compliance  
**Scope:** Workflow execution only (coordinator emits)  
**Actor Model:** Audit trail of actor state changes

**Examples:**

- `event_type=token.created` - Result of `CREATE_TOKEN` decision
- `event_type=context.updated` - Result of `SET_CONTEXT` decision
- `event_type=task.dispatched` - Result of token dispatch operation
- `event_type=task.completed` - Result of executor completing task
- `event_type=workflow.completed` - Result of `COMPLETE_WORKFLOW` decision
- `event_type=fan_out.started` - Result of `BATCH_CREATE_TOKENS` decision
- `event_type=fan_in.completed` - Result of `ACTIVATE_FAN_IN` decision

**Key Characteristics:**

- Observable outcomes (state changes that happened)
- Emitted AFTER decision execution succeeds
- Workflow-specific context (workflow_run_id, token_id, node_id)
- Enables replay, audit, cost tracking, performance analysis
- **Most events correspond to a successful decision execution**
- Namespaced format: `category.action` (e.g., `token.created`, `workflow.started`)
- Legacy events: `node_completed`, `node_failed` kept for backward compatibility### 3. Logs (Operational Debugging)

**Purpose:** Debug service problems, track operations, investigate errors

**Package:** `@wonder/logs`  
**Tense:** Past - operations that occurred  
**Storage:** D1 (operational database)  
**Retention:** 30 days → R2 archive  
**Scope:** All services (coordinator, executor, resources, http, events, logs)

**Examples:**

- `service=http, event_type=request_received` - Track incoming traffic
- `service=resources, event_type=action_not_found` - Debug invalid requests
- `service=coordinator, event_type=do_alarm_failed` - Service failure
- `service=executor, event_type=rpc_timeout` - Infrastructure issue

**Key Characteristics:**

- Service-level operations (not workflow-specific)
- Infrastructure concerns (RPC, DB, timeouts, errors)
- All services emit logs
- Troubleshooting and debugging

## The Flow: Decisions → Execution → Events → Logs

```
Router.decide()
  ↓
  Returns Decision[] (pure, testable data)
  ↓
Coordinator.executeDecisions(decisions)
  ↓
  For each decision:
    ├─ Execute as actor message (SQL, RPC, etc.)
    ├─ Emit workflow event (what happened)
    └─ Log any errors (service issues)
```

**Example:**

```typescript
// 1. DECISION: Router returns pure data
const decisions = [
  { type: 'UPDATE_CONTEXT', key: 'user.email', value: 'alice@example.com' },
  { type: 'CREATE_TOKEN', node_id: 'node_2', path_id: 'path_a' }
];

// 2. EXECUTE: Coordinator converts to actor messages
executeDecisions(decisions) {
  for (const decision of decisions) {
    if (decision.type === 'UPDATE_CONTEXT') {
      // Execute: Write to SQL (actor state mutation)
      await sql.exec('UPDATE context SET ...');

      // Event: Emit what happened
      emitter.emit(eventContext, {
        event_type: 'context_updated',
        metadata: { key: decision.key }
      });
    }

    if (decision.type === 'CREATE_TOKEN') {
      try {
        // Execute: Insert token (actor state mutation)
        await tokens.create(decision.node_id, decision.path_id);

        // Event: Emit what happened
        emitter.emit(eventContext, {
          event_type: 'token_spawned',
          node_id: decision.node_id,
          path_id: decision.path_id
        });
      } catch (error) {
        // Log: Service error
        logger.error({
          event_type: 'token_creation_failed',
          message: error.message
        });
      }
    }
  }
}
```

## Decision → Event Mapping

Most decisions produce a corresponding event when successfully executed:

| Decision              | Workflow Event (emit)    | Trace Event (emitTrace)                |
| --------------------- | ------------------------ | -------------------------------------- |
| `CREATE_TOKEN`        | `token.created`          | `operation.tokens.created`             |
| `BATCH_CREATE_TOKENS` | `fan_out.started`        | `operation.tokens.created` (per token) |
| `UPDATE_TOKEN_STATUS` | `token.completed`¹       | `operation.tokens.status_updated`      |
|                       | `token.failed`¹          |                                        |
| `MARK_WAITING`        | `token.waiting`          | —                                      |
| `MARK_FOR_DISPATCH`   | `task.dispatched`        | `dispatch.batch.start`                 |
| `SET_CONTEXT`         | `context.updated`        | —                                      |
| `APPLY_OUTPUT`        | `context.output_applied` | —                                      |
| `MERGE_BRANCHES`      | `branches.merged`        | —                                      |
| `ACTIVATE_FAN_IN`     | `fan_in.completed`       | —                                      |
| `COMPLETE_WORKFLOW`   | `workflow.completed`     | —                                      |
| `FAIL_WORKFLOW`       | `workflow.failed`        | —                                      |
| (Executor callback)   | `task.completed`         | —                                      |
| (Executor callback)   | `task.failed`            | —                                      |
| (Initialization)      | `workflow.started`       | —                                      |

¹ Only emitted for terminal states (completed, failed)

**Key Pattern:** Decision (command) → Execution → Workflow Event (outcome) + Trace Event (operation details)

## Decision Matrix

| Scenario                       | Decision?              | Workflow Event?     | Trace Event?                          |
| ------------------------------ | ---------------------- | ------------------- | ------------------------------------- |
| Router decides to spawn token  | ✅ CREATE_TOKEN        | ❌ (not yet done)   | ❌                                    |
| Token actually created         | ❌ (already done)      | ✅ token.created    | ✅ operation.tokens.created           |
| Token creation fails           | ❌ (failed)            | ❌                  | ✅ dispatch.error                     |
| Router decides context update  | ✅ SET_CONTEXT         | ❌ (not yet done)   | ❌                                    |
| Context updated in DB          | ❌ (already done)      | ✅ context.updated  | ✅ operation.context.field_set        |
| Task completed                 | ❌ (external)          | ✅ task.completed   | ❌                                    |
| Node execution completed       | ❌ (external)          | ✅ node_completed²  | ❌                                    |
| Coordinator DO created         | ❌ (not workflow)      | ❌                  | ✅ Log (service lifecycle)            |
| Workflow run started           | ❌ (initialization)    | ✅ workflow.started | ✅ Log + operation traces             |
| Executor task received         | ❌ (not workflow)      | ❌                  | ✅ Log (service tracking)             |
| RPC timeout                    | ❌ (infrastructure)    | ❌                  | ✅ Log (infrastructure fail)          |
| Database query slow            | ❌ (infrastructure)    | ❌                  | ✅ Log + sql.query trace              |
| Fan-out spawns multiple tokens | ✅ BATCH_CREATE_TOKENS | ✅ fan_out.started  | ✅ operation.tokens.created (per tok) |
| Siblings merge at fan-in       | ✅ ACTIVATE_FAN_IN     | ✅ fan_in.completed | ❌                                    |

² Legacy event kept for backward compatibility

## Service Responsibilities

### Coordinator

- **Decisions:** Returns Decision[] from Router.decide(), TaskManager.prepare()
- **Events:** Emits ALL workflow execution events (via event service RPC)
- **Logs:** DO lifecycle, RPC errors, storage failures, alarm handling
- **Actor Role:** Workflow orchestrator actor with durable SQLite state

### Executor

- **Decisions:** None (receives actor messages via RPC)
- **Events:** None (coordinator owns the workflow event stream)
- **Logs:** Task receipt, execution errors, timeout handling
- **Actor Role:** Stateless task processor actor

### Resources

- **Decisions:** None (CRUD service)
- **Events:** None (not part of workflow execution)
- **Logs:** CRUD operations, validation failures, DB errors
- **Actor Role:** Shared state actor (D1-backed)

### HTTP

- **Decisions:** None (entry point)
- **Events:** None (not part of workflow execution)
- **Logs:** Request routing, auth failures, rate limiting
- **Actor Role:** Stateless router (not a DO)

## Edge Cases: Understanding the Decision → Event Flow

### "Router decides to create token"

1. **Decision:** ✅ `CREATE_TOKEN` - Router returns pure data
2. **Execution:** Coordinator executes `tokens.create()` (actor state mutation)
3. **Workflow Event:** ✅ `token.created` - Result of successful execution
4. **Trace Event:** ✅ `operation.tokens.created` - Low-level operation details
5. **Log:** Only if execution failed (SQL error, etc.)

### "Context update lifecycle"

1. **Decision:** ✅ `SET_CONTEXT` - Router returns pure data
2. **Execution:** Coordinator writes to SQL (actor state mutation)
3. **Workflow Event:** ✅ `context.updated` - Result of successful write
4. **Trace Event:** ✅ `operation.context.field_set` - Operation details
5. **Log:** Only if write failed

### "Workflow run started"

- **Decision:** None (initialization, not from a decision function)
- **Workflow Event:** ✅ `workflow.started` - Execution began
- **Log:** ✅ Coordinator received start request (service operation)

### "Task execution failed"

- **Decision:** None (failure is observed, not commanded)
- **Workflow Event:** ✅ `task.failed` - Workflow history (what happened)
- **Legacy Event:** ✅ `node_failed` - Backward compatibility
- **Log:** ✅ Infrastructure failure details (why it happened)

### "Validation error in workflow input"

- **Decision:** None (rejected before any decisions)
- **Event:** None (workflow never started)
- **Log:** ✅ Malformed request received

## Storage Architecture

```
┌─────────────────────────────────────────────────┐
│         Coordinator (DO = Actor)                │
│                                                 │
│  Router.decide() → Decision[]                   │
│       ↓                                         │
│  executeDecisions(decisions)                    │
│       ↓              ↓            ↓             │
│  Actor Messages  Emit Event    Log Error        │
└──────┬──────────────┬─────────────┬─────────────┘
       │              │             │
       │              │             │
       ▼              ▼             ▼
┌─────────────┐ ┌──────────────┐ ┌────────────┐
│  SQL/RPC    │ │ Event Service│ │@wonder/logs│
│ (Messages)  │ │  (Actor DO)  │ │  (Service) │
└─────────────┘ └──────┬───────┘ └─────┬──────┘
                       │               │
                       ▼               ▼
              ┌──────────────┐ ┌──────────────┐
              │ D1 (events)  │ │ D1 (ops logs)│
              │ + Analytics  │ │ 30-day retain│
              └──────┬───────┘ └──────┬───────┘
                     │                │
                     ▼                ▼
              ┌──────────────┐ ┌──────────────┐
              │  Long-term   │ │  R2 Archive  │
              │  (90+ days)  │ │ (historical) │
              └──────────────┘ └──────────────┘
```

**Key Points:**

- **Decisions** are ephemeral (not stored) - only exist as return values
- **Events** are persisted for workflow audit/replay (D1 + Analytics)
- **Logs** are persisted for operational debugging (D1 → R2)
- **Actor Model**: Decisions converted to messages between actors

## Query Patterns

### Decisions (No Queries - Ephemeral)

Decisions are never stored, so they can't be queried. They exist only as:

- Return values from decision functions
- Input to executeDecisions()
- Test assertions in unit tests

### Events (Workflow Analysis)

```sql
-- Complete execution history for a run
WHERE workflow_run_id = 'run_xyz789' ORDER BY sequence_number

-- Task execution cost analysis
WHERE event_type IN ('task.dispatched', 'task.completed', 'task.failed')
  AND timestamp > ?
  GROUP BY workspace_id

-- Fan-out performance
WHERE event_type IN ('fan_out.started', 'fan_in.completed')
  AND workflow_run_id = 'run_xyz789'

-- Context modifications over time
WHERE event_type IN ('context.updated', 'context.output_applied')
  AND workflow_run_id = 'run_xyz789'
  ORDER BY sequence_number

-- Token lifecycle tracking
WHERE event_type LIKE 'token.%'
  AND workflow_run_id = 'run_xyz789'
  ORDER BY sequence_number
```

### Logs (Service Debugging)

```sql
-- Service errors in last hour
WHERE service = 'executor' AND level = 'error' AND timestamp > ?

-- Slow database queries
WHERE event_type = 'db_query_slow' AND json_extract(metadata, '$.duration_ms') > 1000

-- All operations for a request trace
WHERE trace_id = 'run_xyz789'

-- RPC failures across services
WHERE event_type LIKE '%rpc%' AND level = 'error'
```

## Key Principles

1. **Events are the results of Decisions**:
   - Decision = pure data describing state change (what to do)
   - Event = outcome (what happened after executing the decision)
   - Most decisions produce a corresponding event
   - Decisions without events: Filtered or rejected before execution
   - Events without decisions: External observations (`task.completed` from executor actor)
   - **Two event layers**: Workflow events (`emit()`) for user-facing milestones, trace events (`emitTrace()`) for debugging

2. **Tense matters**:
   - Decisions: Future/declarative (what to do)
   - Events: Past (what happened - usually from a decision)
   - Logs: Past (what went wrong)

3. **Scope matters**:
   - Decisions: Coordinator decision logic only
   - Events: Workflow execution only (outcomes of decisions + external observations)
   - Logs: All services

4. **Actor Model foundation**:
   - Decisions = data returned from pure functions
   - Execution = converting decisions to actor messages (RPC)
   - Actors = DOs with isolated state, single-threaded execution

5. **Lifecycle matters**:
   - Decisions: Ephemeral (not stored, immediately executed)
   - Events: Long-lived (90+ days for audit)
   - Logs: Medium-lived (30 days + archive)

6. **Purpose matters**:
   - Decisions: Enable pure, testable decision logic (no actors needed)
   - Workflow Events: Record execution milestones, enable replay, audit, cost tracking (user-facing)
   - Trace Events: Debug decision planning, performance metrics, low-level operations (developer-facing)
   - Logs: Enable service debugging, infrastructure monitoring

7. **Naming convention**:
   - Workflow Events: Namespaced format `category.action` (e.g., `token.created`, `workflow.started`)
   - Trace Events: Namespaced format `category.subcategory.action` (e.g., `operation.tokens.created`, `decision.routing.start`)
   - Logs: `event_type` with service context (e.g., `service=coordinator, event_type=do_alarm_failed`)

8. **The canonical flow**:

   ```
   Decision (data) → Execute (actor message) → Workflow Event (milestone) + Trace Event (operation) | Log (error)
   ```

   - Don't emit events before execution (return decisions instead)
   - Don't put workflow execution outcomes in logs (use events)
   - Don't store decisions (they're ephemeral data)
   - Emit both workflow events (user-facing) and trace events (debugging) when appropriate

9. **Ownership**:
   - Decisions: Returned by Router, TaskManager decision functions
   - Workflow Events: Emitted only by Coordinator (after executing decisions as actor messages)
   - Trace Events: Emitted by Coordinator operations and dispatch layer
   - Logs: Emitted by all services
