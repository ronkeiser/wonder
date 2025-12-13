# Executor Implementation Plan

Implementing the 5-layer execution model: WorkflowDef → Node → TaskDef → Step → ActionDef

## Step 3 Breakdown

| Sub-step | Task                                            | Complexity | Status  |
| -------- | ----------------------------------------------- | ---------- | ------- |
| 3a       | Task runner skeleton + step iteration loop      | Small      | ✅ Done |
| 3b       | Step condition evaluation (if/then/else)        | Small      | ✅ Done |
| 3c       | Input/output mapping at step level (JSONPath)   | Medium     | ✅ Done |
| 3d       | LLM action handler (move from legacy llmCall)   | Medium     | ✅ Done |
| 3e       | Step on_failure handling (abort/retry/continue) | Small      | ✅ Done |
| 3f       | Task-level retry logic                          | Medium     | ❌      |
| 3g       | Context action handler (pure transformation)    | Small      | ❌      |
| 3h       | HTTP action handler                             | Medium     | ❌      |
| 3i       | MCP action handler                              | Large      | ❌      |
| 3j       | Shell action handler                            | Medium     | ❌      |
| 3k       | Sub-workflow action handler                     | Large      | ❌      |
| 3l       | Human gate action handler                       | Medium     | ❌      |
| 3m       | Vector/metric action handlers                   | Small      | ❌      |

## Completed Work

### 3a: Task Runner Skeleton

- `execution/types.ts` - TaskContext, StepResult, ActionResult, error classes
- `execution/step-executor.ts` - executeStep with step lifecycle
- `execution/task-runner.ts` - runTask orchestrates step loop
- Updated `index.ts` to wire executeTask → runTask

### 3b: Condition Evaluation

- `execution/condition-evaluator.ts` - Full expression parser
  - Path access: `$.input.name`, `$.state.count`
  - Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
  - Logical: `&&`, `||`, `!`
  - Functions: `exists()`, `typeof()`, `length()`, `contains()`, `startsWith()`, `endsWith()`, `isEmpty()`, `isNumber()`, `isString()`, `isArray()`, `isObject()`

### 3c: Input/Output Mapping

- `context/mapping.ts` - JSONPath-like expressions
  - `getValueByPath()` - array indexing `[0]`, `[-1]`, wildcards `[*]`
  - `setValueByPath()` - nested path setting
  - `applyInputMapping()` - context → action input
  - `applyOutputMapping()` - action output → context
  - `interpolateTemplate()` - `"Hello {{$.input.name}}"`

### 3d: LLM Action Handler

- `actions/types.ts` - ActionInput, ActionOutput, ActionDeps
- `actions/llm.ts` - executeLLMAction with template rendering, model profile loading
- `actions/index.ts` - dispatchAction router

### 3e: on_failure Handling

- `handleStepFailure()` in step-executor.ts
  - `abort` → StepFailureError (stops task)
  - `retry` → TaskRetryError (coordinator retries)
  - `continue` → stores error, proceeds

---

## Remaining Work

### 3f: Task-level Retry Logic

**Location:** `execution/retry-handler.ts`

Handle task retries when steps throw `TaskRetryError`:

- Check `TaskDef.retry` config (max_attempts, backoff strategy)
- Track retry_attempt in TaskPayload
- Calculate backoff delay (none/linear/exponential)
- Emit retry events to coordinator
- Cap at max_delay_ms

```typescript
interface RetryConfig {
  max_attempts: number;
  backoff: 'none' | 'linear' | 'exponential';
  initial_delay_ms: number;
  max_delay_ms: number | null;
}
```

### 3g: Context Action Handler

**Location:** `actions/context.ts`

Pure transformation action for `update_context` kind:

- Takes input mapping values
- Returns them directly as output
- No side effects
- Useful for data reshaping between steps

```typescript
// Implementation is trivial - just pass through
case 'update_context':
  return { success: true, output: input, metrics: { duration_ms: 0 } };
```

### 3h: HTTP Action Handler

**Location:** `actions/http.ts`

Execute HTTP requests:

- Implementation schema: `{ method, url, headers, body, timeout_ms }`
- Template interpolation in URL and body
- Handle response parsing (JSON, text)
- Timeout handling
- Retry on transient errors (5xx, network)

