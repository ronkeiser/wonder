# Executor Architecture

The **Executor** is a Wonder service that executes tasks dispatched by the coordinator. It runs as a stateless Cloudflare Worker (like all Wonder services) and handles task execution with all state held in memory.

## Architecture: Stateless Execution Engine

The Executor implements a **pure execution model**:

- **Stateless** - No persistent storage, fresh context per task
- **Sequential** - Steps execute in order, no internal parallelism
- **Fast** - In-memory state, no coordination overhead
- **Reliable** - Task-level retries, step-level failure handling

The Executor receives a task payload, loads the task definition, executes all steps in sequence, and returns a result. The coordinator handles all orchestration, state persistence, and branching logic.

**Note:** "Executor" is the Wonder service name. It runs on the Cloudflare Workers platform, but we avoid saying "the worker" to prevent confusion since all Wonder services run as Cloudflare Workers.

## Components

```
executor/src/
├── index.ts                    # Worker entry point (RPC handler)
├── types.ts                    # TaskPayload, TaskResult, TaskContext
├── execution/
│   ├── task-runner.ts          # Main task execution loop
│   ├── step-executor.ts        # Individual step execution
│   ├── condition-evaluator.ts  # Step condition evaluation
│   └── retry-handler.ts        # Task-level retry logic
├── actions/
│   ├── registry.ts             # Action handler registry
│   ├── llm-call.ts             # LLM inference handler
│   ├── mcp-tool.ts             # MCP tool invocation handler
│   ├── http-request.ts         # HTTP API call handler
│   ├── update-context.ts       # Context manipulation handler
│   ├── workflow-call.ts        # Sub-workflow invocation handler
│   └── [other-actions].ts      # Additional action handlers
├── context/
│   ├── manager.ts              # Task context lifecycle
│   └── mapping.ts              # Input/output mapping (JSONPath)
└── integration/
    ├── resources.ts            # Load TaskDef/ActionDef from Resources
    ├── coordinator.ts          # RPC to coordinator for sub-workflows
    ├── llm-providers.ts        # LLM API adapters
    └── mcp-client.ts           # MCP protocol client
```

## Task Payload & Result

### TaskPayload (from Coordinator)

```typescript
interface TaskPayload {
  token_id: string; // For result correlation
  workflow_run_id: string; // For sub-workflow context
  task_id: string; // TaskDef to execute
  task_version: number;
  input: Record<string, unknown>; // Mapped from workflow context

  // Execution config
  timeout_ms?: number;
  retry_attempt?: number; // Current retry count (for retry logic)
}
```

### TaskResult (to Coordinator)

```typescript
interface TaskResult {
  token_id: string;
  success: boolean;
  output: Record<string, unknown>; // Mapped back to workflow context

  error?: {
    type: 'step_failure' | 'task_timeout' | 'validation_error';
    step_ref?: string; // Which step failed
    message: string;
    retryable: boolean; // Should coordinator retry?
    context_snapshot?: Record<string, unknown>; // For debugging
  };

  metrics: {
    duration_ms: number;
    steps_executed: number;
    llm_tokens?: {
      input: number;
      output: number;
      cost_usd: number;
    };
  };
}
```

## Task Execution Lifecycle

