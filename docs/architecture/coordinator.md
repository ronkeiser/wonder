# Coordinator Architecture

The coordinator is a **Durable Object (Actor)** that manages the lifecycle of a single workflow run. All state lives in DO SQLite until workflow completion, when results are committed to RESOURCES.

## Architecture: Decision Pattern on Actor Model

Cloudflare Durable Objects implement the **Actor Model**:

- **Isolated state** (SQLite per DO)
- **Single-threaded execution** (no race conditions)
- **Message passing** (RPC between actors)

The coordinator enhances this with a **Decision Layer** where decision logic is pure (returns decisions as data) and execution converts decisions to actor messages (SQL/RPC). This enables:

- **Testability**: Decision logic tested without spinning up actors, SQL, or RPC
- **Debuggability**: Decisions are data - log them, replay them, inspect them
- **Performance**: Optimize decision execution (batching, caching) without touching business logic
- **Scalability**: Add features (CEL conditions, priority tiers) without breaking existing code

## Components

```
coordinator/src/
├── index.ts                    # DO class (Actor) - thin orchestrator
├── types.ts                    # Decision type definitions
├── events.ts                   # Event emission (workflow + introspection)
├── planning/                   # Pure logic - returns Decision[]
│   ├── routing.ts              # Transition evaluation
│   ├── synchronization.ts      # Fan-in logic
│   ├── branching.ts            # Branch control logic
│   ├── completion.ts           # Workflow finalization
│   └── conditions.ts           # Condition evaluation (CEL future)
├── operations/                 # Actor operations - SQL and RPC
│   ├── tokens.ts               # Token CRUD + queries
│   ├── context.ts              # Context CRUD + snapshots
│   ├── artifacts.ts            # Artifact staging
│   └── workflows.ts            # Load workflow defs (with caching)
└── dispatch/                   # Decision dispatch (convert to operations)
    ├── apply.ts                # Main decision dispatcher
    ├── batch.ts                # Decision batching optimization
    └── cache.ts                # DO-level caching
```

## Decision Types (types.ts)

Decisions are pure data describing state changes to make (converted to operations during dispatch):

```typescript
type Decision =
  // Token operations
  | { type: 'CREATE_TOKEN'; params: CreateTokenParams }
  | { type: 'CREATE_FAN_IN_TOKEN'; params: CreateFanInParams }
  | { type: 'UPDATE_TOKEN_STATUS'; tokenId: string; status: TokenStatus }
  | {
      type: 'ACTIVATE_FAN_IN_TOKEN';
      workflow_run_id: string;
      node_id: string;
      fanInPath: string;
    }
  | { type: 'MARK_FOR_DISPATCH'; tokenId: string }

  // Context operations
  | { type: 'SET_CONTEXT'; path: string; value: unknown }
  | {
      type: 'APPLY_NODE_OUTPUT';
      nodeRef: string;
      output: Record<string, unknown>;
      tokenId?: string;
    }

  // Synchronization (triggers recursive decision generation)
  | {
      type: 'CHECK_SYNCHRONIZATION';
      tokenId: string;
      transition: TransitionDef;
    }

  // Batched operations (optimization)
  | { type: 'BATCH_CREATE_TOKENS'; allParams: CreateTokenParams[] }
  | {
      type: 'BATCH_UPDATE_STATUS';
      updates: Array<{ tokenId: string; status: TokenStatus }>;
    };
```

## Planning Modules (Pure)

### planning/routing.ts

Evaluates transitions and determines next tokens.

**Signature:**

```typescript
function decide(
  completedToken: TokenRow,
  workflow: WorkflowDef,
  contextData: ContextSnapshot,
): Decision[];
```

**Does:**

1. Gets outgoing transitions from completed node
2. Evaluates conditions against context (CEL in future)
3. Groups by priority tier (sequential evaluation in future)
4. For each matching transition:
   - Determines spawn count (static or foreach)
   - Generates CREATE_TOKEN decisions with proper lineage
   - Generates CHECK_SYNCHRONIZATION or MARK_FOR_DISPATCH decisions

**Returns:** Array of decisions describing token creation and dispatch (pure data, no execution).

### planning/synchronization.ts

Handles fan-in logic and merge strategies.

**Signature:**

```typescript
function decide(
  token: TokenRow,
  transition: TransitionDef,
  siblings: TokenRow[],
  workflow: WorkflowDef,
): Decision[];
```

**Does:**

