# Actions

## Overview

Actions are the atomic operations that steps execute. Each action has a **kind** that determines its capabilities and resource requirements, and an **operation** that specifies what it does within that kind.

## Kind + Operation Model

Actions are identified by kind and operation:

```
kind: 'shell' | 'llm' | 'mcp' | 'http' | 'context' | 'artifact' | 'memory' | 'metric' | 'human' | 'mock'
operation: string  // varies by kind
```

The kind determines:
- What context is required (if any)
- What operations are available
- How `implementation` is validated

The operation specifies the specific behavior within that kind.

## Context Requirements

Some action kinds require specific context to execute:

| Kind       | Required Context | How Provided                              |
| ---------- | ---------------- | ----------------------------------------- |
| `shell`    | Repo + Branch    | From workflow/agent context automatically |
| `artifact` | Project          | From workflow/agent context automatically |
| `memory`   | Agent            | From agent context automatically          |

Actions without required context will fail at execution time.

## Action Kinds

### shell

Executes commands in a container. Requires repo + branch context.

| Operation | Purpose                    |
| --------- | -------------------------- |
| `exec`    | Run command, capture output |

The executor resolves repo + branch from workflow or agent context. Container allocation is handled by the container pool—no ownership semantics.

### llm

Calls a language model.

| Operation  | Purpose                              |
| ---------- | ------------------------------------ |
| `generate` | Generate text/structured output      |
| `embed`    | Generate embeddings (if needed here) |

### mcp

Invokes an MCP server tool.

| Operation | Purpose                |
| --------- | ---------------------- |
| `invoke`  | Call tool, get result  |

### http

Makes HTTP requests to external APIs.

| Operation | Purpose          |
| --------- | ---------------- |
| `request` | Execute HTTP call |

### context

Transforms workflow context data. Pure functions, no side effects.

| Operation   | Purpose                          |
| ----------- | -------------------------------- |
| `transform` | Apply JSONPath/CEL transformations |
| `validate`  | Validate against schema          |

### artifact

Operates on project artifacts. Requires project context. Handles file storage (R2 + git), metadata indexing (D1), and semantic search (Vectorize) atomically.

| Operation | Purpose                                    |
| --------- | ------------------------------------------ |
| `read`    | Read artifact content by path              |
| `write`   | Write artifact (file + index + embed)      |
| `search`  | Semantic search over artifacts             |
| `list`    | List artifacts by metadata query           |
| `delete`  | Remove artifact                            |

### memory

Operates on agent memory. Requires agent context (provided automatically when workflows run on behalf of an agent). Handles file storage (R2 + git), metadata indexing (D1), and semantic search (Vectorize) atomically.

| Operation | Purpose                                    |
| --------- | ------------------------------------------ |
| `read`    | Read memory content by key                 |
| `write`   | Write memory (file + index + embed)        |
| `search`  | Semantic search over memories              |
| `list`    | List memories by metadata query            |
| `delete`  | Remove memory                              |

Memory is private to the agent. Cross-agent memory access is not supported.

### metric

Records metrics to Analytics Engine.

| Operation | Purpose              |
| --------- | -------------------- |
| `record`  | Write metric data    |

### human

Pauses for human input.

| Operation | Purpose                          |
| --------- | -------------------------------- |
| `input`   | Wait for user-provided value     |
| `approve` | Wait for approval (yes/no)       |
| `review`  | Wait for review with feedback    |

### mock

Test stub with predefined responses.

| Operation | Purpose                      |
| --------- | ---------------------------- |
| `return`  | Return configured response   |

## Implementation Schema

The `implementation` field is validated based on kind + operation:

```typescript
// shell.exec
{
  kind: 'shell',
  operation: 'exec',
  implementation: {
    command_template: 'pnpm test {{pattern}}',
    working_dir: null
  }
}
```

Note: `shell.exec` no longer specifies `resource_name`. Repo and branch come from execution context (workflow or agent).

```typescript
// artifact.search
{
  kind: 'artifact',
  operation: 'search',
  implementation: {
    query: '{{input.question}}',
    top_k: 10,
    filters: { type: 'decision' }
  }
}

// memory.write
{
  kind: 'memory',
  operation: 'write',
  implementation: {
    key: '{{state.memory_key}}',
    content: '{{state.extracted_fact}}',
    metadata: { category: 'fact', source_turn: '{{input.turn_id}}' }
  }
}

// llm.generate
{
  kind: 'llm',
  operation: 'generate',
  implementation: {
    prompt_spec_id: 'prompt_analyze_code',
    model: 'claude-sonnet',
    output_schema: { type: 'object', properties: { ... } }
  }
}
```

## Execution Flow

1. Executor receives task with steps and context (including repo + branch)
2. For each step, resolve the action's kind and operation
3. Check context requirements — fail if missing
4. Validate `implementation` against kind+operation schema
5. Execute the operation (shell actions use container pool)
6. Apply output mapping to task context

## Adding New Actions

To add a new action kind or operation:

1. Add to the kind enum in schema
2. Define operations for the kind
3. Define `implementation` schema per operation
4. Implement handler in Executor
5. Document context requirements
