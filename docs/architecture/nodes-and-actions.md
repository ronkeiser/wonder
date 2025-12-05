# Nodes and Actions

## Overview

Nodes are execution points in a workflow graph. They represent where work happens or where control flow decisions are made. Nodes are connected by transitions which define the flow of execution tokens through the workflow.

## Node Types

### Nodes with Actions

Most nodes execute an **action** - a reusable unit of work with inputs and outputs. Actions are versioned, composable, and testable.

```typescript
{
  ref: 'generate_content',
  name: 'Generate Content',
  action_id: 'llm-generation',
  action_version: 1,
  input_mapping: {
    topic: '$.input.topic',
    style: '$.config.writing_style'
  },
  output_mapping: {
    content: '$.response.text',
    word_count: '$.response.metadata.words'
  }
}
```

**When to use:** Any node that performs work - LLM calls, API requests, transformations, etc.

### Nodes without Actions

Nodes can omit the `action_id` field entirely. These nodes complete immediately with empty output and serve as **pure control flow markers**.

```typescript
{
  ref: 'start',
  name: 'Start'
  // No action_id - this is just an entry point
}
```

**When to use:**

- Entry points (start nodes)
- Synchronization points (fan-in merge points)
- Terminal nodes (exit points)
- Pure routing decisions (where transitions handle all logic)

## Architecture Philosophy

### Separation of Concerns

**Nodes = Execution | Transitions = Control Flow**

This design keeps:

- **Nodes** focused on doing work
- **Transitions** focused on routing, branching, conditions, synchronization

This is cleaner than fork/join node patterns where nodes do both work AND control flow.

### Comparison to Other Approaches

#### Fork/Join Nodes (Airflow, Temporal)

```
[work] → [fork] → [work] → [join] → [work]
                → [work] →
```

- Explicit fork/join nodes in the graph
- Mixes control flow into node semantics
- More verbose

#### Transition-Oriented (Wonderful)

```
[work] → spawn_count=2 → [work] → wait_for=all → [work]
```

- Control flow on transitions
- Nodes stay focused on work
- More declarative

## Action Types

### Current Action Types

- `llm_call` - LLM inference with prompt + model
- `mcp_tool` - MCP tool invocation
- `http_request` - HTTP API calls
- `human_input` - Wait for human interaction
- `update_context` - Modify workflow context
- `write_artifact` - Persist data as artifacts
- `workflow_call` - Invoke sub-workflows
- `vector_search` - Semantic search operations
- `emit_metric` - Emit observability metrics

### Future: Data Transformation Actions

Currently missing: lightweight data transformation capabilities.

**Problem:** If a node has no action, it can extract data via `input_mapping` but cannot transform it. This limits pure data manipulation tasks like:

- Combining fields: `firstName + " " + lastName → fullName`
- Type conversion: `"123" → 123`
- Array operations: filter, map, reduce
- Conditional logic: `count > 10 → needsApproval = true`

**Solution Options:**

#### Option 1: Pure Mapping Functions (Recommended)

Add `json_transform` action using JSONata or similar:

```typescript
{
  ref: 'format_user',
  name: 'Format User Data',
  action_id: 'user-formatter',
  action_version: 1,
  kind: 'json_transform',
  implementation: {
    expression: `{
      "fullName": firstName & " " & lastName,
      "age": $number(ageString),
      "email": $lowercase(email)
    }`
  }
}
```

**Pros:**

- No code execution, just expressions
- Fast, predictable, sandboxed
- Familiar (used in Node-RED, AWS Step Functions)
- Easy to validate and test

**Cons:**

- Limited to expression language capabilities
- Learning curve for expression syntax

#### Option 2: JavaScript Functions

Allow sandboxed JS execution:

```typescript
{
  kind: 'javascript',
  implementation: {
    code: 'return { fullName: input.firstName + " " + input.lastName }',
    timeout_ms: 100
  }
}
```

**Pros:**

- Maximum flexibility
- Familiar language

**Cons:**

- Security/sandboxing complexity
- Harder to reason about
- Performance concerns

#### Option 3: Specialized Actions

Create specific action types: `set_variables`, `filter_array`, `transform_json`, etc.

**Pros:**

- Clear intent for each operation
- Type-safe implementations

**Cons:**

- Proliferation of action types
- Less flexible

## Input/Output Mapping

All nodes (with or without actions) can have `input_mapping` and `output_mapping`.

### Input Mapping

Extracts data from workflow context to build action input:

```typescript
input_mapping: {
  // Variable name → JSONPath in context
  topic: '$.input.topic',           // From workflow input
  style: '$.config.style',          // From earlier node output
  previousText: '$.draft_node.text' // From specific node
}
```

### Output Mapping

Maps action output to context paths:

```typescript
output_mapping: {
  // Context path ← Field in action output
  content: '$.response.text',
  metadata: '$.response.metadata'
}
```

Stored at `$.{node_ref}.{key}` in context, e.g., `$.generate_node.content`.

### Mapping for Nodes without Actions

Nodes without actions still support mapping, though it's limited:

- `input_mapping` - Extracts values (but action doesn't use them)
- `output_mapping` - Maps from empty `{}` output

This is mostly vestigial. For actual data transformation, use a transform action.

## Design Principles

1. **Nodes without actions = pure routing** - Keep them lightweight
2. **Actions should be pure** - Given inputs, produce outputs deterministically
3. **Transitions handle control flow** - spawn_count, conditions, synchronization
4. **Context is immutable** - Nodes write new data, don't mutate existing
5. **Mappings are declarative** - No complex logic, just path expressions

## Examples

### Simple LLM Pipeline

```typescript
nodes: [
  { ref: 'start', name: 'Start' }, // No action
  {
    ref: 'generate',
    name: 'Generate',
    action_id: 'llm-call',
    output_mapping: { text: '$.response' },
  },
  { ref: 'end', name: 'End' }, // No action
];
```

### Fan-out with Merge

```typescript
nodes: [
  { ref: 'start', name: 'Start' },
  {
    ref: 'generate_ideas',
    name: 'Generate Ideas',
    action_id: 'llm-call',
  },
  { ref: 'merge', name: 'Merge Point' }, // No action - just sync
];
transitions: [
  {
    from: 'start',
    to: 'generate_ideas',
    spawn_count: 3, // Fan out
  },
  {
    from: 'generate_ideas',
    to: 'merge',
    synchronization: {
      wait_for: 'all',
      joins_transition: 'start_to_generate',
      merge: {
        source: '*.idea',
        target: '$.all_ideas',
        strategy: 'array',
      },
    },
  },
];
```

## See Also

- [Execution Model](execution.md) - How tokens move through nodes
- [Branching Architecture](branching.md) - Fan-out/fan-in patterns
- [Context Management](context.md) - Workflow state management
