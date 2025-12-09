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
│   ├── llm.ts                  # LLM inference handler
│   ├── mcp.ts                  # MCP tool invocation handler
│   ├── http.ts                 # HTTP API call handler
│   ├── tool.ts                 # Standard library tool handler
│   ├── shell.ts                # Raw shell command handler
│   ├── workflow.ts             # Sub-workflow invocation handler
│   ├── context.ts              # Context manipulation handler
│   ├── vector.ts               # Vector search handler
│   ├── metric.ts               # Metrics emission handler
│   └── human.ts                # Human input gate handler
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

  // Resource mappings (generic_name → container_do_id)
  // Resolved from Node.resource_bindings → WorkflowDef.resources
  // e.g., { "container": "do-abc123", "build_env": "do-xyz789" }
  resources?: Record<string, string>;

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
    const context = initializeTaskContext(payload.input, payload);

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

function initializeTaskContext(input: Record<string, unknown>, payload: TaskPayload): TaskContext {
  return {
    input: {
      ...input,
      _workflow_run_id: payload.workflow_run_id,
      _token_id: payload.token_id,
      _resources: payload.resources || {},
    },
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

  // Execute with infrastructure retry and timeout
  const retryPolicy = actionDef.execution?.retry_policy;
  const timeoutMs = actionDef.execution?.timeout_ms || 60000;

  const output = await executeWithRetry(
    () => executeWithTimeout(() => handler.execute(actionDef, input), timeoutMs),
    retryPolicy,
  );

  // Validate output against action schema
  validateOutput(output, actionDef.produces);

  return output;
}

async function executeWithRetry<T>(fn: () => Promise<T>, policy: RetryPolicy | null): Promise<T> {
  if (!policy) return fn();

  let lastError: Error;
  for (let attempt = 0; attempt < policy.max_attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Only retry infrastructure errors, not business errors
      if (!isInfrastructureError(error)) throw error;

      if (attempt < policy.max_attempts - 1) {
        const delay = calculateBackoff(attempt, policy);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

function isInfrastructureError(error: Error): boolean {
  return (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof RateLimitError ||
    (error instanceof ProviderError && error.status >= 500)
  );
}
```

### Action Handlers

Each action kind has a dedicated handler:

#### llm

```typescript
async function executeLLM(
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

#### mcp

```typescript
async function executeMCP(
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

#### http

```typescript
async function executeHTTP(
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

#### context

```typescript
async function executeContext(
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

#### tool

```typescript
async function executeTool(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { tool_name, tool_version } = actionDef.implementation;

  // Load tool definition from standard library
  const toolDef = await resources.getTool(tool_name, tool_version);

  // Validate input against tool schema
  validateInput(input, toolDef.input_schema);

  // Get container if tool requires one
  let containerStub = null;
  if (toolDef.requires_resource) {
    const containerId = input._resources[toolDef.requires_resource];
    if (!containerId) {
      throw new Error(
        `Tool '${tool_name}' requires resource '${toolDef.requires_resource}' but it was not provided`,
      );
    }
    containerStub = env.CONTAINERS.get(env.CONTAINERS.idFromString(containerId));
  }

  // Execute tool-specific handler
  const handler = toolRegistry.get(tool_name);
  if (!handler) {
    throw new Error(`Unknown tool: ${tool_name}`);
  }

  const result = await handler.execute({
    container: containerStub,
    input,
    toolDef,
  });

  // Validate output
  validateOutput(result, toolDef.output_schema);

  return result;
}
```

**Standard Library Tools:**

```typescript
// Git operations
- git_commit: { message: string, files?: string[], author?: string }
- git_push: { remote?: string, branch?: string }
- git_merge: { source_branch: string, strategy: 'rebase' | 'merge' | 'squash' }
- git_status: { }

// Artifact management
- write_artifact: { path: string, content: string, artifact_type_id?: string, commit_message?: string }
- read_artifact: { path: string }
- list_artifacts: { pattern?: string, artifact_type_id?: string }

// Testing
- run_tests: { pattern?: string, framework?: string }
- run_lint: { fix?: boolean }
- run_build: { target?: string }

// File operations
- write_file: { path: string, content: string }
- read_file: { path: string }
- list_files: { pattern?: string }
- delete_file: { path: string }

// Package management
- install_packages: { packages: string[] }
- update_dependencies: { }
```

#### shell

```typescript
async function executeShell(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { command_template, working_dir, resource_name } = actionDef.implementation;

  // Get container from resources using generic name
  const containerId = input._resources[resource_name || 'container'];
  if (!containerId) {
    throw new Error(`Resource '${resource_name || 'container'}' not found in available resources`);
  }

  // Render command template with input
  const renderedCommand = await templates.render(command_template, input);

  // Call container DO to execute command
  const containerStub = env.CONTAINERS.get(env.CONTAINERS.idFromString(containerId));
  const result = await containerStub.exec(input._workflow_run_id, renderedCommand, {
    cwd: working_dir || '/workspace',
    timeout: actionDef.execution?.timeout_ms || 60000,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exit_code: result.exit_code,
  };
}
```

**Note:** Container execution happens through the Containers service. Each container is a Durable Object that validates ownership and forwards commands to the container's shell server. See [Containers](./containers.md) for details.

### Resource Resolution Flow

Resources flow from workflow definition to action execution through multiple layers:

1. **WorkflowDef** declares resources with IDs:

   ```typescript
   resources: {
     "dev_env": { type: "container", image: "node:20", ... },
     "build_env": { type: "container", image: "python:3.11", ... }
   }
   ```

2. **Node** binds generic names to workflow resource IDs:

   ```typescript
   resource_bindings: {
     "container": "dev_env",      // This node uses dev_env
     "build_env": "build_env"     // Pass through if needed
   }
   ```

3. **Coordinator** resolves to container DO IDs when dispatching:

   ```typescript
   // Look up Container DO ID for each resource
   const containerDoId = await getContainerForResource(workflow_run_id, 'dev_env');

   payload.resources = {
     container: 'do-abc123...',
     build_env: 'do-xyz789...',
   };
   ```

4. **Action/Tool** uses generic name:

   ```typescript
   // shell action with resource_name: "container"
   const containerId = input._resources['container'];

   // git_commit tool with requires_resource: "container"
   const containerId = input._resources[toolDef.requires_resource];
   ```

**Benefits:**

- Actions and tools are reusable (no hardcoded resource IDs)
- Node is the binding point (workflow-specific mapping)
- Type safety (coordinator validates bindings exist)
- Flexibility (same task can use different containers in different workflows)

#### workflow

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

#### human

```typescript
async function executeHuman(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { prompt_template, input_schema, timeout_ms } = actionDef.implementation;

  // Render prompt template
  const renderedPrompt = await templates.render(prompt_template, input);

  // Create human gate via coordinator (async - doesn't wait for response)
  const gateId = await coordinator.createHumanGate({
    workflow_run_id: input._workflow_run_id,
    token_id: input._token_id,
    prompt: renderedPrompt,
    input_schema,
    timeout_ms,
  });

  // Return immediately - coordinator will pause token and resume when human responds
  // The human's response will be available in workflow context when execution resumes
  return {
    gate_id: gateId,
    status: 'awaiting_human_input',
  };
}
```

**Note:** Human input creates an async gate in the workflow. Unlike other actions that block until complete, the human action:

1. Signals the coordinator to create a human gate
2. Returns immediately with `gate_created` status
3. Coordinator transitions token to `awaiting_human_input` state
4. Task completes and worker is released
5. When human responds, coordinator resumes workflow at next node with human's input

This async behavior allows tasks with human actions to complete quickly while the workflow pauses. Primarily used for workflow-level approval gates, not inline task decisions that need immediate responses.

#### vector

```typescript
async function executeVector(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { index_id, query_text, top_k, filter } = actionDef.implementation;

  // Generate embedding for query
  const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: query_text,
  });

  // Query Vectorize index
  const results = await env.VECTORIZE.query(index_id, {
    vector: embedding.data[0],
    topK: top_k || 10,
    filter: filter || {},
  });

  return {
    results: results.matches.map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata,
    })),
  };
}
```

**Note:** Vector search uses Cloudflare Vectorize for semantic search over embeddings. Indexes are populated separately (e.g., during codebase ingestion). See context management in [Agent Environment](./agent-environment.md).

#### metric

```typescript
async function executeMetric(
  actionDef: ActionDef,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { metric_name, value, dimensions } = actionDef.implementation;

  // Evaluate value (may be expression)
  const metricValue = typeof value === 'number' ? value : evaluateExpression(value.expr, input);

  // Write to Analytics Engine
  await env.ANALYTICS_ENGINE.writeDataPoint({
    blobs: [metric_name],
    doubles: [metricValue],
    indexes: dimensions ? Object.entries(dimensions) : [],
  });

  return { metric_name, value: metricValue };
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
  // Use CEL (Common Expression Language) for safe expression evaluation
  const celEnv = createCELEnvironment(context);
  const result = celEnv.evaluate(expr);
  return result;
}
```

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
  type: 'llm_completed',
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
