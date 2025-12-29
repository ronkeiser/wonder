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
├── schema/                     # Drizzle table schemas
│   ├── index.ts                # Schema exports
│   └── migrations/             # DO SQLite migrations
│       └── index.ts            # Migration runner
├── shared/                     # Pure utility functions
│   ├── index.ts                # Exports
│   ├── conditions.ts           # Condition evaluation
│   ├── errors.ts               # Error utilities
│   └── path.ts                 # Path computation utilities
├── planning/                   # Pure logic - returns { decisions, events }
│   ├── index.ts                # Planning exports
│   ├── routing.ts              # Transition evaluation
│   ├── synchronization.ts      # Fan-in logic
│   ├── completion.ts           # Workflow finalization (output mapping)
│   ├── lifecycle.ts            # Workflow start decisions
│   └── merge.ts                # Branch merge strategies
├── operations/                 # Data managers - SQL and state
│   ├── db.ts                   # Shared Drizzle DB instance
│   ├── tokens.ts               # Token CRUD + queries
│   ├── context.ts              # Context CRUD + snapshots + branch tables
│   ├── defs.ts                 # Workflow definitions from RESOURCES
│   ├── status.ts               # Workflow status management
│   └── subworkflows.ts         # Subworkflow tracking for cascade cancellation
└── dispatch/                   # Decision execution (convert to operations)
    ├── index.ts                # Dispatch exports
    ├── apply.ts                # Main decision dispatcher
    ├── batch.ts                # Decision batching optimization
    ├── lifecycle.ts            # Workflow start/completion execution
    ├── task.ts                 # Token dispatch to executor
    └── fan.ts                  # Fan-out/fan-in execution (branch tables, synchronization)
```

## Decision Types (types.ts)

Decisions are pure data describing state changes to make (converted to operations during dispatch):

```typescript
type Decision =
  // Token operations
  | { type: 'CREATE_TOKEN'; params: CreateTokenParams }
  | { type: 'UPDATE_TOKEN_STATUS'; tokenId: string; status: TokenStatus }
  | { type: 'MARK_WAITING'; tokenId: string; arrivedAt: Date }
  | { type: 'MARK_FOR_DISPATCH'; tokenId: string }
  | { type: 'COMPLETE_TOKEN'; tokenId: string }
  | { type: 'COMPLETE_TOKENS'; tokenIds: string[] }
  | { type: 'CANCEL_TOKENS'; tokenIds: string[]; reason: string }

  // Context operations
  | { type: 'SET_CONTEXT'; path: string; value: unknown }
  | { type: 'APPLY_OUTPUT'; path: string; output: Record<string, unknown> }
  | { type: 'APPLY_OUTPUT_MAPPING'; outputMapping: Record<string, string> | null; outputData: Record<string, unknown> }

  // Branch storage operations
  | { type: 'INIT_BRANCH_TABLE'; tokenId: string; outputSchema: object }
  | { type: 'APPLY_BRANCH_OUTPUT'; tokenId: string; output: Record<string, unknown> }
  | { type: 'MERGE_BRANCHES'; tokenIds: string[]; branchIndices: number[]; outputSchema: object; merge: MergeConfig }
  | { type: 'DROP_BRANCH_TABLES'; tokenIds: string[] }

  // Synchronization
  | { type: 'CHECK_SYNCHRONIZATION'; tokenId: string; transition: Transition }
  | { type: 'ACTIVATE_FAN_IN'; workflowRunId: string; nodeId: string; fanInPath: string; mergedTokenIds: string[] }
  | { type: 'TRY_ACTIVATE_FAN_IN'; workflowRunId: string; nodeId: string; fanInPath: string; transitionId: string; triggeringTokenId: string }

  // Workflow lifecycle
  | { type: 'INITIALIZE_WORKFLOW'; input: Record<string, unknown> }
  | { type: 'COMPLETE_WORKFLOW'; output: Record<string, unknown> }
  | { type: 'FAIL_WORKFLOW'; error: string }

  // Subworkflow operations
  | { type: 'MARK_WAITING_FOR_SUBWORKFLOW'; tokenId: string; subworkflowRunId: string; timeoutMs?: number }
  | { type: 'RESUME_FROM_SUBWORKFLOW'; tokenId: string; output: Record<string, unknown> }
  | { type: 'FAIL_FROM_SUBWORKFLOW'; tokenId: string; error: string }
  | { type: 'TIMEOUT_SUBWORKFLOW'; tokenId: string; subworkflowRunId: string; timeoutMs: number; elapsedMs: number }

  // Dispatch operations
  | { type: 'DISPATCH_TOKEN'; tokenId: string }

  // Batched operations (optimization)
  | { type: 'BATCH_CREATE_TOKENS'; allParams: CreateTokenParams[] }
  | { type: 'BATCH_UPDATE_STATUS'; updates: Array<{ tokenId: string; status: TokenStatus }> };
