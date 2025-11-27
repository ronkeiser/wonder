# Capability 0: TypeScript SDK for Workflows as Code

## Purpose

Build a TypeScript client that enables defining and executing workflows as code. This provides a type-safe, version-controlled alternative to manual workflow construction, and serves as the foundation for both internal testing and eventual external API.

## Scope

SDK lives in `services/api/src/sdk/` for rapid iteration with direct access to internal types. Extract to `packages/sdk/` later when stable.

Test workflows live in `services/api/workflows/` as TypeScript modules.

---

## Phase 1: Minimal Single-Node Workflows

**Goal:** Deploy and run one-node workflows end-to-end

### Client Core (`src/sdk/client.ts`)

```typescript
const client = new WonderClient({
  workspaceId: 'workspace_456',
  projectId: 'proj_abc', // OR devProject: true
});
```

- Constructor validates: must provide `projectId` XOR `devProject: true`
- If `devProject: true`, create/reuse project named "Dev Workflows"
- Store project context for all subsequent operations
- Throw error if neither option provided

### Workflow Builder (`src/sdk/builders/workflow.ts`)

```typescript
const workflow = client
  .workflow('hello-world')
  .input({ name: 'string' })
  .output({ greeting: 'string' })
  .node('greet', (n) =>
    n
      .llmCall({
        prompt: 'Say hello to {{name}}',
        model: '@cf/meta/llama-3.1-8b-instruct',
      })
      .outputTo('state.greeting'),
  )
  .build();
```

- `.workflow(name)` - start builder
- `.input(schema)` - define input schema (JSON Schema format)
- `.output(schema)` - define output schema
- `.node(id, config)` - add node with fluent builder
- `.build()` - serialize to internal `WorkflowDef` format
- Single node only (no transitions yet)
- Set `initial_node_id` to the only node

### Node Builder (`src/sdk/builders/node.ts`)

```typescript
.node('greet', n => n
  .llmCall({
    prompt: 'template string',
    model: 'model_id'
  })
  .outputTo('state.field')
)
```

- `.llmCall({ prompt, model })` - create LLM action inline
- Auto-create PromptSpec (template, no system prompt for Phase 1)
- Auto-create ModelProfile (model_id, default params)
- Auto-create Action (kind: 'llm_call', link to spec/profile)
- `.outputTo(path)` - set `output_mapping` (e.g., `{ 'state.greeting': '$.response' }`)

### Deployment (`client.workflows.deploy()`)

```typescript
await client.workflows.deploy(workflow);
```

- Insert `WorkflowDef` into D1 (or update if exists by name)
- Insert dependent entities (PromptSpec, ModelProfile, Action)
- Insert `Workflow` binding to client's project
- Return workflow metadata (id, version, etc.)

### Execution (`client.workflows.run()`)

```typescript
const run = await client.workflows.run(
  'hello-world',
  { name: 'Alice' },
  {
    stream: true, // Enable live event streaming
    verbosity: 'standard', // 'minimal' | 'standard' | 'detailed'
  },
);

// Live event streaming
run.on('node.started', (e) => console.log(`→ ${e.node_id}`));
run.on('node.completed', (e) => console.log(`✓ ${e.node_id}`));
run.on('artifact.created', (e) => console.log(`📄 ${e.artifact_type}`));

// Blocks until workflow completes, streaming events
const result = await run.wait();

// Summary after completion
console.log('Duration:', result.duration_ms, 'ms');
console.log('Tokens:', result.metrics.tokens_used);
console.log('Output:', result.output);
console.log('Artifacts:', result.artifacts);
console.log('Logs:', result.log_url);
```

- Call `execution/service.startWorkflow()`
- Return run handle with:
  - `.id` - workflow_run_id
  - `.status` - current status
  - `.on(event, callback)` - subscribe to live events
  - `.wait()` - block until complete, return final result with summary
  - `.getContext()` - get current context snapshot