1. Resolves joins_transition ref to ID
2. Checks if token is in sibling group
3. Evaluates synchronization condition (any/all/m_of_n)
4. If not met: returns CREATE_FAN_IN_TOKEN decision (waiting)
5. If met: returns SET_CONTEXT (merge) + ACTIVATE_FAN_IN_TOKEN decisions

**Returns:** Array of decisions describing synchronization behavior (pure data, no execution).

**Pure helpers:**

- `evaluateSyncCondition(siblings, waitFor)` - Check if condition met
- `mergeOutputs(siblings, mergeConfig)` - Apply merge strategy (append, merge, keyed)
- `buildFanInPath(tokenPath)` - Compute stable fan-in path

### planning/completion.ts

Determines workflow completion and extracts final output.

**Signature:**

```typescript
function extractFinalOutput(
  workflow: WorkflowDef,
  contextData: ContextSnapshot,
): Record<string, unknown>;
```

**Does:**

1. Evaluates output_mapping against context
2. Handles branch collections (.\_branches paths)
3. Returns final output object

**Returns:** Final output for workflow run.

## Operations (Imperative)

### operations/tokens.ts

Direct SQL operations for token state.

```typescript
get(sql, tokenId) → TokenRow
create(sql, params) → tokenId
tryCreateFanIn(sql, params) → tokenId | null  // handles unique constraint
tryActivate(sql, workflowRunId, nodeId, path) → boolean  // atomic CAS
updateStatus(sql, tokenId, status) → void
getSiblings(sql, workflowRunId, fanOutTransitionId) → TokenRow[]
getActiveCount(sql, workflowRunId) → number
```

### operations/context.ts

Schema-driven SQL operations for workflow context and branch storage.

```typescript
initializeTable(sql) → void              // Create tables from schema DDL
initializeWithInput(sql, input) → void   // Populate initial context
initializeBranchTable(sql, tokenId, schema) → void  // Create branch output table
get(sql, path) → unknown                 // Read context value
set(sql, path, value) → void             // Write context value
applyNodeOutput(sql, tokenId, output, schema) → void  // Write to branch table
getSnapshot(sql) → ContextSnapshot       // Read-only view for decision logic
mergeBranches(sql, siblings, mergeConfig, schema) → void  // Merge at fan-in
dropBranchTables(sql, tokenIds) → void   // Cleanup after merge
```

See `branch-storage.md` for branch isolation design.

### operations/artifacts.ts

Artifact staging in DO SQLite.

```typescript
initializeTable(sql) → void
stage(sql, artifact) → void
getStaged(sql) → Artifact[]
commitAll(env, sql) → void  // writes to RESOURCES
```

### operations/workflows.ts

Load workflow definitions with caching.

```typescript
load(env, workflowRunId) → Promise<WorkflowDef>
// Caching handled in DO, not here
```

## Dispatch Layer

### dispatch/apply.ts

Dispatches decisions by converting them to operations (SQL mutations, RPC calls).

```typescript
async applyDecisions(
  decisions: Decision[],
  sql: SqlStorage,
  env: Env,
  logger: Logger,
): Promise<string[]>  // returns tokensToDispatch
```

**Does:**

1. Batches decisions (multiple CREATE_TOKEN → BATCH_CREATE_TOKENS)
2. Handles race conditions (tryCreateFanIn, tryActivate)
3. Handles CHECK_SYNCHRONIZATION recursively (loads state, calls decision function, applies sub-decisions)
4. Collects MARK_FOR_DISPATCH decisions into return value
5. Emits events after successful execution
6. Logs errors if execution fails

### dispatch/batch.ts

Decision batching optimizations.

```typescript
batchDecisions(decisions: Decision[]) → Decision[]
```

Groups consecutive CREATE_TOKEN decisions into BATCH_CREATE_TOKENS for single SQL transaction.

### dispatch/cache.ts

Actor-level caching utilities.

```typescript
// Workflow definitions cached per workflow_run_id (actor instance cache)
// Context snapshots cached and invalidated on SET_CONTEXT
// Avoids repeated SQL reads during decision execution
```

## Event Emission & Introspection

### events.ts

Handles event emission for observability and debugging. Emits two types of events:

**Workflow events** (always on):

- Business-level events: `workflow_started`, `node_completed`, `token_spawned`, etc.
- Used for audit trails, replay, and user-facing observability
- Written to Events Service (D1) for all workflow runs

**Introspection events** (opt-in):

- Debug-level events: `decision.routing.start`, `operation.sql.query`, `operation.context.read`, etc.
- High-volume, detailed execution traces for debugging coordinator internals
- Enabled via `X-Introspection-Enabled` header or env var
- Written to separate `introspection_events` table in Events Service
- **Replaces logging for normal operations** - only critical failures logged

