# Trace Events

Trace events provide line-by-line visibility into coordinator execution without cluttering code with logs. They are structured data that flow through a separate observability channel.

**Trace events replace logging for normal coordinator operations.** Execution traces, performance metrics, state changes, and debugging information are captured as trace events. The coordinator only logs critical failures - errors indicating the coordinator itself is broken, not workflow execution issues.

## Storage Architecture

**Primary storage: Events Service (D1)**

- Queryable immediately after workflow completion
- Structured storage per workflow_run_id
- Used by SDK for testing and debugging
- Separate table from workflow events
- **Retention: 10 days** (deleted after 10 days, not archived)

**Secondary storage: Analytics Engine (optional)**

- Aggregate metrics and dashboards
- Performance trends over time
- Not used for individual workflow debugging

**Events Service expands to handle trace events:**

```sql
-- services/events/schema.sql

-- Existing workflow events table
CREATE TABLE workflow_events (
  id TEXT PRIMARY KEY,

  -- Ordering & timing
  timestamp INTEGER NOT NULL,
  sequence_number INTEGER NOT NULL,

  -- Event classification
  event_type TEXT NOT NULL,      -- 'workflow_started', 'token_spawned', 'node_completed', etc.

  -- Execution context
  workflow_run_id TEXT NOT NULL,
  parent_run_id TEXT,
  workflow_def_id TEXT NOT NULL,
  node_id TEXT,
  token_id TEXT,
  path_id TEXT,

  -- Tenant context
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,

  -- Cost tracking
  tokens INTEGER,                -- LLM token count
  cost_usd REAL,                 -- USD cost

  -- Payload
  message TEXT,
  metadata TEXT NOT NULL,        -- JSON blob (event-specific data)

  -- Indexes for common query patterns
  INDEX idx_workflow_events_run_sequence (workflow_run_id, sequence_number),
  INDEX idx_workflow_events_workspace (workspace_id),
  INDEX idx_workflow_events_project (project_id),
  INDEX idx_workflow_events_type (event_type),
  INDEX idx_workflow_events_timestamp (timestamp),
  INDEX idx_workflow_events_node (node_id),
  INDEX idx_workflow_events_token (token_id)
);

-- NEW: Trace events table
CREATE TABLE trace_events (
  id TEXT PRIMARY KEY,

  -- Ordering & timing
  sequence INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,

  -- Event classification
  type TEXT NOT NULL,        -- 'decision.routing.start', 'operation.context.read', etc.
  category TEXT NOT NULL,    -- 'decision', 'operation', 'dispatch', 'sql'

  -- Execution context (enables deep querying)
  workflow_run_id TEXT NOT NULL,
  token_id TEXT,             -- Most events relate to specific token
  node_id TEXT,              -- Many events happen at specific node

  -- Tenant context (multi-workspace isolation & billing attribution)
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,

  -- Performance tracking
  duration_ms REAL,          -- For SQL queries, operation timing

  -- Payload (structured data specific to event type)
  payload TEXT NOT NULL,     -- JSON blob with type-specific data

  -- Indexes for common query patterns
  INDEX idx_trace_events_workflow_sequence (workflow_run_id, sequence),
  INDEX idx_trace_events_type (type),
  INDEX idx_trace_events_category (category),
  INDEX idx_trace_events_token (token_id),
  INDEX idx_trace_events_workspace (workspace_id, timestamp),
  INDEX idx_trace_events_duration (duration_ms)
);
```

## Schema Design

### Promoted Fields vs Payload

**Promoted to columns** (frequently queried, indexed):

- `category` - Fast filtering by layer (decision/operation/dispatch/sql) without parsing `type`
- `token_id`, `node_id` - Execution path tracing without JSON parsing
- `workspace_id`, `project_id` - Tenant isolation and billing attribution
- `duration_ms` - Performance monitoring and alerting

**Stays in payload** (event-specific, rarely queried standalone):

- `transition_id`, `condition`, `spawn_count` (routing events)
- `path`, `value` (context operations)
- `table_name` (branch table events)
- `sql`, `params` (SQL query events)
- `strategy`, `sibling_count` (synchronization events)
- `decision_count`, `batch_type` (dispatch events)

### Query Examples