- **Live logs are the primary interface** - they show what's happening, where execution is, and what decisions are being made. The final result is just metadata.
- Artifacts and logs preserved in D1 regardless of streaming

#### Event Streaming Architecture

**DO as WebSocket Server:**

```typescript
// coordinator/index.ts
async fetch(request: Request): Response {
  if (request.headers.get('Upgrade') === 'websocket') {
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}

// Broadcast events to all connected WebSocket clients
private broadcastEvent(event: Event) {
  const sockets = this.state.getWebSockets();
  const message = JSON.stringify(event);
  for (const ws of sockets) {
    ws.send(message);
  }
}
```

**SDK connects via WebSocket:**

```typescript
// SDK initiates WebSocket connection to DO
const ws = new WebSocket(`wss://api/coordinator/${doId}/stream`);

ws.onmessage = (msg) => {
  const event = JSON.parse(msg.data);
  this.handleEvent(event); // Format and log based on verbosity
};

ws.onclose = () => {
  // Workflow complete, return final result
};
```

- DO broadcasts events in real-time as they occur
- SDK receives events over WebSocket, formats per verbosity level
- Connection closes when workflow completes
- No polling required

#### Connection Patterns

**Implicit (default)** - Connect + execute in one call:
```typescript
const run = await client.workflows.run('hello-world', { name: 'Alice' });
// Automatically connects WebSocket and starts execution
```

**Explicit** - Pre-connect, then trigger:
```typescript
// 1. Connect to event stream first
const stream = client.workflows.stream(workflowId);
stream.on('event', (e) => console.log(formatEvent(e)));

// 2. Trigger execution (can be from different client/API/UI)
await stream.start({ name: 'Alice' });

// 3. Wait for completion
await stream.wait();
```

**Reconnect to running workflow:**
```typescript
// Attach to already-running workflow
const stream = client.workflows.attach(workflowRunId);
stream.on('event', (e) => console.log(e));
await stream.wait();
```

This enables:
- Watching workflows triggered externally (CLI, UI, API)
- Re-connecting to long-running workflows
- Multiple observers on same workflow execution

#### Verbosity Levels

**Minimal** - Just milestones

```
→ fetch
✓ fetch
→ summarize
✓ summarize
✓ Complete in 2.3s
```

**Standard** (default) - Milestones + key metrics

```
→ fetch (http_request)
✓ fetch → 12.5kb
→ summarize (llm_call)
✓ summarize → 156 tokens
✓ Complete in 2.3s (156 tokens, $0.0023)
```

**Detailed** - Full execution trace

```
→ fetch (http_request) [token: tok_abc123]
  GET https://example.com/article
✓ fetch → 12.5kb [1.2s]
  Saved to state.content
→ summarize (llm_call) [token: tok_def456]
  Model: llama-3.1-8b-instruct
  Prompt: "Summarize: {{content}}" (12500 chars)
✓ summarize → 156 tokens [1.1s]
  Response: "This article discusses..."
  Saved to state.summary
📄 Artifact: summary_v1 (art_xyz789)
✓ Complete in 2.3s
  Full logs: https://wonder.dev/runs/run_123/events
```

### Validation

**Test workflow:** `workflows/hello-world.ts`

- Single LLM node
- Input: `{ name: 'string' }`
- Output: `{ greeting: 'string' }`
- Verify: can deploy, run, get output

---

## Phase 2: Transitions & Multi-Node Workflows

**Goal:** Chain multiple nodes with explicit control flow

### Workflow Builder Extensions

```typescript
const workflow = client
  .workflow('fetch-and-summarize')
  .input({ url: 'string' })
  .output({ summary: 'string' })

  .node('fetch', (n) => n.httpRequest({ method: 'GET', url: '{{url}}' }).outputTo('state.content'))

  .node('summarize', (n) =>
    n
      .llmCall({
        prompt: 'Summarize: {{content}}',
        model: '@cf/meta/llama-3.1-8b-instruct',
      })
      .outputTo('state.summary'),
  )

  .transition('fetch', 'summarize')
  .build();