**Emitter lifecycle:**

1. Created in `index.ts` during DO initialization
2. Passed to `operations` and `dispatch` layers
3. Batches events in memory (flush every 100 events or 30 seconds)
4. Writes to Events Service via RPC

**Event types imported from `@wonder/events` package** (Events Service owns the schema).

See `docs/architecture/introspection.md` for detailed design.

## Coordinator (Entry Point)

The DO class (Actor). Thin orchestration layer that coordinates decision logic and execution.

```typescript
class WorkflowCoordinator extends DurableObject {
  private workflowCache: Map<string, WorkflowDef>; // Actor instance cache

  async start(workflowRunId: string, input: Record<string, unknown>): Promise<void>;
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void>;
}
```

### RPC Methods (Actor Messages)

Only two external entry points (messages this actor can receive):

- `start(workflow_run_id, input)` - Initialize and begin workflow
- `handleTaskResult(token_id, result)` - Process completed task

### start(workflow_run_id, input)

```typescript
async start(workflowRunId: string, input: Record<string, unknown>) {
  // Initialize storage
  operations.tokens.initializeTable(this.sql);
  operations.context.initializeTable(this.sql);
  operations.artifacts.initializeTable(this.sql);

  // Store input
  operations.context.initializeWithInput(this.sql, input);

  // Load workflow (fetch from RESOURCES, cache in DO)
  const workflow = await this.getWorkflow(workflowRunId);

  // Create initial token
  const tokenId = operations.tokens.create(this.sql, {
    workflow_run_id: workflowRunId,
    node_id: workflow.initial_node_id,
    parent_token_id: null,
    path_id: 'root',
    fan_out_transition_id: null,
    branch_index: 0,
    branch_total: 1,
  });

  // Dispatch
  await this.dispatchToken(tokenId);
}
```

### handleTaskResult(token_id, result)

```typescript
async handleTaskResult(tokenId: string, result: TaskResult) {
  const sql = this.ctx.storage.sql;

  // 1. Mark complete and apply result
  operations.tokens.updateStatus(sql, tokenId, 'completed');
  const token = operations.tokens.get(sql, tokenId);
  operations.context.applyNodeOutput(sql, token.node_id, result.output_data, tokenId);

  // 2. Load workflow and context (cached)
  const workflow = await this.getWorkflow(token.workflow_run_id);
  const contextData = operations.context.getSnapshot(sql);

  // 3. Run decision logic (pure - returns data)
  const routingDecisions = planning.routing.decide(token, workflow, contextData);

  // 4. Dispatch decisions (converts to operations, handles synchronization recursively)
  const tokensToDispatch = await dispatch.applyDecisions(
    routingDecisions,
    sql,
    this.env,
    this.logger,
  );

  // 5. Dispatch all
  await Promise.all(tokensToDispatch.map(id => this.dispatchToken(id)));

  // 6. Check completion
  const activeCount = operations.tokens.getActiveCount(sql, token.workflow_run_id);
  if (activeCount === 0) {
    const markedComplete = operations.tokens.markWorkflowComplete(sql, token.workflow_run_id);
    if (markedComplete) {
      const finalOutput = decisions.completion.extractFinalOutput(workflow, contextData);
      await this.finalizeWorkflow(token.workflow_run_id, finalOutput);
    }
  }
}
```

### dispatchToken(token_id) [private]

```typescript
private async dispatchToken(tokenId: string) {
  operations.tokens.updateStatus(this.sql, tokenId, 'executing');

  const payload = await buildWorkerPayload(this.sql, this.env, tokenId);

  if (payload.completedSynchronously) {
    // Task has no steps - complete immediately
    await this.handleTaskResult(tokenId, { output_data: {} });
  } else {
    // Fire-and-forget to worker
    this.env.WORKER.executeTask(payload);
  }
}
```

## Data Flow