```sql
-- All trace events for a workflow (ordered execution trace)
SELECT * FROM trace_events
WHERE workflow_run_id = ?
ORDER BY sequence;

-- SQL performance issues in workspace
SELECT type, COUNT(*) as count, AVG(duration_ms) as avg_duration
FROM trace_events
WHERE workspace_id = ?
  AND category = 'sql'
  AND duration_ms > 50
GROUP BY type
ORDER BY avg_duration DESC;

-- Token execution trace (debug specific branch)
SELECT sequence, type, node_id, duration_ms, payload
FROM trace_events
WHERE token_id = ?
ORDER BY sequence;

-- Decision layer events only (routing and synchronization logic)
SELECT * FROM trace_events
WHERE workflow_run_id = ?
  AND category = 'decision'
ORDER BY sequence;

-- Slow operations across project (performance dashboard)
SELECT type, AVG(duration_ms) as avg_duration, MAX(duration_ms) as max_duration
FROM trace_events
WHERE project_id = ?
  AND duration_ms IS NOT NULL
  AND timestamp > ?  -- Last 24 hours
GROUP BY type
HAVING avg_duration > 10
ORDER BY avg_duration DESC;

-- Find workflows with slow SQL queries
SELECT workflow_run_id, COUNT(*) as slow_query_count
FROM trace_events
WHERE workspace_id = ?
  AND category = 'sql'
  AND duration_ms > 100
GROUP BY workflow_run_id
ORDER BY slow_query_count DESC
LIMIT 10;
```

## Strategy: Event-Driven Tracing

**Key principle:** Trace events are data, not logs. They're emitted via RPC to the Events service immediately, with no client-side batching.

**Benefits:**

- Zero impact on code clarity
- Opt-in per workflow run (via option flag)
- Structured and queryable
- No batching complexity - RPC handles thousands of calls per second
- Time-travel debugging (replay production events)
- Performance profiling (SQL timing)
- No lost events on crash (immediate RPC delivery)

## Event Types

```typescript
// coordinator/src/events.ts

export type TraceEvent =
  // Decision layer
  | { type: 'decision.routing.start'; token_id: string; node_id: string }
  | { type: 'decision.routing.evaluate_transition'; transition_id: string; condition: any }
  | { type: 'decision.routing.transition_matched'; transition_id: string; spawn_count: number }
  | { type: 'decision.routing.complete'; decisions: Decision[] }
  | { type: 'decision.sync.start'; token_id: string; sibling_count: number }
  | { type: 'decision.sync.check_condition'; strategy: string; completed: number; required: number }
  | { type: 'decision.sync.wait'; reason: string }
  | { type: 'decision.sync.activate'; merge_config: any }

  // Context operations
  | { type: 'operation.context.read'; path: string; value: unknown }
  | { type: 'operation.context.write'; path: string; value: unknown }
  | { type: 'operation.context.branch_table.create'; token_id: string; table_name: string }
  | { type: 'operation.context.branch_table.drop'; table_name: string }
  | { type: 'operation.context.merge.start'; sibling_count: number; strategy: string }
  | { type: 'operation.context.merge.complete'; rows_written: number }

  // Token operations
  | {
      type: 'operation.tokens.create';
      token_id: string;
      node_id: string;
      parent_token_id: string | null;
    }
  | { type: 'operation.tokens.update_status'; token_id: string; from: string; to: string }

  // SQL operations
  | { type: 'operation.sql.query'; sql: string; params: any[]; duration_ms: number }

  // Dispatch layer
  | { type: 'dispatch.batch.start'; decision_count: number }
  | { type: 'dispatch.batch.group'; batch_type: string; count: number }
  | { type: 'dispatch.decision.apply'; decision_type: string; decision: Decision };
```

## Event Emitter

Use the `createEmitter` function from `@wonder/events/client`:

```typescript
// services/events/src/client.ts

import { createEmitter } from '@wonder/events/client';

// In coordinator constructor
const emitter = createEmitter(
  env.EVENTS, // Events service binding
  {
    workflow_run_id: this.workflowRunId,
    workspace_id: workflow.workspace_id,
    project_id: workflow.project_id,
    workflow_def_id: workflow.workflow_def_id,
  },
  { traceEnabled: env.TRACE_EVENTS_ENABLED === 'true' },
);

// Emit workflow events
emitter.emit({
  event_type: 'node_started',
  node_id: 'node_123',
});

// Emit trace events
emitter.emitTrace({
  type: 'decision.routing.start',
  token_id: 'tok_123',
  node_id: 'node_123',
});
```

The emitter:

- Tracks sequence numbers internally
- Calls Events service RPC immediately (no batching)
- Handles all entry construction (id, timestamp, category)
- Opt-in via `traceEnabled` flag

## Instrumenting Decision Functions