```

- `.transition(fromNodeId, toNodeId)` - add unconditional edge
- Validation:
  - All nodes reachable from initial node
  - No orphaned nodes
  - Transitions reference existing nodes
- Set `initial_node_id` to first node added

### Node Builder Extensions

```typescript
.node('summarize', n => n
  .inputFrom({ content: '$.state.content' })
  .llmCall({ prompt: '...', model: '...' })
  .outputTo('state.summary')
)
```

- `.inputFrom(mapping)` - set `input_mapping` for node

### Action Types

Add support for:

- `.httpRequest({ method, url, headers?, body? })` - HTTP calls
- Auto-create Action with kind `http_request`

### Validation

**Test workflow:** `workflows/fetch-and-summarize.ts`

- Node 1: HTTP fetch (http_request action)
- Node 2: LLM summarize (llm_call action)
- Transition: fetch → summarize
- Verify: data flows between nodes via state

---

## Phase 3: Fan-out & Fan-in (Parallelism)

**Goal:** Spawn parallel branches and merge results

### Node Builder Parallelism

```typescript
.node('judges', n => n
  .fanOut('all', 5)  // Spawn 5 parallel branches
  .llmCall({
    prompt: 'Evaluate: {{candidate}}',
    model: '@cf/meta/llama-3.1-8b-instruct'
  })
)

.node('tally', n => n
  .fanIn('all', {
    strategy: 'append',
    target: 'state.votes'
  })
  .compute({ expression: 'countVotes(votes)' })
)
```

- `.fanOut(mode, count)` - set fan-out behavior
  - `mode: 'all'` - spawn all branches
  - `count: number` - how many branches
- `.fanIn(mode, merge)` - set fan-in behavior
  - `mode: 'all'` - wait for all siblings
  - `merge.strategy: 'append' | 'merge' | 'keyed' | 'last_wins'`
  - `merge.target` - where to write merged result

### Merge Strategies (`src/sdk/builders/merge.ts`)

- **append** - Collect all branch outputs to array

  ```typescript
  [{ vote: 'A' }, { vote: 'B' }, { vote: 'A' }];
  ```

- **merge** - Shallow merge objects

  ```typescript
  { ...branch1, ...branch2, ...branch3 }
  ```

- **keyed** - Merge by key field

  ```typescript
  { 'key1': { ...branch1 }, 'key2': { ...branch2 } }
  ```

- **last_wins** - Take final result only
  ```typescript
  branch_N.output;
  ```

### Validation

**Test workflow:** `workflows/multi-judge.ts`

- Node 1: Generate candidates (single node)
- Node 2: Judges evaluate (fan-out: all, 5 branches)
- Node 3: Tally votes (fan-in: all, append strategy)
- Verify: 5 parallel LLM calls, merged results in state

---

## Phase 4: Sub-workflows & Composition

**Goal:** Nest workflows, reuse reasoning patterns

### Workflow Call Action

```typescript
.node('research', n => n
  .workflowCall('react_reasoning_v2')
  .withInput({
    task: '$.state.research_question',
    tools: '$.state.available_tools'
  })
  .withOutput({
    'state.findings': '$.output.findings'
  })
)
```

- `.workflowCall(workflowDefId)` - invoke sub-workflow
- `.withInput(mapping)` - map parent context → child input
- `.withOutput(mapping)` - map child output → parent context
- Sub-workflow executes in isolated DO with fresh context
- Parent waits for sub-workflow completion

### Library Support

```typescript
const client = new WonderClient({
  workspaceId: 'ws_123',
  projectId: 'proj_abc'
});

// Reference workflow from library
.node('reason', n => n
  .workflowCall('lib://wonder-patterns/react_v2')
  .withInput({ ... })
  .withOutput({ ... })
)
```

- `lib://library_name/workflow_name` - reference library workflow
- Resolve library workflow by name at runtime

