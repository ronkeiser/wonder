# Coordinator Architecture

The coordinator is a Durable Object that manages the lifecycle of a single workflow run. All state lives in DO SQLite until workflow completion, when results are committed to RESOURCES.

## Components

```
coordinator/src/
├── coordinator.ts   # DO class - entry point, wires services
├── tokens.ts        # Repository - token state and queries
├── context.ts       # Repository - workflow data flow
├── artifacts.ts     # Repository - staged artifacts
├── routing.ts       # Service - decides what happens next
├── tasks.ts         # Service - builds executor payloads
```

## Repositories

Repositories are pure data access layers. No business logic.

### tokens.ts

Token state machine and queries.

```typescript
createToken(sql, params) → token_id
getToken(sql, token_id) → TokenRow
updateTokenState(sql, token_id, state, state_data?) → void
getSiblingsByPathPrefix(sql, workflow_run_id, path_prefix) → TokenRow[]
getTokensByState(sql, workflow_run_id, state) → TokenRow[]
getActiveTokenCount(sql, workflow_run_id) → number
```

### context.ts

Key-value store for workflow data flow between nodes.

```typescript
initializeContextTable(sql) → void
initializeContextWithInput(sql, input) → void
getContextValue(sql, path) → unknown
setContextValue(sql, path, value) → void
setNodeOutput(sql, nodeRef, output) → void
```

### artifacts.ts

Staged artifacts - stored in DO SQLite during workflow, committed to RESOURCES on completion.

```typescript
initializeArtifactsTable(sql) → void
stageArtifact(sql, artifact) → void
getStagedArtifacts(sql) → Artifact[]
commitArtifacts(env, sql) → void  // writes to RESOURCES
```

## Services

Services contain business logic. They call repositories to read and write state.

### routing.ts

Decides what happens after a token completes.

**Input:**

- Completed token
- Workflow def (nodes, transitions)
- sql handle

**Does:**

1. Evaluates transitions from completed node (priority tiers, conditions)
2. For each selected transition, determines spawn count (static or foreach)
3. Creates tokens with correct path_id, fan_out_transition_id, branch_index, branch_total
4. For each new token, checks sync config:
   - No sync → mark for dispatch
   - Sync condition met → merge outputs, mark for dispatch
   - Sync condition not met → set state to waiting_for_siblings
5. Checks if completed token wakes any waiting tokens (same path prefix)
6. Checks if workflow is complete (no active tokens)
7. If complete, extracts final output from context

**Output:**

```typescript
type RoutingDecision = {
  tokensToDispatch: string[]; // token ids ready to execute
  workflowComplete: boolean;
  finalOutput?: Record<string, unknown>;
};
```

### tasks.ts

Builds executor payloads for a token.

**Input:**

- Token to dispatch
- Workflow def
- env (for RESOURCES binding)

**Does:**

1. Fetches node from workflow def
2. Fetches action, prompt spec, model profile from RESOURCES
3. Evaluates input_mapping against context
4. Renders template with resolved inputs

**Output:**

```typescript
type ExecutorPayload = {
  model_profile: ModelProfile;
  prompt: string;
  json_schema?: object;
  workflow_run_id: string;
  token_id: string;
};
```

## Coordinator (Entry Point)

The DO class. Thin orchestration layer that wires services together.

### RPC Methods

Only two external entry points:

- `start(workflow_run_id, input)` - called by HTTP service to begin workflow
- `handleTaskResult(token_id, result)` - called by executor when task completes

### Executor Callback Contract

The executor returns a structured result:

```typescript
type TaskResult = {
  context_updates: Record<string, unknown>; // output data for context
  staged_artifacts: Artifact[]; // artifacts to stage
};
```

Coordinator doesn't need to know action kinds. It just applies what executor tells it:

```typescript
if (result.context_updates) {
  context.setNodeOutput(sql, nodeRef, result.context_updates);
}

for (const artifact of result.staged_artifacts) {
  artifacts.stageArtifact(sql, artifact);
}
```

### start(workflow_run_id, input)

1. Fetch workflow def from RESOURCES
2. Initialize tables (context, tokens, artifacts)
3. Store input in context
4. Create initial token (state: pending)
5. Call routing to get decision
6. For each token to dispatch, call dispatchToken()

### handleTaskResult(token_id, result)

1. Update token state to completed (terminal)
2. Apply context_updates via context.setNodeOutput()
3. Stage any artifacts via artifacts.stageArtifact()
4. Call routing to get decision
5. For each token to dispatch, call dispatchToken()
6. If workflowComplete:
   - Commit staged artifacts to RESOURCES
   - Emit completion event
   - Store final output

### dispatchToken(token_id) [private]

1. Update token state to executing
2. Call tasks to build executor payload
3. Send payload to executor service
4. Emit events, log

## Data Flow

```
start()
  │
  ├─► context.initializeContextWithInput()
  ├─► tokens.createToken() [initial, pending]
  ├─► routing.decide() → tokensToDispatch
  └─► dispatchToken() for each
        │
        ├─► tokens.updateTokenState(executing)
        ├─► tasks.buildPayload()
        └─► executor.llmCall()

handleTaskResult()
  │
  ├─► tokens.updateTokenState(completed)
  ├─► context.setNodeOutput(result.context_updates)
  ├─► artifacts.stageArtifact() for each in result.staged_artifacts
  ├─► routing.decide()
  │     │
  │     ├─► evaluate transitions (priority, conditions)
  │     ├─► tokens.createToken() for each spawn
  │     ├─► check sync conditions
  │     ├─► tokens.updateTokenState(waiting_for_siblings) if blocked
  │     ├─► check for woken waiters
  │     └─► check workflow completion
  │
  ├─► dispatchToken() for each in tokensToDispatch
  └─► if workflowComplete:
        ├─► artifacts.commitArtifacts()
        └─► finalize workflow
```