Decision functions stay pure - they return events alongside decisions:

```typescript
// decisions/routing.ts

export function decide(
  token: TokenRow,
  workflow: WorkflowDef,
  context: ContextSnapshot,
): { decisions: Decision[]; events: TraceEvent[] } {
  const events: TraceEvent[] = [];

  events.push({
    type: 'decision.routing.start',
    token_id: token.id,
    node_id: token.node_id,
  });

  const outgoing = workflow.transitions.filter((t) => t.from_node_id === token.node_id);
  const matches: TransitionDef[] = [];

  for (const transition of outgoing) {
    events.push({
      type: 'decision.routing.evaluate_transition',
      transition_id: transition.id,
      condition: transition.condition,
    });

    if (evaluateCondition(transition.condition, context)) {
      events.push({
        type: 'decision.routing.transition_matched',
        transition_id: transition.id,
        spawn_count: transition.spawn_count ?? 1,
      });
      matches.push(transition);
    }
  }

  const decisions = matches.flatMap((t) => generateDecisions(t, token));

  events.push({
    type: 'decision.routing.complete',
    decisions: decisions,
  });

  return { decisions, events };
}
```

## Instrumenting Operations

Operations emit events through the emitter:

````typescript
// operations/context.ts

export function createContextOperations(sql: SqlStorage, emitter: TraceEmitter) {
  return {
    get(path: string): unknown {
      const value = getRaw(sql, path);
      emitter.emit({
        type: 'operation.context.read',
        path,
        value,
      });
      return value;
    },

    set(path: string, value: unknown): void {
      emitter.emit({
        type: 'operation.context.write',
## Instrumenting Operations

Operations emit trace events through the emitter:

```typescript
// operations/context.ts

export function createContextOperations(sql: SqlStorage, emitter: Emitter) {
  return {
    get(path: string): unknown {
      const value = getRaw(sql, path);
      emitter.emitTrace({
        type: 'operation.context.read',
        path,
        value,
      });
      return value;
    },

    set(path: string, value: unknown): void {
      emitter.emitTrace({
        type: 'operation.context.write',
        path,
        value,
      });
      setRaw(sql, path, value);
    },

    initializeBranchTable(tokenId: string, schema: JSONSchema): void {
      const tableName = `branch_output_${tokenId}`;
      emitter.emitTrace({
        type: 'operation.context.branch_table.create',
        token_id: tokenId,
        table_name: tableName,
      });
      initializeBranchTableRaw(sql, tokenId, schema);
    },

    dropBranchTables(tokenIds: string[]): void {
      for (const tokenId of tokenIds) {
        const tableName = `branch_output_${tokenId}`;
        emitter.emitTrace({
          type: 'operation.context.branch_table.drop',
          table_name: tableName,
        });
## SQL Query Instrumentation

Emit trace events for SQL queries to track performance:

```typescript
// operations/sql.ts

export function createInstrumentedSQL(sql: SqlStorage, emitter: Emitter): SqlStorage {
  return {
    exec(query: string, params?: any[]): any {
      const start = performance.now();
      const result = sql.exec(query, params);
      const duration = performance.now() - start;

      emitter.emitTrace({
        type: 'operation.sql.query',
        sql: query,
        params: params ?? [],
        duration_ms: duration,
      });

      return result;
    },
  };
}
````

## Coordinator Integration

```typescript
// coordinator/src/index.ts

import { createEmitter } from '@wonder/events/client';
import type { Emitter } from '@wonder/events/types';
import { createInstrumentedSQL } from './operations/sql.js';

class WorkflowCoordinator extends DurableObject {
  private emitter: Emitter;
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize emitter with context bound at creation
    this.emitter = createEmitter(
      env.EVENTS,
      {
        workflow_run_id: this.workflowRunId,
        workspace_id: workflow.workspace_id,
        project_id: workflow.project_id,
        workflow_def_id: workflow.workflow_def_id,
      },
      { traceEnabled: env.TRACE_EVENTS_ENABLED === 'true' },
    );

    // Optionally wrap SQL with instrumentation
    this.sql = env.TRACE_EVENTS_ENABLED
      ? createInstrumentedSQL(this.ctx.storage.sql, this.emitter)
      : this.ctx.storage.sql;
  }

  async handleTaskResult(tokenId: string, result: TaskResult) {
    // Update token status
    operations.tokens.updateStatus(this.sql, tokenId, 'completed');

    // Load state
    const token = operations.tokens.get(this.sql, tokenId);
    const workflow = await this.getWorkflow(token.workflow_run_id);
    const context = operations.context.getSnapshot(this.sql);

    // Run decision logic (returns decisions + events)
    const { decisions, events } = routing.decide(token, workflow, context);

    // Emit trace events from decision functions
    for (const event of events) {
      this.emitter.emitTrace(event);
    }

    // Dispatch decisions
    const tokensToDispatch = await dispatch.applyDecisions(
      decisions,
      this.sql,
      this.env,
      this.emitter, // Pass emitter to dispatch layer
    );

    // Dispatch tokens
    await Promise.all(tokensToDispatch.map((id) => this.dispatchToken(id)));

    // No flush needed - events sent via RPC immediately
  }

  async finalizeWorkflow(workflowRunId: string, finalOutput: any) {
    // ... finalization logic
    // No flush needed - all events already sent via RPC
  }
}
```

## Testing with Trace Events

### Enable Trace Events

```typescript
// Enable via header for specific workflow run
const { data } = await client.POST('/api/workflows/{id}/start', {
  params: { path: { id: workflowId } },
  body: {},
  headers: {
    'X-Trace-Events-Enabled': 'true',
  },
});

// Or via env var (all workflows in environment)
env.TRACE_EVENTS_ENABLED = 'true';
```

### Trace Full Execution Path

```typescript
test('trace full execution path', async () => {
  const sdk = createSDK({ baseUrl: DEPLOYED_URL });

  // Start with trace events enabled
  const { workflow_run_id } = await sdk.workflows.start(
    workflow_id,
    {},
    {
      headers: { 'X-Trace-Events': 'true' },
    },
  );

  // Wait for completion
  await waitForCompletion(workflow_run_id);

  // Fetch trace events via HTTP service
  const events = await sdk.traceEvents.getEvents(workflow_run_id);

  // Verify execution path
  expect(events).toContainEqual({
    type: 'decision.routing.start',
    token_id: expect.any(String),
    node_id: 'start_node',
  });

  expect(events).toContainEqual({
    type: 'decision.routing.transition_matched',
    transition_id: expect.any(String),
    spawn_count: 10,
  });

  // Verify branch table lifecycle
  const branchCreateEvents = events.filter(
    (e) => e.type === 'operation.context.branch_table.create',
  );
  expect(branchCreateEvents).toHaveLength(10); // 10 branches created

  const branchDropEvents = events.filter((e) => e.type === 'operation.context.branch_table.drop');
  expect(branchDropEvents).toHaveLength(10); // All cleaned up
});
```

### Verify Decision Flow

```typescript
test('verify synchronization decision flow', async () => {
  const { data } = await client.POST('/api/workflows/{id}/start', {
    params: { path: { id: workflowId } },
    body: {},
    headers: { 'X-Introspection-Enabled': 'true' },
  });
  const workflowRunId = data!.workflow_run_id;

  await waitForCompletion(workflowRunId);

  const events = await client.introspection.getEvents(workflowRunId); // Find synchronization check
  const syncStart = events.find((e) => e.type === 'decision.sync.start');
  expect(syncStart).toBeDefined();
  expect(syncStart.sibling_count).toBe(10);

  // Should check condition
  const conditionCheck = events.find((e) => e.type === 'decision.sync.check_condition');
  expect(conditionCheck).toMatchObject({
    strategy: 'all',
    completed: 10,
    required: 10,
  });

  // Should activate (not wait)
  expect(events).toContainEqual({
    type: 'decision.sync.activate',
    merge_config: expect.any(Object),
  });

  expect(events).not.toContainEqual({
    type: 'decision.sync.wait',
  });
});
```

### Performance Profiling

```typescript
test('identify slow SQL queries', async () => {
  const { data } = await client.POST('/api/workflows/{id}/start', {
    params: { path: { id: workflowId } },
    body: {},
    headers: { 'X-Trace-Events-Enabled': 'true' },
  });
  const workflowRunId = data!.workflow_run_id;

  await waitForCompletion(workflowRunId);

  const events = await client.traceEvents.getEvents(workflowRunId); // Find slow queries
  const sqlEvents = events.filter((e) => e.type === 'operation.sql.query');
  const slowQueries = sqlEvents.filter((e) => e.duration_ms > 10);

  if (slowQueries.length > 0) {
    console.warn(
      'Slow queries detected:',
      slowQueries.map((q) => ({
        sql: q.sql,
        duration: q.duration_ms,
        params: q.params,
      })),
    );
  }

  // Verify no queries exceed threshold
  expect(slowQueries.filter((q) => q.duration_ms > 50)).toHaveLength(0);
});
```

### Debug Production Issues

```typescript
test('replay production failure', async () => {
  // Load events from production Analytics Engine
  const prodEvents = await fetchProductionEvents(prod_workflow_run_id);

  // Analyze event sequence
  const routingEvents = prodEvents.filter((e) => e.type.startsWith('decision.routing'));

  // Find where routing went wrong
  const transitionMatches = routingEvents.filter(
    (e) => e.type === 'decision.routing.transition_matched',
  );

  // Expected 1 match, got 0 - condition evaluation failed
  expect(transitionMatches).toHaveLength(0);

  // Find condition evaluation
  const evalEvents = routingEvents.filter((e) => e.type === 'decision.routing.evaluate_transition');

  console.log('Evaluated transitions:', evalEvents);

  // Find context at time of decision
  const contextReads = prodEvents.filter(
    (e) => e.type === 'operation.context.read' && e.timestamp < routingEvents[0].timestamp,
  );

  console.log('Context state:', contextReads);

  // Now we can reproduce locally with exact same state
  const reproDecisions = routing.decide(
    reconstructToken(prodEvents),
    reconstructWorkflow(prodEvents),
    reconstructContext(contextReads),
  );

  // Verify fix
  expect(reproDecisions.decisions).toContainEqual(
    expect.objectContaining({ type: 'CREATE_TOKEN' }),
  );
});
```

### Verify Branch Isolation

```typescript
test('branch tables created and cleaned up correctly', async () => {
  const { data } = await client.POST('/api/workflows/{id}/start', {
    params: { path: { id: workflowId } },
    body: {},
    headers: { 'X-Trace-Events-Enabled': 'true' },
  });
  const workflowRunId = data!.workflow_run_id;

  await waitForCompletion(workflowRunId);

  const events = await client.traceEvents.getEvents(workflowRunId); // Get all branch table operations
  const branchOps = events.filter(
    (e) =>
      e.type === 'operation.context.branch_table.create' ||
      e.type === 'operation.context.branch_table.drop',
  );

  // Group by table name
  const tableOps = new Map<string, { created: boolean; dropped: boolean }>();

  for (const op of branchOps) {
    const name = op.table_name;
    if (!tableOps.has(name)) {
      tableOps.set(name, { created: false, dropped: false });
    }

    if (op.type === 'operation.context.branch_table.create') {
      tableOps.get(name)!.created = true;
    } else {
      tableOps.get(name)!.dropped = true;
    }
  }

  // All created tables should be dropped
  for (const [name, ops] of tableOps) {
    expect(ops.created).toBe(true);
    expect(ops.dropped).toBe(true);
  }
});
```

## Events Service RPC Methods

The Events Service expands to handle trace events via RPC:

```typescript
// services/events/src/index.ts

export class EventsService extends WorkerEntrypoint<Env> {
  private db = drizzle(this.env.DB);

  /**
   * RPC method - writes trace events to D1
   */
  writeTraceEvents(batch: TraceEventEntry[]): void {
    this.ctx.waitUntil(
      (async () => {
        try {
          await this.db.insert(traceEvents).values(batch);
        } catch (error) {
          console.error('[EVENTS] Failed to insert trace events:', error);
        }
      })(),
    );
  }

  /**
   * RPC method - retrieves trace events from D1
   */
  async getTraceEvents(options: GetTraceEventsOptions = {}) {
    const conditions = [];

    if (options.workflow_run_id)
      conditions.push(eq(traceEvents.workflow_run_id, options.workflow_run_id));
    if (options.token_id)
      conditions.push(eq(traceEvents.token_id, options.token_id));
    if (options.node_id)
      conditions.push(eq(traceEvents.node_id, options.node_id));
    if (options.type)
      conditions.push(eq(traceEvents.type, options.type));
    if (options.category)
      conditions.push(eq(traceEvents.category, options.category));
    if (options.workspace_id)
      conditions.push(eq(traceEvents.workspace_id, options.workspace_id));
    if (options.project_id)
      conditions.push(eq(traceEvents.project_id, options.project_id));
    if (options.min_duration_ms)
      conditions.push(gte(traceEvents.duration_ms, options.min_duration_ms));

    const limit = options.limit || 1000;

    const results = await this.db
      .select()
      .from(traceEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(traceEvents.sequence)
      .limit(limit);

    return results.map((row) => ({
        ...row,
        payload: JSON.parse(row.payload as string) as TraceEvent,
      })),
    };
  }
}
```

## SDK Integration

The SDK provides trace event methods that call the HTTP service:

```typescript
// packages/sdk/src/client.ts

export function createWonderClient(options: { baseUrl: string }) {
  const client = createClient<paths>({ baseUrl: options.baseUrl });

  return {
    ...client,

    // Trace event methods (HTTP service endpoints)
    traceEvents: {
      async getEvents(workflowRunId: string): Promise<TraceEvent[]> {
        const response = await fetch(
          `${options.baseUrl}/api/trace-events?workflow_run_id=${workflowRunId}`,
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch trace events: ${response.statusText}`);
        }

        const data = (await response.json()) as { events: Array<{ payload: TraceEvent }> };
        return data.events.map((e) => e.payload);
      },

      async filterEvents(
        workflowRunId: string,
        predicate: (event: TraceEvent) => boolean,
      ): Promise<TraceEvent[]> {
        const events = await this.getEvents(workflowRunId);
        return events.filter(predicate);
      },

      async waitForEvent(
        workflowRunId: string,
        predicate: (event: TraceEvent) => boolean,
        options?: { timeout?: number; pollInterval?: number },
      ): Promise<TraceEvent> {
        const timeout = options?.timeout ?? 30000;
        const pollInterval = options?.pollInterval ?? 500;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
          const events = await this.getEvents(workflowRunId);
          const found = events.find(predicate);
          if (found) return found;

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Timeout waiting for trace event after ${timeout}ms`);
      },
    },
  };
}
```

## Production Usage

### Events Service Storage

Trace events are stored in the Events Service D1 database via RPC and queried through the HTTP service:

```typescript
// Query events for a workflow run via SDK (calls HTTP service → RPC → Events service)
const events = await sdk.traceEvents.getEvents(workflow_run_id);

// Or direct HTTP call to HTTP service (which calls Events service via RPC)
const response = await fetch(`${HTTP_URL}/api/trace-events?workflow_run_id=${workflow_run_id}`);
const { events } = await response.json();
```

### Performance Monitoring

Create dashboards for:

- Average SQL query duration per workflow
- Slow queries (> 50ms)
- Branch table creation/drop counts
- Decision evaluation time
- Token lifecycle metrics

### Alerting

Set up alerts for:

- Queries exceeding 100ms
- Branch tables not cleaned up
- Excessive decision retries
- Unexpected event sequences

## Best Practices

**Enable selectively** - Not every workflow needs trace events. Enable for:

- Complex workflows being debugged

## Best Practices

**Enable selectively** - Not every workflow needs trace events. Enable for:

- Complex workflows being debugged
- Performance profiling sessions
- Production issue reproduction
- New feature validation

**No batching needed** - Events are sent via RPC immediately:

- RPC handles 1,000+ req/sec per DO (soft limit)
- Each trace event is ~1KB serialized
- Events service batches writes to D1 internally
- No memory buildup, no lost events on crash

**Event granularity** - Balance detail vs overhead:
**Event retention** - Analytics Engine 30-day default:

- Keep hot data in Analytics Engine
- Archive to R2 for long-term analysis
- Delete after 90 days unless incident-related

**Privacy** - Be careful with sensitive data:

- Don't emit PII in context values
- Hash user IDs in events
- Redact secrets and credentials

## Comparison with Logging

| Aspect        | Trace Events          | Traditional Logs  |
| ------------- | --------------------- | ----------------- |
| **Structure** | Typed, queryable data | Unstructured text |

## Comparison with Logging

| Aspect          | Trace Events               | Traditional Logs             |
| --------------- | -------------------------- | ---------------------------- |
| **Structure**   | Typed, queryable data      | Unstructured text            |
| **Performance** | Immediate RPC, async write | Inline, blocks execution     |
| **Storage**     | D1 (Events service)        | Log files / services         |
| **Querying**    | SQL over structured data   | grep / log search            |
| **Cost**        | Low (D1 included)          | High (log ingestion)         |
| **Code Impact** | Zero (separate channel)    | High (scattered console.log) |
| **Testability** | Events are assertions      | Parse log strings            |
| **Production**  | Safe (opt-in)              | Always on, fills storage     |
| **Delivery**    | Immediate via RPC          | Batched or buffered          |
| **Reliability** | No lost events on DO crash | Can lose buffered logs       |

Trace events are **data** designed for analysis. Logs are **text** designed for debugging. Both serve different purposes.