```

## Planning Modules (Pure)

All planning modules are pure functions that return `PlanningResult = { decisions: Decision[], events: TraceEventInput[] }`. No side effects, SQL, or RPC.

### planning/routing.ts

Evaluates transitions and determines next tokens after task completion.

```typescript
function decideRouting(params: {
  completedToken: TokenRow;
  workflowRunId: string;
  nodeId: string;
  transitions: TransitionRow[];
  context: ContextSnapshot;
}): PlanningResult;

function getTransitionsWithSynchronization(
  transitions: TransitionRow[],
  context: ContextSnapshot,
): Transition[];
```

**Algorithm:**

1. Group transitions by priority tier
2. Evaluate tiers in order (lower number = higher priority)
3. First tier with ANY matches wins; follow ALL matches in that tier
4. Check loopConfig.maxIterations before evaluating conditions
5. For each matched transition, determine spawn count (static or foreach)
6. Generate CREATE_TOKEN decisions with:
   - pathId for lineage tracking
   - siblingGroup for fan-in coordination
   - branchIndex/branchTotal for parallel branches
   - iterationCounts for loop tracking

### planning/synchronization.ts

Handles fan-in synchronization when tokens arrive at merge points.

```typescript
function decideSynchronization(params: {
  token: TokenRow;
  transition: Transition;
  siblingCounts: SiblingCounts;
  workflowRunId: string;
}): PlanningResult;

function decideOnTimeout(params: {
  waitingTokens: TokenRow[];
  transition: Transition;
  workflowRunId: string;
}): Decision[];

function decideFanInContinuation(params: {
  workflowRunId: string;
  nodeId: string;
  fanInPath: string;
  parentTokenId: string;
  parentIterationCounts?: Record<string, number>;
}): PlanningResult;
```

**Strategies:**

- `'any'` - First arrival activates fan-in immediately
- `'all'` - Wait for all siblings (branchTotal)
- `{ mOfN: n }` - Wait for n completions (quorum)

**Timeout policies:**

- `'fail'` - Fail workflow on timeout
- `'proceed_with_available'` - Merge available and continue

**Helpers:**

- `needsMerge(transition)` - Check if branch merge configured
- `getMergeConfig(transition)` - Get merge configuration
- `hasTimedOut(transition, oldestWaitingTimestamp)` - Check timeout
- `getEarliestTimeoutMs(transitions)` - For alarm scheduling

### planning/completion.ts

Extracts final workflow output by applying outputMapping.

```typescript
function extractFinalOutput(
  outputMapping: Record<string, string> | null,
  context: ContextSnapshot,
): CompletionResult;  // { output, events }

function applyInputMapping(
  mapping: Record<string, string> | null,
  context: ContextSnapshot,
): Record<string, unknown>;
```

### planning/lifecycle.ts

Workflow start decisions.

```typescript
function decideWorkflowStart(params: {
  workflowRunId: string;
  initialNodeId: string;
  input: Record<string, unknown>;
}): PlanningResult;
```

### planning/merge.ts

Branch merge strategy implementations (used by ContextManager.mergeBranches).

Strategies: `append`, `collect`, `merge_object`, `keyed_by_branch`, `last_wins`

## Operations (Data Managers)

### operations/tokens.ts

Token state management via TokenManager class (Drizzle ORM).

```typescript
class TokenManager {
  constructor(db, emitter)

  // Core CRUD
  create(params: CreateTokenParams): string              // Create token, returns ID
  get(tokenId: string): TokenRow                         // Get token by ID
  updateStatus(tokenId: string, status: TokenStatus): void