```typescript
async function executeTask(payload: TaskPayload): Promise<TaskResult> {
  const startTime = Date.now();

  try {
    // 1. Load task definition
    const taskDef = await resources.getTaskDef(payload.task_id, payload.task_version);
    const steps = await resources.getSteps(taskDef.id, taskDef.version);

    // 2. Validate input against schema
    validateInput(payload.input, taskDef.input_schema);

    // 3. Initialize task context
    const context = initializeTaskContext(payload.input);

    // 4. Execute steps sequentially
    for (const step of steps.sort((a, b) => a.ordinal - b.ordinal)) {
      // Evaluate condition
      if (step.condition && !evaluateCondition(step.condition, context)) {
        // Handle then/else (skip, continue, succeed, fail)
        const outcome = step.condition.else || 'skip';
        if (outcome === 'skip') continue;
        if (outcome === 'succeed') break;
        if (outcome === 'fail') throw new StepFailureError(step.ref, 'Condition failed');
      }

      try {
        // Load action definition
        const actionDef = await resources.getActionDef(step.action_id, step.action_version);

        // Apply input mapping: task context → action input
        const actionInput = applyMapping(step.input_mapping, context);

        // Execute action
        const actionOutput = await executeAction(actionDef, actionInput);

        // Apply output mapping: action output → task context
        applyMapping(step.output_mapping, context, actionOutput);
      } catch (error) {
        // Handle step failure based on on_failure policy
        if (step.on_failure === 'abort') {
          throw new StepFailureError(step.ref, error.message, true);
        } else if (step.on_failure === 'retry') {
          throw new TaskRetryError(step.ref, error.message);
        } else if (step.on_failure === 'continue') {
          // Log error but continue to next step
          context.state._errors = context.state._errors || [];
          context.state._errors.push({
            step: step.ref,
            error: error.message,
          });
        }
      }
    }

    // 5. Validate output against schema
    validateOutput(context.output, taskDef.output_schema);

    // 6. Return success result
    return {
      token_id: payload.token_id,
      success: true,
      output: context.output,
      metrics: {
        duration_ms: Date.now() - startTime,
        steps_executed: steps.length,
        // LLM metrics aggregated from action executions
      },
    };
  } catch (error) {
    if (error instanceof TaskRetryError) {
      // Signal coordinator to retry entire task
      return {
        token_id: payload.token_id,
        success: false,
        output: {},
        error: {
          type: 'step_failure',
          step_ref: error.stepRef,
          message: error.message,
          retryable: true,
        },
        metrics: { duration_ms: Date.now() - startTime, steps_executed: 0 },
      };
    }

    if (error instanceof StepFailureError) {
      // Non-retryable failure
      return {
        token_id: payload.token_id,
        success: false,
        output: {},
        error: {
          type: 'step_failure',
          step_ref: error.stepRef,
          message: error.message,
          retryable: false,
          context_snapshot: context, // For debugging
        },
        metrics: { duration_ms: Date.now() - startTime, steps_executed: 0 },
      };
    }

    // Unexpected error
    throw error;
  }
}
```

## Task Context

The task context is an in-memory structure that accumulates state across step executions:

```typescript
interface TaskContext {
  input: Record<string, unknown>; // Immutable - from payload
  state: Record<string, unknown>; // Mutable - accumulates step outputs
  output: Record<string, unknown>; // Set by steps, returned to coordinator
}

function initializeTaskContext(input: Record<string, unknown>): TaskContext {
  return {
    input,
    state: {},
    output: {},
  };
}
```

**Key characteristics:**

- **Ephemeral** - Lives only during task execution, discarded after
- **No persistence** - Never written to database or DO storage
- **Linear accumulation** - Each step reads from and writes to `state`
- **Fast** - Plain JavaScript object, no SQL or serialization

**Example evolution:**

```typescript
// Initial state
{ input: { user_id: 123 }, state: {}, output: {} }

// After step 1 (fetch_user)
{ input: { user_id: 123 }, state: { user: { name: "Alice" } }, output: {} }

// After step 2 (validate_user)
{ input: { user_id: 123 }, state: { user: {...}, valid: true }, output: {} }

// After step 3 (format_output)
{ input: { user_id: 123 }, state: {...}, output: { result: "Alice is valid" } }
```

## Action Execution

Actions are executed via a handler registry that dispatches to type-specific implementations:

```typescript
async function executeAction(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Validate input against action schema
  validateInput(input, actionDef.requires);

  // Get handler for action kind
  const handler = actionRegistry.get(actionDef.kind);
  if (!handler) {
    throw new Error(`Unknown action kind: ${actionDef.kind}`);
  }

  // Execute with timeout
  const timeoutMs = actionDef.execution?.timeout_ms || 60000;
  const output = await executeWithTimeout(() => handler.execute(actionDef, input), timeoutMs);

  // Validate output against action schema
  validateOutput(output, actionDef.produces);

  return output;
}
```

