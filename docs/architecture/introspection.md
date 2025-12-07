# Introspection

Introspection provides line-by-line visibility into coordinator execution without cluttering code with logs. Events are structured data that flow through a separate observability channel.

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

  async flush(env: Env): Promise<void> {
    if (this.events.length === 0) return;

    // Send to Analytics Engine for analysis
    await env.ANALYTICS.writeDataPoint({
      blobs: [JSON.stringify(this.events)],
      indexes: [this.workflowRunId],
    });

    this.events = [];
  }

  // For testing: return events instead of flushing
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
      await this.emitter.flush(this.env);
    }
  }

  async finalizeWorkflow(workflowRunId: string, finalOutput: any) {
    // ... finalization logic

    // Flush remaining events on completion
    await this.emitter.flush(this.env);
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
// Enable via header
const { workflow_run_id } = await sdk.workflows.start(workflow_id, input, {
  headers: { 'X-Introspection': 'true' },
});

// Or via env var (all workflows)
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
  const { workflow_run_id } = await sdk.workflows.start(workflow_id, {});
  await waitForCompletion(workflow_run_id);

  const events = await getIntrospectionEvents(workflow_run_id);

  // Find synchronization check
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
  const { workflow_run_id } = await sdk.workflows.start(workflow_id, {});
  await waitForCompletion(workflow_run_id);

  const events = await getIntrospectionEvents(workflow_run_id);

  // Find slow queries
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
  const { workflow_run_id } = await sdk.workflows.start(workflow_id, {});
  await waitForCompletion(workflow_run_id);

  const events = await getIntrospectionEvents(workflow_run_id);

  // Get all branch table operations
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

## Production Usage

### Analytics Engine Storage

Events are written to Analytics Engine for efficient storage and querying:

```typescript
// Query events for a workflow run
const events = await env.ANALYTICS.query(`
  SELECT * FROM introspection_events
  WHERE workflow_run_id = '${workflow_run_id}'
  ORDER BY timestamp ASC
`);
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