```typescript
interface HTTPImplementation {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string; // Template: "https://api.example.com/{{$.input.endpoint}}"
  headers?: Record<string, string>;
  body?: unknown; // JSON body or template string
  timeout_ms?: number;
  retry_on_5xx?: boolean;
}
```

### 3i: MCP Action Handler

**Location:** `actions/mcp.ts`

Model Context Protocol tool invocation:

- Implementation schema: `{ server_id, tool_name, arguments }`
- Connect to MCP server (WebSocket or stdio)
- Send tool invocation request
- Handle streaming responses
- Parse tool results

**Complexity:** Large - requires MCP client implementation

```typescript
interface MCPImplementation {
  server_id: string; // Reference to configured MCP server
  tool_name: string;
  arguments: Record<string, unknown>; // Mapped from step input
}
```

### 3j: Shell Action Handler

**Location:** `actions/shell.ts`

Execute shell commands in containers:

- Implementation schema: `{ command, args, cwd, env, timeout_ms }`
- Requires container resource binding
- Stream stdout/stderr
- Capture exit code
- Handle timeouts

```typescript
interface ShellImplementation {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
  capture_output?: boolean;
}
```

**Note:** Depends on Container DO integration

### 3k: Sub-workflow Action Handler

**Location:** `actions/workflow.ts`

Invoke another workflow as a step:

- Implementation schema: `{ workflow_def_id, workflow_def_version, input_mapping }`
- Create new workflow run via coordinator RPC
- Wait for completion (or fire-and-forget)
- Map sub-workflow output back to step output

```typescript
interface WorkflowImplementation {
  workflow_def_id: string;
  workflow_def_version: number;
  input_mapping: Record<string, string>;
  wait_for_completion?: boolean; // Default: true
  timeout_ms?: number;
}
```

**Complexity:** Large - requires coordinator RPC and workflow run tracking

### 3l: Human Gate Action Handler

**Location:** `actions/human.ts`

Pause execution for human input:

- Implementation schema: `{ prompt, input_schema, timeout_ms }`
- Emit event to signal human input needed
- Suspend task execution
- Resume when input received via API
- Validate input against schema

```typescript
interface HumanImplementation {
  prompt: string;
  input_schema?: object; // JSON Schema for expected input
  timeout_ms?: number;
  notify_channels?: string[]; // Email, Slack, etc.
}
```

**Note:** Requires external API endpoint for submitting human input

### 3m: Vector/Metric Action Handlers

**Location:** `actions/vector.ts`, `actions/metric.ts`

**Vector Search:**

- Query vector database for similar documents
- Implementation: `{ collection, query, top_k, filter }`

**Metric Emission:**

- Emit custom metrics for observability
- Implementation: `{ metric_name, value, tags }`

Both are relatively simple and can share patterns with HTTP handler.

---

## Recommended Implementation Order

1. ~~3a - Get the basic loop working~~
2. ~~3c - Add mapping so data flows correctly~~
3. ~~3d - LLM handler (most common, already have code)~~
4. ~~3e - Error handling~~
5. ~~3b - Conditions (for branching within tasks)~~
6. **3g - Context transforms** (useful utility, trivial)
7. **3f - Task retry logic** (important for reliability)
8. **3h - HTTP handler** (common action type)
9. **3m - Vector/metric** (simple, follows HTTP pattern)
10. **3j - Shell handler** (needs container integration)
11. **3l - Human gate** (needs API endpoint)
12. **3i - MCP handler** (complex, needs MCP client)
13. **3k - Sub-workflow** (complex, needs coordinator changes)

## Files Created

```
services/executor/src/
├── index.ts                    # Updated executeTask entry point
├── execution/
│   ├── types.ts                # TaskContext, StepResult, errors
│   ├── task-runner.ts          # runTask orchestration
│   ├── step-executor.ts        # executeStep lifecycle
│   └── condition-evaluator.ts  # Expression parser
├── context/
│   └── mapping.ts              # JSONPath mapping
└── actions/
    ├── types.ts                # ActionInput, ActionOutput
    ├── index.ts                # dispatchAction router
    └── llm.ts                  # LLM action handler
```