### Action Handlers

Each action kind has a dedicated handler:

#### llm_call

```typescript
async function executeLLMCall(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { prompt_spec_id, model_profile_id } = actionDef.implementation;

  // Load prompt template and model config
  const promptSpec = await resources.getPromptSpec(prompt_spec_id);
  const modelProfile = await resources.getModelProfile(model_profile_id);

  // Render prompt template with input
  const messages = await templates.render(promptSpec.template, input);

  // Call LLM provider
  const provider = llmProviders.get(modelProfile.provider);
  const response = await provider.complete({
    model: modelProfile.model_id,
    messages,
    ...modelProfile.parameters,
  });

  // Parse structured output if schema defined
  const output = promptSpec.produces
    ? parseStructuredOutput(response.content, promptSpec.produces)
    : { content: response.content };

  return {
    ...output,
    _meta: {
      tokens: { input: response.usage.input, output: response.usage.output },
      cost_usd: calculateCost(response.usage, modelProfile),
    },
  };
}
```

#### mcp_tool

```typescript
async function executeMCPTool(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { mcp_server_id, tool_name } = actionDef.implementation;

  // Get MCP server config from workspace settings
  const serverConfig = await resources.getMCPServerConfig(mcp_server_id);

  // Initialize MCP client (or reuse from pool)
  const client = await mcpClient.connect(serverConfig);

  // Invoke tool
  const result = await client.callTool(tool_name, input);

  return result;
}
```

#### http_request

```typescript
async function executeHTTPRequest(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { url_template, method, headers, body_template } = actionDef.implementation;

  // Render URL template
  const url = await templates.render(url_template, input);

  // Render body template if provided
  const body = body_template ? await templates.render(body_template, input) : undefined;

  // Make HTTP request
  const response = await fetch(url, {
    method,
    headers: headers || {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new HTTPError(response.status, await response.text());
  }

  const data = await response.json();
  return { response: data, status: response.status };
}
```

#### update_context

```typescript
async function executeUpdateContext(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { updates } = actionDef.implementation;

  const result: Record<string, unknown> = {};

  for (const update of updates) {
    // Evaluate expression against input
    const value = evaluateExpression(update.expr, input);

    // Set value at path
    result[update.path] = value;
  }

  return result;
}
```

#### workflow_call

```typescript
async function executeWorkflowCall(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { workflow_def_id, version, on_failure } = actionDef.implementation;

  // Resolve workflow_def_id if dynamic
  const workflowDefId =
    typeof workflow_def_id === 'string' ? workflow_def_id : input[workflow_def_id.from_context];

  // Call coordinator to start sub-workflow
  const result = await coordinator.startSubWorkflow({
    parent_workflow_run_id: input._workflow_run_id,
    parent_token_id: input._token_id,
    workflow_def_id: workflowDefId,
    version: version || null,
    input,
  });

  // Handle failure based on policy
  if (!result.success && on_failure === 'propagate') {
    throw new WorkflowCallError(workflowDefId, result.error);
  }

  return result.output;
}
```

## Context Mapping

Mappings use JSONPath expressions to read from and write to context:

```typescript
function applyMapping(
  mapping: Record<string, string> | null,
  context: TaskContext,
  source?: Record<string, unknown>,
): Record<string, unknown> {
  if (!mapping) return {};

  const result: Record<string, unknown> = {};

  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    // Read from source using JSONPath
    const value = source
      ? jsonPath.query(source, sourcePath)[0]
      : jsonPath.query(context, sourcePath)[0];

    // Write to result
    result[targetKey] = value;
  }

  return result;
}
```

**Example:**

```typescript
// Step input_mapping
{
  "user_id": "$.input.user_id",
  "include_history": "$.state.config.history_enabled"
}

// Reads from task context and produces action input
{
  user_id: 123,
  include_history: true
}

// Step output_mapping
{
  "state.user_data": "$.user",
  "state.last_updated": "$.timestamp"
}

// Writes action output to task context.state
context.state.user_data = actionOutput.user;
context.state.last_updated = actionOutput.timestamp;
```

