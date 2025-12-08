# Introspection

Introspection provides line-by-line visibility into coordinator execution without cluttering code with logs. Events are structured data that flow through a separate observability channel.

**Introspection replaces logging for normal coordinator operations.** Execution traces, performance metrics, state changes, and debugging information are captured as introspection events. The coordinator only logs critical failures - errors indicating the coordinator itself is broken, not workflow execution issues.

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

**Events Service expands to handle introspection:**

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

-- NEW: Introspection events table
CREATE TABLE introspection_events (
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
  INDEX idx_introspection_workflow_sequence (workflow_run_id, sequence),
  INDEX idx_introspection_type (type),
  INDEX idx_introspection_category (category),
  INDEX idx_introspection_token (token_id),
  INDEX idx_introspection_workspace (workspace_id, timestamp),
  INDEX idx_introspection_duration (duration_ms)
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
-- All introspection events for a workflow (ordered execution trace)
SELECT * FROM introspection_events
WHERE workflow_run_id = ?
ORDER BY sequence;

-- SQL performance issues in workspace
SELECT type, COUNT(*) as count, AVG(duration_ms) as avg_duration
FROM introspection_events
WHERE workspace_id = ?
  AND category = 'sql'
  AND duration_ms > 50
GROUP BY type
ORDER BY avg_duration DESC;

-- Token execution trace (debug specific branch)
SELECT sequence, type, node_id, duration_ms, payload
FROM introspection_events
WHERE token_id = ?
ORDER BY sequence;

-- Decision layer events only (routing and synchronization logic)
SELECT * FROM introspection_events
WHERE workflow_run_id = ?
  AND category = 'decision'
ORDER BY sequence;

-- Slow operations across project (performance dashboard)
SELECT type, AVG(duration_ms) as avg_duration, MAX(duration_ms) as max_duration
FROM introspection_events
WHERE project_id = ?
  AND duration_ms IS NOT NULL
  AND timestamp > ?  -- Last 24 hours
GROUP BY type
HAVING avg_duration > 10
ORDER BY avg_duration DESC;

-- Find workflows with slow SQL queries
SELECT workflow_run_id, COUNT(*) as slow_query_count
FROM introspection_events
WHERE workspace_id = ?
  AND category = 'sql'
  AND duration_ms > 100
GROUP BY workflow_run_id
ORDER BY slow_query_count DESC
LIMIT 10;
```

## Strategy: Event-Driven Introspection

**Key principle:** Events are data, not logs. They're emitted by pure functions, collected by the coordinator, and stored separately for analysis.

**Benefits:**

- Zero impact on code clarity
- Opt-in per workflow run (via header or env var)
- Structured and queryable
- Production-safe (Analytics Engine, not logs)
- Time-travel debugging (replay production events)
- Performance profiling (SQL timing)

## Event Types

```typescript
// coordinator/src/events.ts

export type IntrospectionEvent =
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

```typescript
// coordinator/src/events.ts

export class IntrospectionEmitter {
  private events: IntrospectionEvent[] = [];
  private enabled: boolean;
  private workflowRunId: string;

  constructor(workflowRunId: string, env: Env) {
    this.workflowRunId = workflowRunId;
    // Enable introspection via header or env var
    this.enabled = env.INTROSPECTION_ENABLED === 'true';
  }

  emit(event: IntrospectionEvent): void {
    if (!this.enabled) return;

    this.events.push({
      ...event,
      timestamp: Date.now(),
      sequence: this.events.length,
    });
  }

  async flush(env: Env, context: { workspace_id: string; project_id: string }): Promise<void> {
    if (this.events.length === 0) return;

    const batch = this.events.map((event) => ({
      id: crypto.randomUUID(),
      workflow_run_id: this.workflowRunId,
      sequence: event.sequence,
      timestamp: event.timestamp,
      type: event.type,
      category: event.type.split('.')[0], // Extract 'decision', 'operation', 'dispatch', 'sql'
      token_id: event.token_id ?? null,
      node_id: event.node_id ?? null,
      workspace_id: context.workspace_id,
      project_id: context.project_id,
      duration_ms: event.duration_ms ?? null,
      payload: JSON.stringify(event),
    }));

    // Write to Events Service (D1) for immediate querying
    const response = await fetch(`${env.EVENTS_URL}/introspection/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      console.error('Failed to write introspection events:', await response.text());
    }

    // Optional: Also write to Analytics Engine for dashboards
    if (env.ANALYTICS) {
      await env.ANALYTICS.writeDataPoint({
        blobs: [JSON.stringify(this.events)],
        indexes: [this.workflowRunId],
      });
    }

    this.events = [];
  } // For testing: return events instead of flushing
  getEvents(): IntrospectionEvent[] {
    return [...this.events];
  }
}
```

## Instrumenting Decision Functions

Decision functions stay pure - they return events alongside decisions:

```typescript
// decisions/routing.ts