  // Queries
  getActiveCount(workflowRunId: string): number          // Count non-terminal tokens
  getActiveTokens(workflowRunId: string): TokenRow[]     // Get all active tokens
  getRootToken(workflowRunId: string): TokenRow | null

  // Sibling queries (for fan-in)
  getSiblings(workflowRunId: string, siblingGroup: string): TokenRow[]
  getSiblingCounts(workflowRunId: string, siblingGroup: string): SiblingCounts

  // Waiting state management
  markWaitingForSiblings(tokenId: string, arrivedAt: Date): void
  markWaitingForSubworkflow(tokenId: string, subworkflowRunId: string): void
  getAllWaitingTokens(): TokenRow[]
  getTokensWaitingForSubworkflow(): TokenRow[]

  // Bulk operations
  getMany(tokenIds: string[]): TokenRow[]
  completeMany(tokenIds: string[]): void
  cancelMany(tokenIds: string[], reason?: string): void

  // Fan-in operations (race-safe)
  tryCreateFanIn(params): boolean                        // INSERT OR IGNORE (race-safe)
  tryActivateFanIn(params): boolean                      // UPDATE WHERE status='waiting' (race-safe)
  getFanIn(workflowRunId: string, fanInPath: string): FanInRow | null
}
```

### operations/context.ts

Schema-driven SQL operations for workflow context and branch storage.

```typescript
class ContextManager {
  constructor(sql, defs, emitter)

  // Initialization
  initialize(input: Record<string, unknown>): void       // Create tables + validate/store input

  // Read operations
  get(path: string): unknown                             // Read value (supports nested paths)
  getSection(section: string): Record<string, unknown>   // Read entire section
  getSnapshot(): ContextSnapshot                         // Read-only view for planning

  // Write operations
  setField(path: string, value: unknown): void           // Set field (read-modify-write)
  replaceSection(section: string, data: Record<string, unknown>): void
  applyOutputMapping(outputMapping, taskOutput): void    // Apply node's output mapping

  // Branch storage (for parallel execution)
  initializeBranchTable(tokenId: string, outputSchema: JSONSchema): void
  applyBranchOutput(tokenId: string, output: Record<string, unknown>): void
  getBranchOutputs(tokenIds: string[], branchIndices: number[], outputSchema): BranchOutput[]
  mergeBranches(branchOutputs: BranchOutput[], merge: MergeConfig): void
  dropBranchTables(tokenIds: string[]): void
}
```

See `branch-storage.md` for branch isolation design.

### operations/defs.ts

Workflow definition management via DefinitionManager.

```typescript
class DefinitionManager {
  constructor(db, ctx, env)

  // Initialization (two paths)
  initializeWorkflow(workflowRunId: string): Promise<void>    // Root workflow (has D1 record)
  initializeSubworkflow(params: SubworkflowParams): Promise<void>  // Ephemeral (no D1 record)

  // Accessors (sync - data in DO SQLite after init)
  getWorkflowRun(): WorkflowRunRow
  getWorkflowDef(): WorkflowDefRow
  getNode(nodeId: string): NodeRow
  getNodes(): NodeRow[]
  getTransitionsFrom(nodeId: string): TransitionRow[]
  getTransitions(): TransitionRow[]
  getTransition(transitionId: string): TransitionRow
}
```

**Initialization flow:**

1. Run drizzle migrations (idempotent)
2. Check if already populated (DO wake-up case)
3. If not, fetch from RESOURCES and insert into DO SQLite
4. For root workflows: update D1 status to 'running'
5. For subworkflows: create synthetic run record (local only)

### operations/status.ts

Workflow lifecycle status management.

```typescript
class StatusManager {
  constructor(db, emitter)

  initialize(workflowRunId: string): void                // Set initial 'running' status
  get(workflowRunId: string): WorkflowStatus | null
  isTerminal(workflowRunId: string): boolean             // completed/failed/timed_out/cancelled
  update(workflowRunId: string, newStatus: WorkflowStatus): boolean  // Returns false if already terminal
  markCompleted(workflowRunId: string): boolean
  markFailed(workflowRunId: string): boolean
  markTimedOut(workflowRunId: string): boolean
}
```

Guards against double finalization - cannot transition from terminal state.

### operations/subworkflows.ts

Subworkflow tracking for cascade operations.

```typescript
class SubworkflowManager {
  constructor(db, emitter)