## Condition Evaluation

Step conditions are evaluated against task context using expression syntax:

```typescript
function evaluateCondition(condition: StepCondition, context: TaskContext): boolean {
  // Parse and evaluate expression
  const result = evaluateExpression(condition.if, context);

  return Boolean(result);
}

function evaluateExpression(expr: string, context: TaskContext): unknown {
  // TODO: Decision needed - expression language choice
  // Options:
  // 1. CEL (Common Expression Language)
  // 2. JSONLogic
  // 3. Simple comparison parser
  // 4. JavaScript subset (safe-eval)

  // Placeholder: Simple field access and comparison
  return simpleParse(expr, context);
}
```

**TODO: Expression language decision**

We need to decide on the expression evaluation engine. Requirements:

- Safe (no arbitrary code execution)
- Fast (evaluated per-step)
- Expressive (comparisons, boolean logic, field access)
- Cloudflare Workers compatible (no eval, no VM)

Options:

1. **CEL** - Google's Common Expression Language (safe, expressive, proven)
2. **JSONLogic** - JSON-based logic representation (portable, limited)
3. **Custom parser** - Simple comparison syntax (lightweight, limited)

## Retry Handling

Task-level retries are handled by the coordinator, but the worker signals retry intent:

```typescript
class TaskRetryError extends Error {
  constructor(
    public stepRef: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskRetryError';
  }
}

// When step fails with on_failure: 'retry'
throw new TaskRetryError(step.ref, 'Database connection failed');

// Worker returns retryable error
return {
  token_id: payload.token_id,
  success: false,
  error: {
    type: 'step_failure',
    step_ref: 'fetch_data',
    message: 'Database connection failed',
    retryable: true, // Coordinator will retry entire task
  },
};
```

**Retry behavior:**

1. Worker detects step failure with `on_failure: 'retry'`
2. Worker aborts task execution, returns `retryable: true`
3. Coordinator checks TaskDef retry policy
4. If retry budget remaining, coordinator dispatches new task with incremented `retry_attempt`
5. Worker receives fresh payload, resets context, starts from step 0

**Context on retry:**

- Task context is **NOT preserved** across retries
- Each retry starts with fresh `{ input, state: {}, output: {} }`
- This ensures idempotency and avoids partial state corruption

## Timeout Handling

### Task-level Timeout

Enforced by Cloudflare Workers platform (max 30s for free, 15min for paid):

```typescript
// In coordinator dispatch
const timeoutMs = taskDef.timeout_ms || 60000;

// Cloudflare Workers runtime will kill task if exceeds limit
// No graceful shutdown - task simply terminates
// Coordinator detects timeout via missing response
```

### Action-level Timeout

Enforced by Executor with AbortController:

```typescript
async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fn();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**TODO: Cancellation protocol**

Currently no way for coordinator to cancel in-flight tasks. Future enhancement:

- Coordinator sends cancellation message via Durable Object stub
- Executor checks cancellation flag between steps
- Executor aborts current action if cancellable

## Error Classification

Errors are classified to determine retry eligibility:

```typescript
function isRetryable(error: Error): boolean {
  // Network errors - retry
  if (error instanceof NetworkError) return true;
  if (error instanceof TimeoutError) return true;

  // Provider rate limits - retry with backoff
  if (error instanceof RateLimitError) return true;

  // Provider errors (5xx) - retry
  if (error instanceof ProviderError && error.status >= 500) return true;

  // Validation errors - don't retry (won't fix itself)
  if (error instanceof ValidationError) return false;

  // Auth errors - don't retry
  if (error instanceof AuthError) return false;

  // Unknown errors - don't retry (fail fast)
  return false;
}
```

**Note:** Step-level `on_failure` policy overrides this. If step says `retry`, worker signals retry regardless of error type.

## Observability

### Event Emission

The Executor emits events for key execution points:

```typescript
// Task lifecycle
events.emit({
  type: 'task_started',
  token_id: payload.token_id,
  task_id: payload.task_id,
  retry_attempt: payload.retry_attempt,
});

