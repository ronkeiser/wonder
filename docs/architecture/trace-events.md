# Trace Events

Trace events are structured observability data that make every workflow execution transparent and debuggable. They replace traditional logging for normal operations.

## Philosophy

**Trace events are data, not logs.**

- Structured, typed, queryable
- Designed for analysis and testing
- Flow through a separate channel from workflow events
- Enable time-travel debugging and performance profiling

**Every operation must capture inputs AND outputs.**

This is the fundamental diagnostic principle. When an operation fails or produces unexpected results, the trace event must reveal WHY by showing:

- What went in (inputs, parameters, preconditions)
- What came out (outputs, results, state changes)

Example: If `operation.context.initialize` creates only 2 tables instead of 3, the event shows:

```typescript
{
  type: 'operation.context.initialize',
  has_input_schema: true,
  has_context_schema: false,  // ← Immediately reveals the problem
  table_count: 2,
  tables_created: ['workflow_input', 'workflow_state']
}
```

**Event patterns:**

- **Fast operations** (< 10ms): Single event with inputs + outputs
- **Slow/complex operations**: Entry event (inputs) + exit event (outputs)

## Separation from Logging

Coordinator uses two observability channels:

- **Trace events**: Normal operations (routing, context reads, token creation, SQL queries)
- **Logs**: Critical failures only (coordinator itself is broken, not workflow issues)

If you're tempted to add `console.log()`, you probably need a trace event instead.

## Storage Architecture

**Primary: Events Service (D1)**

- Queryable immediately after workflow completion
- Structured storage per `workflow_run_id`
- 10-day retention (deleted, not archived)
- Separate table from workflow events

**Secondary: Analytics Engine (optional)**

- Aggregate metrics and dashboards
- Performance trends over time
- Not for individual workflow debugging

## Schema Design

**Promoted fields** (indexed columns, frequently queried):

- `category` - Filter by layer (decision/operation/dispatch/sql) without parsing type
- `token_id`, `node_id` - Trace execution paths
- `workspace_id`, `project_id` - Tenant isolation and billing
- `duration_ms` - Performance monitoring

**Payload** (JSON blob, event-specific):

- Inputs: `has_input_schema`, `schema_type`, `source_path`, `task_id`
- Outputs: `table_count`, `tables_created`, `errors`, `rows_written`
- Context: `transition_id`, `condition`, `spawn_count`, `strategy`

## Event-Driven Delivery

**Immediate RPC, no batching:**

- Every trace event sent to Events service via RPC immediately
- No client-side batching or buffering
- No lost events on coordinator crash
- RPC handles 1,000+ req/sec per Durable Object

**Zero code impact:**

- Emitter tracks sequence numbers automatically
- Constructs all metadata (id, timestamp, category)
- Opt-in via flag, no performance penalty when disabled

## Decision Layer Purity

Decision functions stay pure - they return events alongside decisions:

```typescript
export function decide(
  token: TokenRow,
  workflow: WorkflowDef,
  context: ContextSnapshot,
): { decisions: Decision[]; events: TraceEvent[] } {
  const events: TraceEvent[] = [];

  events.push({ type: 'decision.routing.start', token_id: token.id, node_id: token.node_id });

  // ... decision logic ...

  events.push({ type: 'decision.routing.complete', decisions });

  return { decisions, events };
}
```

Coordinator emits the returned events - decision layer stays side-effect free.

## Testing Philosophy

**Trace events ARE the test assertions.**

Don't parse log strings. Query structured trace events and assert on them:

```typescript
test('context initialization creates all tables', async () => {
  const { workflow_run_id } = await sdk.workflows.start(workflow_id, {});
  await waitForCompletion(workflow_run_id);

  const events = await sdk.trace.events(workflow_run_id);
  const init = events.context.initialize();

  expect(init).toMatchObject({
    has_input_schema: true,
    has_context_schema: true,
    table_count: 3,
    tables_created: ['workflow_input', 'workflow_state', 'workflow_output'],
  });
});
```

Trace events enable:

- Execution path verification (which nodes executed, in what order)
- Branch isolation validation (tables created and dropped correctly)
- Performance profiling (slow SQL queries, decision timing)
- Production debugging (replay exact state from events)

## Event Categories

**Decision layer** - Pure routing and synchronization logic:

- `decision.routing.*` - Transition evaluation, token spawning
- `decision.sync.*` - Branch synchronization, merge activation

**Operation layer** - State mutations with diagnostic info:

- `operation.context.initialize` - Shows `has_input_schema`, `has_context_schema`, `tables_created`
- `operation.context.validate` - Shows `schema_type`, `errors` (first 5)
- `operation.context.merge.*` - Shows `source_path`, `target_path`
- `operation.tokens.create` - Shows `task_id` for correlation

**Dispatch layer** - Decision application:

- `dispatch.batch.*` - Grouping decisions for atomic application
- `dispatch.decision.apply` - Individual decision execution

**SQL layer** - Performance tracking:

- `operation.sql.query` - Shows `sql`, `params`, `duration_ms`

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
| **Reliability** | No lost events on crash    | Can lose buffered logs       |

## Best Practices

**Enable selectively:**

- Complex workflows being debugged
- Performance profiling sessions
- Production issue reproduction
- E2E test validation

**Design events for diagnosis:**

- Include inputs (what triggered the operation)
- Include outputs (what resulted from the operation)
- For failures, show WHY (missing schema, invalid data, exceeded limits)

**Keep payload focused:**

- Promoted fields for filtering/indexing
- Payload for event-specific details
- First N items only for arrays (e.g., first 5 errors)

**Query efficiently:**

- Filter on promoted fields (`category`, `token_id`, `workflow_run_id`)
- Use `duration_ms` for performance analysis
- Order by `sequence` for execution traces