  register(params): string                               // Register new subworkflow
  updateStatus(subworkflowRunId: string, status: SubworkflowStatus): void
  getRunning(workflowRunId: string): SubworkflowRow[]    // Get all running subworkflows
  getBySubworkflowRunId(subworkflowRunId: string): SubworkflowRow | null
  getByParentTokenId(parentTokenId: string): SubworkflowRow | null
  cancelAll(workflowRunId: string): string[]             // Cancel all running, return IDs
}
```

Used for cascade cancellation when parent workflow fails/cancels.

## Dispatch Layer

The dispatch layer converts Decision[] to actual operations. This is the "act" phase.

### dispatch/apply.ts

Main decision dispatcher - routes decisions to appropriate managers.

```typescript
async function applyDecisions(
  decisions: Decision[],
  ctx: DispatchContext,
): Promise<ApplyResult>;

type ApplyResult = {
  applied: number;
  tokensCreated: string[];
  tokensDispatched: string[];
  errors: Array<{ decision: Decision; error: Error }>;
  fanInActivated?: boolean;
};
```

**Flow:**

1. Batch compatible decisions (optimization)
2. Apply each decision to appropriate manager
3. Emit workflow events for milestones (token.created, task.completed, etc.)
4. Handle recursive decisions (COMPLETE_WORKFLOW cascades to subworkflows)
5. Return summary with created/dispatched token IDs

### dispatch/task.ts

Token dispatch to executor and result processing.

```typescript
async function dispatchToken(ctx: DispatchContext, tokenId: string): Promise<void>;
async function processTaskResult(ctx: DispatchContext, tokenId: string, result: TaskResult): Promise<void>;
```

**dispatchToken:**

1. Get node definition
2. Route based on node type (task vs subworkflow)
3. Apply input mapping from context
4. Send to EXECUTOR (fire-and-forget)

**processTaskResult:**

1. Mark token completed
2. Handle output based on flow type:
   - Linear flow: Apply outputMapping to context
   - Fan-out flow: Write to branch table
3. Plan routing decisions
4. Process synchronization for created tokens
5. Dispatch non-waiting tokens

### dispatch/fan.ts

Fan-out/fan-in execution.

```typescript
async function handleBranchOutput(ctx, token, node, output): Promise<void>;
async function processSynchronization(ctx, createdTokenIds, syncTransitions): Promise<string[]>;
async function activateFanIn(ctx, decision, transition, triggeringTokenId): Promise<string | null>;
```

**handleBranchOutput:** Write task output to isolated branch table (for later merge).

**processSynchronization:** Check sync conditions for created tokens, return continuation token IDs.

**activateFanIn:**

1. Try to win fan-in race (race-safe via SQL constraint)
2. Get completed siblings for merge
3. Merge branch outputs if configured
4. Mark waiting/in-flight siblings as completed/cancelled
5. Create continuation token

### dispatch/lifecycle.ts

Workflow start and timeout handling.

```typescript
async function startWorkflow(ctx: DispatchContext): Promise<void>;
async function processTaskError(ctx, tokenId, errorResult): Promise<void>;
async function checkTimeouts(ctx: DispatchContext): Promise<void>;
```

**startWorkflow:**

1. Get workflow run and definition
2. Initialize workflow (INITIALIZE_WORKFLOW decision)
3. Plan initial token creation
4. Dispatch first token

**checkTimeouts:**

1. Check sibling timeouts (waiting_for_siblings tokens)
2. Check subworkflow timeouts (waiting_for_subworkflow tokens)
3. Apply timeout decisions (fail or proceed_with_available)
4. Schedule next alarm if still waiting

### dispatch/batch.ts

Decision batching optimizations - groups consecutive CREATE_TOKEN into BATCH_CREATE_TOKENS.

## Event Emission

Events are emitted via the `Emitter` from `@wonder/events`:

**Workflow events** (always on):

- `workflow.started`, `workflow.completed`, `workflow.failed`
- `task.dispatched`, `task.completed`, `task.failed`
- `token.created`, `token.completed`, `token.waiting`
- `fan_out.started`, `fan_in.completed`, `branches.merged`
- `subworkflow.dispatched`, `subworkflow.completed`

**Trace events** (opt-in via `enableTraceEvents`):

- `decision.routing.start`, `decision.sync.check_condition`
- `operation.context.field_set`, `operation.tokens.status_updated`
- `dispatch.batch.complete`, `sql.query`

Events are streamed to STREAMER service for persistence and observability.

## Coordinator (Entry Point)

The DO class (Actor). Thin orchestration layer that delegates to dispatch functions.

```typescript
class WorkflowCoordinator extends DurableObject {
  private defs: DefinitionManager;
  private emitter: Emitter;
  private context: ContextManager;
  private tokens: TokenManager;
  private status: StatusManager;
  private subworkflows: SubworkflowManager;

