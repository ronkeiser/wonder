# Capability 4: Action Diversity

## Goal

Implement additional action types beyond `llm_call` to enable state manipulation, persistence, and external integrations.

## Why This Matters

Real workflows need more than LLM calls: parsing and transforming data, persisting results, calling external APIs. These actions complete the basic toolkit for useful workflows.

## Current State (After Capability 3)

✅ `llm_call` action working  
✅ Multi-node execution  
✅ Parallelism with fan-out/fan-in  
❌ Only one action type implemented  
❌ No state transformation capability  
❌ No artifact persistence  
❌ No external API calls

## What We're Building

### 1. update_context Action

Pure function state transformations using simple expressions.

**Implementation:**

```typescript
{
  kind: 'update_context',
  implementation: {
    updates: [
      {
        path: 'state.parsed_score',
        expr: 'parseFloat(state.raw_score)'
      },
      {
        path: 'state.timestamp',
        expr: 'Date.now()'
      },
      {
        path: 'state.summary',
        expr: 'state.results.join(", ")'
      }
    ]
  }
}
```

**Capabilities:**

- Simple JavaScript expressions (safe subset)
- Read from any context path
- Write to state paths
- Built-in functions: `parseFloat()`, `parseInt()`, `Date.now()`, `JSON.parse()`, `JSON.stringify()`
- String operations: `split()`, `join()`, `toLowerCase()`, `toUpperCase()`, `trim()`
- Array operations: `map()`, `filter()`, `reduce()`, `slice()`
- Math operations: `Math.round()`, `Math.floor()`, `Math.ceil()`, `Math.max()`, `Math.min()`

**Security:**

- No `eval()` - use safer expression evaluator
- Whitelist allowed functions
- No file system or network access
- Timeout on expression execution
- Memory limits

### 2. write_artifact Action

Persist typed outputs to D1 artifacts table.

**Implementation:**

```typescript
{
  kind: 'write_artifact',
  implementation: {
    artifact_type_id: 'research_finding',
    content_mapping: {
      'title': '$.state.finding_title',
      'summary': '$.state.finding_summary',
      'sources': '$.state.sources',
      'confidence': '$.state.confidence_score'
    }
  }
}
```

**Flow:**

1. Load `ArtifactType` schema by ID
2. Extract values from context using `content_mapping`
3. Validate against schema
4. Insert into D1 `artifacts` table
5. Add reference to `context.artifacts[artifact_name] = artifact_id`
6. Return artifact ID in task result

**Metadata Captured:**

- `created_by_workflow_run_id`
- `created_by_workflow_def_id`
- `created_by_workflow_def_version`
- `created_by_node_id`
- `created_at` timestamp

### 3. http_request Action

Call external REST APIs with templating.

**Implementation:**

```typescript
{
  kind: 'http_request',
  implementation: {
    url_template: 'https://api.example.com/search?q={{state.query}}',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer {{secrets.api_key}}',
      'Content-Type': 'application/json'
    },
    body_template: '{"query": "{{state.query}}", "limit": 10}'
  }
}
```

**Features:**

- Handlebars templating in URL, headers, body
- Support all HTTP methods: GET, POST, PUT, DELETE, PATCH
- Response parsing (JSON auto-parse)
- Error handling (4xx, 5xx)
- Timeout enforcement
- Retry policy support

**Security:**

- Only HTTPS allowed (no HTTP)
- Secret injection via `{{secrets.key_name}}`
- Secrets never logged
- URL whitelist option (workspace setting)

## Architecture

### New Executors

**`UpdateContextExecutor`** (`ai/executors/update-context.ts`)

- Parse and validate update expressions
- Execute expression against context
- Write results to state
- Return updated paths

**`WriteArtifactExecutor`** (`ai/executors/write-artifact.ts`)

- Load artifact type schema
- Extract content via mapping
- Validate against schema
- Insert to D1 via repository
- Return artifact ID

**`HttpRequestExecutor`** (`ai/executors/http-request.ts`)

- Render templates (URL, headers, body)
- Inject secrets securely
- Execute HTTP request
- Parse response
- Handle errors and retries

### Modified Components

**`domains/execution/worker.ts`**

- Add action kind routing
- Delegate to appropriate executor
- Unify result handling

**`domains/artifacts/repository.ts`** (new)

- `createArtifact(data): Promise<Artifact>`
- `getArtifact(id): Promise<Artifact>`
- `listArtifactsByProject(projectId): Promise<Artifact[]>`

## Test Scenarios

### Test 1: update_context

**Workflow:**

