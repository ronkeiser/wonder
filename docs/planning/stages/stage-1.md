# Stage 1: Minimal Implementation

## Capability 1: Foundation (No UI, No Parallelism)

**Goal**: Single workflow runs to completion with basic actions

### Infrastructure

- D1 schema: workspaces, projects, workflow_defs, nodes, transitions, workflow_runs, events
- Durable Object: WorkflowRunCoordinator (single token execution)
- Worker: TaskExecutor (queue consumer)
- Queue: workflow_tasks

### Actions (Minimal Set)

- `update_context` — Pure function state manipulation
- `llm_call` — OpenAI/Anthropic adapter only
- `write_artifact` — Write to D1 artifacts table

### Execution

- Load workflow graph into DO memory
- Single token: initial → evaluate transitions → execute node → repeat
- Terminal detection: zero outgoing transitions
- Event logging: workflow_started, node_started, node_completed, workflow_completed

### Test

- Build workflow via direct D1 insert (no UI)
- Trigger via HTTP API
- Validate: context mutation, LLM call, artifact creation

---

## Capability 2: Parallelism (No UI)

**Goal**: Fan-out/fan-in with merge strategies

### Extensions

- Token spawning: `fan_out: 'all'` creates N tokens with `_branch` context
- Fan-in synchronization: wait for siblings, apply merge strategy
- Events: token_spawned, token_merged

### Test

- Workflow: fan-out 3 LLM judges → fan-in merge → decision
- Validate: 3 parallel calls, merged votes in state

---

## Capability 3: Sub-workflows (No UI)

**Goal**: Composition via `workflow_call`

### Extensions

- `workflow_call` action: spawn child WorkflowRun with isolated context
- Input/output mapping: parent → child → parent
- Nested DO coordination (may need child DOs at scale)

### Test

- Workflow: main → call research_routine → aggregate results
- Validate: parent-child relationship, output mapping

---

## Capability 4: Error Handling

**Goal**: Retries, timeouts, failure routing

### Extensions

- Retry policy in ActionDef, enforced by Worker
- Timeout enforcement
- Failure transitions: match on `state._last_error`

### Test

- Workflow with flaky LLM call (503 simulation)
- Validate: retry + eventual success or failure routing

---

## Capability 5: Basic UI

**Goal**: Build and trigger workflows visually

### Components

- Workflow editor: drag nodes, connect transitions
- Node config panel: select action, set mappings
- Trigger button: start run
- Run view: token tree, event log (read-only)

### Defer

- Condition builder (use CEL expressions only)
- Schema inference panel
- Prompt template editor

---

## Capability 6: Observability

**Goal**: Live run visibility

### Extensions

- Snapshot creation (every N events)
- Live WebSocket: stream events to UI
- Run inspector: node outputs, execution time, costs

---

## Deferred to Later

- Human input nodes (requires auth + notification system)
- MCP server integration
- Vector search
- Advanced merge strategies (keyed_by_branch)
- m_of_n fan-in
- foreach dynamic iteration
- Scheduled triggers
- Library/routine management
- Multi-workspace/projects