  // Root workflow entry
  async start(workflowRunId: string, options?: { enableTraceEvents?: boolean }): Promise<void>;

  // Subworkflow entry (no D1 record - ephemeral)
  async startSubworkflow(params: SubworkflowParams): Promise<void>;

  // Task callbacks from Executor
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void>;
  async handleTaskError(tokenId: string, errorResult: TaskErrorResult): Promise<void>;
  async markTokenExecuting(tokenId: string): Promise<void>;

  // Subworkflow callbacks
  async handleSubworkflowResult(tokenId: string, output: Record<string, unknown>): Promise<void>;
  async handleSubworkflowError(tokenId: string, error: string): Promise<void>;

  // Lifecycle
  async cancel(reason: string): Promise<void>;
  async alarm(): Promise<void>;
}
```

### RPC Methods (Actor Messages)

The coordinator receives these external messages:

**Workflow lifecycle:**

- `start(workflowRunId, options?)` - Initialize and begin root workflow
- `startSubworkflow(params)` - Start ephemeral subworkflow (no D1 record)
- `cancel(reason)` - Cancel workflow (cascades to subworkflows)

**Task callbacks (from Executor):**

- `handleTaskResult(tokenId, result)` - Task completed successfully
- `handleTaskError(tokenId, errorResult)` - Task failed
- `markTokenExecuting(tokenId)` - Task started executing (observability)

**Subworkflow callbacks (from child coordinators):**

- `handleSubworkflowResult(tokenId, output)` - Subworkflow completed
- `handleSubworkflowError(tokenId, error)` - Subworkflow failed

**Alarm:**

- `alarm()` - Timeout check (scheduled via DO alarms)

### start(workflowRunId, options?)

```typescript
async start(workflowRunId: string, options?: { enableTraceEvents?: boolean }) {
  // Initialize definition manager (loads WorkflowRun + WorkflowDef from D1)
  await this.defs.initializeWorkflow(workflowRunId);

  // Delegate to dispatch/lifecycle.ts
  const ctx = this.getDispatchContext(workflowRunId, options);
  await startWorkflow(ctx);
}
```

### startSubworkflow(params)

```typescript
async startSubworkflow(params: SubworkflowParams) {
  // Initialize definitions (creates synthetic run record in DO SQLite, no D1)
  await this.defs.initializeSubworkflow(params);

  // Same lifecycle as root workflow
  const ctx = this.getDispatchContext(params.runId);
  await startWorkflow(ctx);
}
```

### handleTaskResult(tokenId, result)

```typescript
async handleTaskResult(tokenId: string, result: TaskResult) {
  const token = this.tokens.get(tokenId);
  const ctx = this.getDispatchContext(token.workflowRunId);

  // Delegate to dispatch/task.ts - handles output mapping, routing, fan-in
  await processTaskResult(ctx, tokenId, result);
}
```

### DispatchContext

All dispatch functions receive a `DispatchContext` containing managers and services:

```typescript
type DispatchContext = {
  tokens: TokenManager;
  context: ContextManager;
  defs: DefinitionManager;
  status: StatusManager;
  subworkflows: SubworkflowManager;
  emitter: Emitter;
  logger: Logger;
  workflowRunId: string;
  rootRunId: string;
  resources: Env['RESOURCES'];
  executor: Env['EXECUTOR'];
  coordinator: Env['COORDINATOR'];
  waitUntil: (promise: Promise<unknown>) => void;
  scheduleAlarm: (delayMs: number) => Promise<void>;
  enableTraceEvents?: boolean;
};
```

## Data Flow

```
handleTaskResult(tokenId, result)  [Actor message received]
  │
  ├─► processTaskResult(ctx, tokenId, result)  [dispatch/task.ts]
  │     │
  │     ├─► Guard: ignore if token already terminal
  │     │
  │     ├─► applyDecisions([COMPLETE_TOKEN])
  │     │
  │     ├─► Handle output by flow type:
  │     │   ├─► Linear: APPLY_OUTPUT_MAPPING → context.applyOutputMapping()
  │     │   └─► Fan-out: handleBranchOutput() → branch table
  │     │
  │     ├─► planning.decideRouting() → { decisions, events }
  │     │
  │     ├─► applyDecisions(routingDecisions) → { tokensCreated }
  │     │
  │     ├─► processSynchronization(tokensCreated, syncTransitions)
  │     │   ├─► For each created token:
  │     │   │   ├─► Get siblingCounts
  │     │   │   ├─► planning.decideSynchronization() → decisions
  │     │   │   ├─► If ACTIVATE_FAN_IN:
  │     │   │   │     ├─► TRY_ACTIVATE_FAN_IN (race-safe)
  │     │   │   │     ├─► mergeBranchOutputs()
  │     │   │   │     └─► createFanInContinuation() → continuationTokenId
  │     │   │   └─► Else: MARK_WAITING or MARK_FOR_DISPATCH
  │     │   └─► Return continuationTokenIds[]
  │     │
  │     ├─► dispatchToken() for each dispatched + continuation token
  │     │
  │     └─► If no routing → checkAndFinalizeWorkflow()
  │
  └─► If activeCount === 0:
      ├─► planning.extractFinalOutput() → { output, events }
      └─► applyDecisions([COMPLETE_WORKFLOW])
          ├─► Update status.completed
          ├─► Emit workflow.completed
          └─► Notify parent (if subworkflow) or RESOURCES (if root)
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