```
[Node A: LLM Extract Data]
  Output: state.raw_score = "8.5"

→ [Node B: Parse Score]
    Action: update_context
    Updates:
      - state.score = parseFloat(state.raw_score)
      - state.is_passing = state.score >= 7.0

  → [Node C: Use Parsed Data]
      Conditional routing on state.is_passing
```

**Verify:**

- String parsed to number correctly
- Boolean computed correctly
- No errors with valid expressions
- Error handling for invalid expressions

### Test 2: write_artifact

**Workflow:**

```
[Node A: LLM Research]
  Output: state.finding = {...}

→ [Node B: Persist Finding]
    Action: write_artifact
    Type: research_finding
    Mapping: {
      title: $.state.finding.title,
      summary: $.state.finding.summary
    }

  → [Node C: Reference Artifact]
      Access via context.artifacts.research_finding_id
```

**Verify:**

- Artifact created in D1
- Artifact ID returned
- Content validated against schema
- Metadata captured correctly
- Reference added to context

### Test 3: http_request

**Workflow:**

```
[Node A: Build Query]
  Output: state.search_term = "AI workflows"

→ [Node B: External API Call]
    Action: http_request
    URL: https://api.example.com/search?q={{state.search_term}}
    Method: GET

  → [Node C: Process Results]
      state.results = output from API
```

**Verify:**

- Template rendered correctly
- HTTP request succeeds
- Response parsed as JSON
- Error handling for 404, 500
- Retry on transient failures

### Test 4: Combined Pipeline

**Workflow:**

```
[Node A: HTTP Fetch External Data]
  → [Node B: LLM Summarize]
    → [Node C: update_context Parse]
      → [Node D: write_artifact Persist]
```

**Verify:**

- All actions work together
- Data flows through pipeline
- Final artifact contains processed data

## Implementation Checklist

### Phase 1: update_context (~100 LOC)

- [ ] Create `UpdateContextExecutor`
- [ ] Implement safe expression evaluator
- [ ] Whitelist allowed functions
- [ ] Apply updates to context state
- [ ] Unit test: various expressions, edge cases
- [ ] Unit test: security (reject dangerous code)

### Phase 2: Artifacts Repository (~80 LOC)

- [ ] Create `domains/artifacts/repository.ts`
- [ ] Implement `createArtifact()`
- [ ] Implement `getArtifact()`
- [ ] Implement `listArtifactsByProject()`
- [ ] Unit test: CRUD operations

### Phase 3: write_artifact (~80 LOC)

- [ ] Create `WriteArtifactExecutor`
- [ ] Load artifact type schema
- [ ] Apply content mapping
- [ ] Validate against schema
- [ ] Insert via repository
- [ ] Add reference to context
- [ ] Unit test: artifact creation flow

### Phase 4: http_request (~100 LOC)

- [ ] Create `HttpRequestExecutor`
- [ ] Implement template rendering
- [ ] Implement secret injection
- [ ] Execute HTTP requests
- [ ] Parse responses
- [ ] Error handling
- [ ] Unit test: various HTTP scenarios

### Phase 5: Worker Integration (~40 LOC)

- [ ] Update worker to route by action kind
- [ ] Add executor dispatch logic
- [ ] Unified result handling
- [ ] Integration test: all action types

### Phase 6: E2E Tests (~150 LOC)

- [ ] update_context test
- [ ] write_artifact test
- [ ] http_request test
- [ ] Combined pipeline test
- [ ] Verify all actions in multi-node workflows

## Effort Estimate

**~300 LOC total**  
**3-4 days** (including testing)

## Success Criteria

✅ `update_context` executes expressions safely  
✅ `write_artifact` persists to D1 with validation  
✅ `http_request` calls external APIs  
✅ All actions work in multi-node workflows  
✅ Error handling for all action types  
✅ E2E tests pass  
✅ No security vulnerabilities in expression eval

## Security Considerations

**update_context:**

- Sandbox expression execution
- No access to global scope
- Whitelist functions only
- Timeout enforcement (100ms max)
- Memory limits

**http_request:**

- HTTPS only
- Secret injection without logging
- Optional URL whitelist
- Rate limiting per workspace
- Response size limits (1MB max)

## Future Extensions (Deferred)

- `mcp_tool` action (MCP server integration)
- `vector_search` action
- `human_input` action (gates)
- `emit_metric` action
- `workflow_call` action (sub-workflows)
- More complex expression languages (CEL)
- JavaScript VM for full programmability
- Streaming HTTP responses
- GraphQL support
- WebSocket connections