### Validation

**Test workflow:** `workflows/research-pipeline.ts`

- Node 1: Search for sources (vector_search)
- Node 2: Investigate sources (workflowCall to ReAct routine)
- Node 3: Synthesize findings (llm_call)
- Verify: sub-workflow executes in isolation, output mapped back

---

## Phase 5: Advanced Features

**Goal:** Production-ready capabilities

### Human Input Gates

```typescript
.node('approval', n => n
  .humanInput({
    prompt: 'Review this summary and approve',
    timeout_ms: 3600000,  // 1 hour
    required_fields: ['approved', 'feedback']
  })
)
```

- `.humanInput(config)` - pause for human review
- Workflow status becomes `waiting`
- Resume via API call with input data

### Conditional Transitions

```typescript
.transition('approval', 'publish', {
  condition: {
    type: 'equals',
    field: { path: 'state.approved' },
    value: true
  }
})

.transition('approval', 'revise', {
  condition: {
    type: 'equals',
    field: { path: 'state.approved' },
    value: false
  }
})
```

- `.transition(from, to, { condition })` - conditional edge
- Condition DSL (structured, no CEL for Phase 5)
- Support: equals, exists, gt/lt, and/or

### Error Handling

```typescript
.node('risky_action', n => n
  .llmCall({ ... })
  .onError('catch')  // don't propagate to workflow
)

.transition('risky_action', 'fallback', {
  condition: { type: 'exists', field: { path: 'state.error' } }
})
```

- `.onError(strategy)` - `'catch'` | `'propagate'`
- Caught errors stored in `state.error`
- Enable error-handling transitions

### Observability Hooks

```typescript
const run = await client.workflows.run('pipeline', { input });

run.onProgress((event) => {
  console.log(event.kind, event.payload);
});

const metrics = await run.getMetrics();
console.log(metrics.tokens_used, metrics.llm_calls, metrics.cost_usd);
```

- `.onProgress(callback)` - subscribe to events
- `.getMetrics()` - get aggregated stats

### Validation

**Test workflow:** `workflows/approval-pipeline.ts`

- Multi-step workflow with approval gate
- Conditional transitions based on approval
- Error handling with fallback paths
- Live progress monitoring

---

## Phase 6: Extract to Standalone Package

**Goal:** Publish `@wonder/sdk` for external use

### Structure

```
packages/sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── client.ts
│   ├── builders/
│   │   ├── workflow.ts
│   │   ├── node.ts
│   │   ├── action.ts
│   │   └── merge.ts
│   └── index.ts
└── README.md
```

### Changes

- Move from `services/api/src/sdk/` → `packages/sdk/`
- Replace direct repository imports with RPC client
- Separate versioning (package.json version)
- API client connects via HTTP to `services/api`

### Publishing

- Publish to npm (private initially)
- Separate changelog and versioning
- External users install via `npm install @wonder/sdk`

---

## Implementation Strategy

### Build Order

1. **Phase 1** - Get single-node workflows working

   - Validates entity creation flow
   - Proves deploy + run loop

2. **Phase 2** - Add transitions

   - Multi-node workflows
   - Validates graph construction

3. **Phase 3** - Parallelism

   - The big unlock for multi-judge patterns
   - Most complex runtime behavior

4. **Phase 4** - Composition

   - Enables reusable reasoning patterns
   - Proves context isolation

5. **Phase 5** - Polish and production features
6. **Phase 6** - Extract when API is stable

### Design Principles

- **Start simple** - Single-node first, add complexity incrementally
- **Declarative wins** - SDK creates entities, user doesn't manage IDs
- **Type safety** - Use TypeScript generics for schema validation
- **Test workflows as docs** - Each phase produces working example
- **Internal dogfooding** - Use SDK for all test workflows

### Validation per Phase

Each phase must produce a working example workflow in `workflows/` that demonstrates the new capability.