events.emit({
  type: 'task_completed',
  token_id: payload.token_id,
  duration_ms: metrics.duration_ms,
  steps_executed: metrics.steps_executed,
});

// Step execution
events.emit({
  type: 'step_started',
  token_id: payload.token_id,
  step_ref: step.ref,
  action_id: step.action_id,
});

events.emit({
  type: 'step_completed',
  token_id: payload.token_id,
  step_ref: step.ref,
  duration_ms: stepDuration,
});

// Action execution (for LLM calls)
events.emit({
  type: 'llm_call_completed',
  token_id: payload.token_id,
  model: modelProfile.model_id,
  tokens: { input: usage.input, output: usage.output },
  cost_usd: cost,
});
```

Events are sent to Events Service via RPC (same as coordinator).

### Metrics

The Executor tracks and returns metrics:

```typescript
interface TaskMetrics {
  duration_ms: number;
  steps_executed: number;
  llm_tokens?: {
    input: number;
    output: number;
    cost_usd: number;
  };
}
```

Metrics are included in TaskResult for coordinator to aggregate and emit.

## Integration Points

### Resources Service

```typescript
// Load task and action definitions
const taskDef = await env.RESOURCES.getTaskDef(task_id, version);
const steps = await env.RESOURCES.getSteps(task_id, version);
const actionDef = await env.RESOURCES.getActionDef(action_id, version);

// Load prompt templates and model profiles
const promptSpec = await env.RESOURCES.getPromptSpec(prompt_spec_id);
const modelProfile = await env.RESOURCES.getModelProfile(model_profile_id);

// Load MCP server configs
const mcpConfig = await env.RESOURCES.getMCPServerConfig(mcp_server_id);
```

### Coordinator

```typescript
// Start sub-workflow
const result = await env.COORDINATOR.startSubWorkflow({
  parent_workflow_run_id,
  parent_token_id,
  workflow_def_id,
  version,
  input,
});
```

### LLM Providers

```typescript
// Anthropic
const response = await anthropicClient.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [...],
  temperature: 0.7
});

// OpenAI
const response = await openaiClient.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  temperature: 0.7
});

// Cloudflare Workers AI
const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
  messages: [...]
});
```

### MCP Servers

```typescript
// MCP client via stdio or HTTP
const client = await mcpClient.connect({
  command: serverConfig.command,
  args: serverConfig.args,
  env: serverConfig.env,
});