export function decide(
  token: TokenRow,
  workflow: WorkflowDef,
  context: ContextSnapshot,
): { decisions: Decision[]; events: IntrospectionEvent[] } {
  const events: IntrospectionEvent[] = [];

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

```typescript
// operations/context.ts

export function createContextOperations(sql: SqlStorage, emitter: IntrospectionEmitter) {
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
        path,
        value,
      });
      setRaw(sql, path, value);
    },

    initializeBranchTable(tokenId: string, schema: JSONSchema): void {
      const tableName = `branch_output_${tokenId}`;
      emitter.emit({
        type: 'operation.context.branch_table.create',
        token_id: tokenId,
        table_name: tableName,
      });
      initializeBranchTableRaw(sql, tokenId, schema);
    },

    dropBranchTables(tokenIds: string[]): void {
      for (const tokenId of tokenIds) {
        const tableName = `branch_output_${tokenId}`;
        emitter.emit({
          type: 'operation.context.branch_table.drop',
          table_name: tableName,
        });
      }
      dropBranchTablesRaw(sql, tokenIds);
    },

    mergeBranches(siblings: TokenRow[], mergeConfig: MergeConfig, schema: JSONSchema): void {
      emitter.emit({
        type: 'operation.context.merge.start',
        sibling_count: siblings.length,
        strategy: mergeConfig.strategy,
      });

      const rowsWritten = mergeBranchesRaw(sql, siblings, mergeConfig, schema);

      emitter.emit({
        type: 'operation.context.merge.complete',
        rows_written: rowsWritten,
      });
    },
  };
}
```

## SQL Query Interceptor

Wrap SQL storage to capture all queries:

```typescript
// operations/sql.ts

export function createInstrumentedSQL(sql: SqlStorage, emitter: IntrospectionEmitter): SqlStorage {
  return {
    exec(query: string, params?: any[]): any {
      const start = performance.now();
      const result = sql.exec(query, params);
      const duration = performance.now() - start;

      emitter.emit({
        type: 'operation.sql.query',
        sql: query,
        params: params ?? [],
        duration_ms: duration,
      });

      return result;
    },
  };
}
```

## Coordinator Integration

```typescript
// coordinator/src/index.ts

class WorkflowCoordinator extends DurableObject {
  private emitter: IntrospectionEmitter;
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize emitter
    this.emitter = new IntrospectionEmitter(this.workflowRunId, env);

    // Wrap SQL with instrumentation
    this.sql = createInstrumentedSQL(this.ctx.storage.sql, this.emitter);
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

    // Collect events from decision functions
    for (const event of events) {
      this.emitter.emit(event);
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

    // Flush events periodically
    if (this.emitter.getEvents().length > 100) {
      await this.emitter.flush(this.env, {
        workspace_id: workflow.workspace_id,
        project_id: workflow.project_id,
      });
    }
  }

  async finalizeWorkflow(workflowRunId: string, finalOutput: any) {
    // ... finalization logic

    // Flush remaining events on completion
    const workflow = await this.getWorkflow(workflowRunId);
    await this.emitter.flush(this.env, {
      workspace_id: workflow.workspace_id,
      project_id: workflow.project_id,
    });
  }

  // For testing: expose events
  async getIntrospectionEvents(): Promise<IntrospectionEvent[]> {
    return this.emitter.getEvents();
  }
}
```

## Testing with Introspection

### Enable Introspection

```typescript
// Enable via header for specific workflow run
const { data } = await client.POST('/api/workflows/{id}/start', {
  params: { path: { id: workflowId } },
  body: {},
  headers: {
    'X-Introspection-Enabled': 'true',
  },
});

// Or via env var (all workflows in environment)
env.INTROSPECTION_ENABLED = 'true';
```

### Trace Full Execution Path

```typescript
test('trace full execution path', async () => {
  const sdk = createSDK({ baseUrl: DEPLOYED_URL });

  // Start with introspection enabled
  const { workflow_run_id } = await sdk.workflows.start(
    workflow_id,
    {},
    {
      headers: { 'X-Introspection': 'true' },
    },
  );

  // Wait for completion
  await waitForCompletion(workflow_run_id);

  // Fetch introspection events
  const coordinatorId = getCoordinatorId(workflow_run_id);
  const events = await sdk.rpc.coordinator(coordinatorId).getIntrospectionEvents();

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
    headers: { 'X-Introspection-Enabled': 'true' },
  });
  const workflowRunId = data!.workflow_run_id;

  await waitForCompletion(workflowRunId);

  const events = await client.introspection.getEvents(workflowRunId); // Find slow queries
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
    headers: { 'X-Introspection-Enabled': 'true' },
  });
  const workflowRunId = data!.workflow_run_id;

  await waitForCompletion(workflowRunId);

  const events = await client.introspection.getEvents(workflowRunId); // Get all branch table operations
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

## Events Service API

The Events Service expands to handle introspection events:

```typescript
// services/events/src/index.ts

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Existing workflow events endpoints
    if (url.pathname === '/events') {
      // ... existing code ...
    }

    // NEW: Introspection endpoints
    if (url.pathname === '/introspection/events') {
      const workflowRunId = url.searchParams.get('workflow_run_id');
      if (!workflowRunId) {
        return Response.json({ error: 'workflow_run_id required' }, { status: 400 });
      }

      const events = await env.DB.prepare(
        `
        SELECT * FROM introspection_events
        WHERE workflow_run_id = ?
        ORDER BY sequence ASC
      `,
      )
        .bind(workflowRunId)
        .all();

      return Response.json({
        events: events.results.map((row) => ({
          ...row,
          payload: JSON.parse(row.payload as string),
        })),
      });
    }

    if (url.pathname === '/introspection/write' && request.method === 'POST') {
      const batch: IntrospectionEventRow[] = await request.json();

      if (!Array.isArray(batch) || batch.length === 0) {
        return Response.json({ error: 'batch must be non-empty array' }, { status: 400 });
      }

      const stmt = env.DB.prepare(`
        INSERT INTO introspection_events (
          id, workflow_run_id, sequence, timestamp, type, category,
          token_id, node_id, workspace_id, project_id, duration_ms, payload
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      await env.DB.batch(
        batch.map((e) =>
          stmt.bind(
            e.id,
            e.workflow_run_id,
            e.sequence,
            e.timestamp,
            e.type,
            e.category,
            e.token_id,
            e.node_id,
            e.workspace_id,
            e.project_id,
            e.duration_ms,
            e.payload,
          ),
        ),
      );

      return Response.json({ success: true, count: batch.length });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};

interface IntrospectionEventRow {
  id: string;
  workflow_run_id: string;
  sequence: number;
  timestamp: number;
  type: string;
  category: string;
  token_id: string | null;
  node_id: string | null;
  workspace_id: string;
  project_id: string;
  duration_ms: number | null;
  payload: string; // JSON
}
```

## SDK Integration

The SDK provides introspection methods:

```typescript
// packages/sdk/src/client.ts

export function createWonderClient(options: { baseUrl: string }) {
  const client = createClient<paths>({ baseUrl: options.baseUrl });

  return {
    ...client,

    // Introspection methods
    introspection: {
      async getEvents(workflowRunId: string): Promise<IntrospectionEvent[]> {
        const response = await fetch(
          `${options.baseUrl}/events/introspection/events?workflow_run_id=${workflowRunId}`,
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch introspection events: ${response.statusText}`);
        }

        const data = (await response.json()) as { events: Array<{ payload: IntrospectionEvent }> };
        return data.events.map((e) => e.payload);
      },

      async filterEvents(
        workflowRunId: string,
        predicate: (event: IntrospectionEvent) => boolean,
      ): Promise<IntrospectionEvent[]> {
        const events = await this.getEvents(workflowRunId);
        return events.filter(predicate);
      },

      async waitForEvent(
        workflowRunId: string,
        predicate: (event: IntrospectionEvent) => boolean,
        options?: { timeout?: number; pollInterval?: number },
      ): Promise<IntrospectionEvent> {
        const timeout = options?.timeout ?? 30000;
        const pollInterval = options?.pollInterval ?? 500;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
          const events = await this.getEvents(workflowRunId);
          const found = events.find(predicate);
          if (found) return found;

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Timeout waiting for introspection event after ${timeout}ms`);
      },
    },
  };
}
```

## Production Usage

### Events Service Storage

Introspection events are stored in the Events Service D1 database and can be queried immediately:

```typescript
// Query events for a workflow run via SDK
const events = await sdk.introspection.getEvents(workflow_run_id);

// Or directly via Events Service API
const response = await fetch(
  `${EVENTS_URL}/introspection/events?workflow_run_id=${workflow_run_id}`,
);
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

**Enable selectively** - Not every workflow needs introspection. Enable for:

- Complex workflows being debugged
- Performance profiling sessions
- Production issue reproduction
- New feature validation

**Flush periodically** - Batch events and flush to Analytics Engine:

- Every 100 events
- Every 30 seconds
- On workflow completion
- Prevents memory buildup in DO

**Event granularity** - Balance detail vs overhead:

- Too much: Every variable read (noisy)
- Too little: Only major operations (miss issues)
- Just right: Decision boundaries, operations, SQL queries

**Event retention** - Analytics Engine 30-day default:

- Keep hot data in Analytics Engine
- Archive to R2 for long-term analysis
- Delete after 90 days unless incident-related

**Privacy** - Be careful with sensitive data:

- Don't emit PII in context values
- Hash user IDs in events
- Redact secrets and credentials

## Comparison with Logging

| Aspect          | Introspection Events             | Traditional Logs             |
| --------------- | -------------------------------- | ---------------------------- |
| **Structure**   | Typed, queryable data            | Unstructured text            |
| **Performance** | Batched, async flush             | Inline, blocks execution     |
| **Storage**     | Analytics Engine                 | Log files / services         |
| **Querying**    | SQL over structured data         | grep / log search            |
| **Cost**        | Low (Analytics Engine free tier) | High (log ingestion)         |
| **Code Impact** | Zero (separate channel)          | High (scattered console.log) |
| **Testability** | Events are assertions            | Parse log strings            |
| **Production**  | Safe (opt-in)                    | Always on, fills storage     |

Introspection events are **data** designed for analysis. Logs are **text** designed for debugging. Both serve different purposes.