### Synchronization Processing

Fan-in synchronization happens after routing decisions create tokens:

1. For each created token, check if it has a sync transition
2. Get siblingCounts from TokenManager
3. Call `planning.decideSynchronization()` → returns decisions
4. Handle ACTIVATE_FAN_IN specially:
   - Race-safe activation via TRY_ACTIVATE_FAN_IN
   - Merge branch outputs
   - Create continuation token
5. Mark non-activating tokens as WAITING or dispatch them

This ensures a single deterministic path for all sync logic.

### Definition Storage

DefinitionManager stores workflow definitions in DO SQLite after initial fetch:

1. On workflow start: fetch from RESOURCES (D1), insert into DO SQLite
2. On DO wake-up: already in DO SQLite (no RPC needed)
3. Accessors are sync (getWorkflowDef, getNode, etc.) - data always local after init

For subworkflows: synthetic run record created in DO SQLite only (no D1 record).

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

---

## Timeout Handling

The coordinator handles two types of timeouts via DO alarms.

### Synchronization Timeout

Controls how long to wait for siblings at fan-in merge points. Measured from first sibling arrival (arrivedAt), not from fan-out dispatch.

**Implementation in dispatch/lifecycle.ts:**

```typescript
async function checkTimeouts(ctx: DispatchContext): Promise<void> {
  await checkSiblingTimeouts(ctx);
  await checkSubworkflowTimeouts(ctx);
  await scheduleNextAlarmIfNeeded(ctx);
}
```

**Policies** (configured in transition.synchronization):

- `onTimeout: 'fail'` - Fail the workflow
- `onTimeout: 'proceed_with_available'` - Merge available siblings and continue

### Subworkflow Timeout

Controls how long to wait for subworkflow completion.

**Implementation:**

1. When MARK_WAITING_FOR_SUBWORKFLOW has timeoutMs, schedule alarm
2. checkSubworkflowTimeouts() checks elapsed time vs configured timeout
3. If timed out, apply TIMEOUT_SUBWORKFLOW decision:
   - Cancel the subworkflow
   - Mark parent token as timed_out
   - Fail parent workflow

### Alarm Scheduling

Alarms are scheduled when:

1. Token enters waiting_for_siblings state (if sync has timeoutMs)
2. Token enters waiting_for_subworkflow state (if timeoutMs configured)

`scheduleNextAlarmIfNeeded()` reschedules based on earliest remaining timeout.

**Note:** Task and action timeouts are enforced by the Executor. Coordinator only handles orchestration-level timeouts.