const result = await client.callTool(tool_name, args);
```

### Template Service

```typescript
// Render Handlebars template with context
const rendered = await env.TEMPLATES.render(template_id, context);
```

## Design Decisions

### Stateless vs Stateful

**Decision: Stateless Cloudflare Worker**

Rationale:

- Tasks are short-lived (seconds to minutes)
- No benefit to persistent state across tasks
- Cloudflare auto-scales stateless workers
- Simpler failure model (just retry)

Alternative considered: Durable Object per task

- Rejected: Overhead of DO creation per task
- Rejected: DO SQLite unnecessary for ephemeral state

### In-Memory Context vs SQL

**Decision: In-memory JavaScript object**

Rationale:

- Task context is ephemeral (discarded after task)
- Steps execute sequentially (no concurrency)
- No need for SQL queries or transactions
- Fast accumulation without serialization

Alternative considered: SQLite in worker

- Rejected: Unnecessary complexity
- Rejected: Slower than plain objects for this use case

### Retry at Task Level vs Step Level

**Decision: Task-level only**

Rationale:

- Simpler failure model (restart from beginning)
- Avoids partial state corruption
- Clear semantics (idempotent retry)
- Step `on_failure: 'retry'` signals task retry

Alternative considered: Step-level retry with state preservation

- Rejected: Complex partial state management
- Rejected: Harder to reason about idempotency

### Action Handler Pattern

**Decision: Registry with type-specific handlers**

Rationale:

- Clean separation of action execution logic
- Easy to add new action kinds
- Testable in isolation
- Follows single responsibility principle

Alternative considered: Monolithic switch statement

- Rejected: Grows unwieldy with many action types
- Rejected: Harder to test and maintain

## Open Questions

### 1. Expression Language Choice

**TODO:** Decide on expression evaluation engine for conditions and context updates.

Options:

- **CEL** - Rich, safe, proven (used by Kubernetes, Google APIs)
- **JSONLogic** - Simple, portable, limited expressiveness
- **Custom** - Lightweight, limited to our exact needs

Recommendation: Start with CEL, provides good balance of safety and power.

### 2. MCP Client Lifecycle

**TODO:** How to manage MCP server connections?

Options:

- **Per-task** - Connect and disconnect for each MCP action
- **Pooled** - Maintain connection pool across worker invocations
- **Singleton** - One persistent client per MCP server

Recommendation: Per-task for simplicity initially, optimize to pooled if connection overhead is significant.

### 3. LLM Provider Caching

**TODO:** Should Executor cache provider clients?

Currently: Create new client per LLM action
Alternative: Cache clients by provider + credentials

Recommendation: Cache clients in Executor global scope, reuse across tasks.

### 4. Template Rendering

**TODO:** In-worker template rendering vs dedicated service?

Options:

- **In-worker** - Bundle `@wonder/templates` package
- **Service** - Separate Templates Worker/DO

Current plan: In-worker (referenced in code above), but reconsider if template complexity grows.

### 5. Structured Output Parsing

**TODO:** How to parse LLM structured output?

Options:

- **JSON mode** - Provider native (OpenAI, Anthropic)
- **Schema validation** - Parse and validate against JSONSchema
- **Retry on invalid** - Re-prompt if parsing fails

Recommendation: Use provider native JSON mode when available, fall back to schema validation + retry.

### 6. Sub-workflow Blocking

**TODO:** Should `workflow_call` actions block until sub-workflow completes?

Current design: Yes (synchronous RPC to coordinator)
Alternative: Async dispatch, token waits for callback

Implications:

- **Sync**: Simple, but long-running sub-workflows block worker
- **Async**: Complex, but worker is freed for other tasks

Recommendation: Start with sync for simplicity, measure if worker blocking becomes issue.

## Future Enhancements

### Streaming Results

Stream step outputs back to coordinator as they complete (for long-running tasks):

```typescript
// Executor streams events
events.emit({ type: 'step_completed', step_ref: 'step1', output: {...} });
events.emit({ type: 'step_completed', step_ref: 'step2', output: {...} });

// Coordinator receives partial results in real-time
// Enables UI progress updates during task execution
```

### Parallel Steps

Allow tasks to define parallel step groups:

```typescript
TaskDef {
  steps: [
    { ordinal: 0, ref: 'fetch_a' },
    { ordinal: 0, ref: 'fetch_b' },  // Same ordinal = parallel
    { ordinal: 1, ref: 'merge' }     // Depends on both
  ]
}
```

Requires worker to:

- Group steps by ordinal
- Execute groups in parallel (Promise.all)
- Merge outputs before next group

### Step-level Timeout

Per-step timeout configuration:

```typescript
Step {
  timeout_ms: 5000,  // Individual step timeout
  on_timeout: 'retry' | 'continue' | 'abort'
}
```

### Conditional Retry

Retry policy based on error type:

```typescript
TaskDef {
  retry: {
    max_attempts: 3,
    on_error: {
      'NetworkError': { max_attempts: 5, backoff: 'exponential' },
      'RateLimitError': { max_attempts: 10, backoff: 'exponential' },
      'ValidationError': { max_attempts: 0 }  // Don't retry
    }
  }
}
```

### Action Result Caching

Cache idempotent action results (e.g., LLM calls with fixed prompts):

```typescript
ActionDef {
  idempotency: {
    key_template: 'llm:{{model}}:{{prompt_hash}}',
    ttl_seconds: 3600
  }
}
```

Executor checks cache before execution, skips if cached.