```
handleTaskResult(tokenId, result)  [Actor message received]
  │
  ├─► operations.tokens.updateStatus(tokenId, 'completed')  [Actor state mutation]
  ├─► operations.context.applyNodeOutput(result.output_data)  [Actor state mutation]
  │
  ├─► Load state (read-only snapshot for decision logic)
  │   ├─► token = operations.tokens.get(tokenId)
  │   ├─► workflow = await getWorkflow(cached)
  │   └─► contextData = operations.context.getSnapshot()
  │
  ├─► Decision logic (pure, returns Decision[] data)
  │   └─► decisions = planning.routing.decide(token, workflow, contextData)
  │
  ├─► Dispatch decisions (convert to operations)
  │   └─► tokensToDispatch = dispatch.applyDecisions(decisions, ...)
  │         │
  │         ├─► Batch decisions (optimization)
  │         │
  │         ├─► For each decision:
  │         │   ├─► CREATE_TOKEN → operations.tokens.create()  [SQL mutation]
  │         │   ├─► CHECK_SYNCHRONIZATION → recursive:
  │         │   │     ├─► Load siblings
  │         │   │     ├─► planning.synchronization.decide() → subDecisions
  │         │   │     └─► applyDecisions(subDecisions)
  │         │   ├─► CREATE_FAN_IN_TOKEN → operations.tokens.tryCreateFanIn()  [SQL mutation]
  │         │   ├─► ACTIVATE_FAN_IN_TOKEN → operations.tokens.tryActivate()  [SQL mutation]
  │         │   └─► MARK_FOR_DISPATCH → add to return array
  │         │
  │         └─► Return tokensToDispatch[]
  │
  ├─► Dispatch all tokens
  │   └─► Promise.all(tokensToDispatch.map(id => dispatchToken(id)))
  │
  └─► Check workflow completion
      └─► if activeCount === 0:
          ├─► finalOutput = planning.completion.extractFinalOutput()
          └─► finalizeWorkflow()
```

## Key Characteristics

### Pure Decision Logic

All routing and synchronization logic is **pure** - no side effects, no SQL, no RPC, no actor interactions. This enables:

- **Unit testing without mocks**: Test with plain data, no actors needed
- **Deterministic behavior**: Same inputs → same decisions (data)
- **Replay production failures**: Re-run decision functions with captured state
- **Property-based testing**: Generate random scenarios
- **Actor Model benefit**: Decision layer separates business logic from actor mechanics

### Decision Batching

The application layer optimizes decision execution:

```typescript
// Before batching
[
  { type: 'CREATE_TOKEN', params: {...} },
  { type: 'CREATE_TOKEN', params: {...} },
  { type: 'CREATE_TOKEN', params: {...} },
]

// After batching (optimization)
[
  { type: 'BATCH_CREATE_TOKENS', allParams: [{...}, {...}, {...}] }
]
```

Single SQL transaction instead of three separate operations.

### Recursive Synchronization

`CHECK_SYNCHRONIZATION` decisions trigger recursive decision generation during dispatch:

1. Load siblings from SQL
2. Call `planning.synchronization.decide()` → returns sub-decisions
3. Apply sub-decisions (which may generate more decisions)
4. Collect all `MARK_FOR_DISPATCH` results

This keeps synchronization logic isolated, testable, and independent of actor mechanics.

### Actor-Level Caching

Workflow definitions cached in coordinator actor instance:

```typescript
private workflowCache: Map<string, WorkflowDef> = new Map();
```

Loaded once per workflow_run_id, reused for all token completions. Invalidated on actor restart (acceptable - cold start penalty only).

## Testing Strategy

Wonder uses a **3-layer testing strategy** that leverages the Decision Pattern for comprehensive coverage without mocks. See `docs/architecture/testing.md` for detailed examples and patterns.

### Layer 1: Unit Tests (Fast - No Infrastructure)

Test pure decision functions (`planning/routing.ts`, `planning/synchronization.ts`, etc.) with plain data objects. Runs in milliseconds with no database, DO, or RPC.

**Benefits:**

- Exhaustive edge case coverage
- Property-based testing for invariants
- Regression tests from production state captures
- Fast CI feedback (< 1 second)

### Layer 2: SDK Introspection Tests (Medium - Live Architecture)

Test decision functions with real workflow definitions and context from deployed infrastructure. New coordinator RPC methods (`introspectTokens()`, `simulateRouting()`, `simulateSynchronization()`) enable safe, read-only testing against live architecture.

**Benefits:**

- Realistic workflow structures and schemas
- Debug production issues by replaying captured state
- No mocks for workflow/context data
- Medium speed (hundreds of ms)

### Layer 3: E2E Tests (Primary - Full Stack)

**This is the ultimate source of truth** - E2E tests prove the architecture works end-to-end. Execute complete workflows with real Cloudflare services (DO, D1, Workers AI) via Miniflare locally and deployed services in CI.

**Benefits:**

- Definitive validation of entire system
- Tests actual production code paths
- Validates all integration points together
- Fast enough for frequent runs (Miniflare is quick)
- Reference implementations for complex patterns

**Core Advantage:** The Decision Pattern makes business logic testable without mocks while maintaining Actor Model benefits (isolated state, single-threaded execution, message passing).
