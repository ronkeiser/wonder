# .wflow — Workflow Definition DSL

A declarative DSL for defining Wonder workflows with IDE-powered validation. Files use the `.wflow` extension and are validated in real-time via Language Server Protocol.

## Motivation

Workflow definitions have a graph structure: **nodes** define mappings between workflow context and task I/O, while **transitions** determine execution order and control flow. This creates a validation challenge—when a node's `input_mapping` references `$.state.scores`, we need to verify that some predecessor node's `output_mapping` actually writes to that path.

TypeScript's type system can validate individual mappings, but graph-aware data flow analysis requires understanding the full topology. A custom DSL with LSP support provides:

- **Real-time diagnostics** as you type (not after `tsc`)
- **Graph-aware validation** ("this path may not be written when this node executes")
- **Domain-specific errors** instead of cryptic type errors
- **Autocomplete** for JSONPath expressions, node references, task references
- **Hover documentation** showing types and data flow

---

## File Format

The `.wflow` format is a direct YAML representation of the primitives defined in [primitives.md](./primitives.md).

### Basic Structure

```yaml
# workflows/ideation-pipeline.wflow

workflow: ideation-pipeline
version: 1
description: Generate and rank ideas

input_schema:
  type: object
  properties:
    topic: { type: string }
    count: { type: integer }
  required: [topic, count]

context_schema:
  type: object
  properties:
    ideas: { type: array, items: { type: string } }
    scores: { type: array, items: { type: number } }

output_schema:
  type: object
  properties:
    winner: { type: string }
    confidence: { type: number }
  required: [winner]

resources:
  dev_env:
    type: container
    image: 'node:20'
    repo_id: '@project/main'
    base_branch: main
    merge_on_success: true
    merge_strategy: rebase

nodes:
  ideate:
    ref: ideate
    name: Generate Ideas
    task_id: '@library/ideation/generate'
    task_version: 2
    input_mapping:
      topic: '$.input.topic'
      count: '$.input.count'
    output_mapping:
      'state.ideas': '$.ideas'
    resource_bindings:
      container: dev_env

  judge:
    ref: judge
    name: Judge Ideas
    task_id: '@library/ideation/judge'
    task_version: 1
    input_mapping:
      ideas: '$.state.ideas'
    output_mapping:
      'state.scores': '$.scores'

  rank:
    ref: rank
    name: Rank Results
    task_id: '@library/ideation/rank'
    task_version: 1
    input_mapping:
      ideas: '$.state.ideas'
      scores: '$.state.scores'
    output_mapping:
      'output.winner': '$.winner'
      'output.confidence': '$.confidence'

transitions:
  - ref: ideate_to_judge
    from_node_ref: ideate
    to_node_ref: judge
    priority: 0

  - ref: judge_to_rank
    from_node_ref: judge
    to_node_ref: rank
    priority: 0
    condition:
      type: expression
      expr: 'length(state.scores) > 0'

  - ref: judge_retry
    from_node_ref: judge
    to_node_ref: ideate
    priority: 1
    condition:
      type: expression
      expr: 'length(state.scores) == 0'
    loop_config:
      max_iterations: 3

  - ref: rank_to_end
    from_node_ref: rank
    to_node_ref: null # Terminal
    priority: 0

initial_node_ref: ideate
timeout_ms: 300000
on_timeout: human_gate
```

### Mapping to Primitives

| .wflow field                  | Primitive                     | Notes                    |
| ----------------------------- | ----------------------------- | ------------------------ |
| `workflow`                    | `WorkflowDef.name`            |                          |
| `version`                     | `WorkflowDef.version`         |                          |
| `input_schema`                | `WorkflowDef.input_schema`    | JSONSchema               |
| `context_schema`              | `WorkflowDef.context_schema`  | JSONSchema               |
| `output_schema`               | `WorkflowDef.output_schema`   | JSONSchema               |
| `resources`                   | `WorkflowDef.resources`       | ResourceDeclaration map  |
| `nodes.<ref>`                 | `Node`                        | Key becomes `ref`        |
| `nodes.<ref>.task_id`         | `Node.task_id`                | Resolved to ULID         |
| `nodes.<ref>.input_mapping`   | `Node.input_mapping`          | JSONPath expressions     |
| `nodes.<ref>.output_mapping`  | `Node.output_mapping`         | JSONPath expressions     |
| `transitions[].from_node_ref` | `Transition.from_node_id`     | Resolved to ULID         |
| `transitions[].to_node_ref`   | `Transition.to_node_id`       | Resolved to ULID         |
| `transitions[].condition`     | `Transition.condition`        | Structured or expression |
| `initial_node_ref`            | `WorkflowDef.initial_node_id` | Resolved to ULID         |

### Condition Types

Conditions on transitions can be structured (queryable) or expressions:

```yaml
# Structured condition (queryable, optimizable)
condition:
  type: structured
  definition:
    type: comparison
    left: { type: field, path: "state.approved" }
    operator: "=="
    right: { type: literal, value: true }

# Expression condition (flexible, SQL-like)
condition:
  type: expression
  expr: "approved == true AND priority > 5"
```

### Fan-out and Fan-in

```yaml
transitions:
  # Fan-out: spawn parallel tokens
  - ref: fan_out
    from_node_ref: generate
    to_node_ref: process
    priority: 0
    spawn_count: 5 # Fixed count

  # Fan-out: dynamic iteration
  - ref: foreach_items
    from_node_ref: generate
    to_node_ref: process
    priority: 0
    foreach:
      collection: 'state.items'
      item_var: 'item'

  # Fan-in: synchronize parallel tokens
  - ref: fan_in
    from_node_ref: process
    to_node_ref: aggregate
    priority: 0
    synchronization:
      strategy: all
      sibling_group: fan_out # References the fan-out transition ref
      timeout_ms: 60000
      on_timeout: fail
      merge:
        source: '_branch.output'
        target: 'state.results'
        strategy: append
```

---

## Validation Rules

### 1. JSONPath Validity

Every JSONPath in `input_mapping` values and `output_mapping` keys must reference valid schema paths.

```yaml
nodes:
  judge:
    input_mapping:
      ideas: '$.state.ideaz' # ❌ Error: Path '$.state.ideaz' does not exist. Did you mean '$.state.ideas'?
    output_mapping:
      'state.scorse': '$.scores' # ❌ Error: Path 'state.scorse' does not exist in context_schema
```

### 2. Data Flow Soundness

Every path a node reads via `input_mapping` must be guaranteed written by a predecessor's `output_mapping`.

```yaml
nodes:
  rank:
    input_mapping:
      scores: '$.state.scores' # ❌ Error: '$.state.scores' is not written by any predecessor of 'rank'
```

### 3. Conditional Write Warnings

When a path is only written on conditional branches, reading nodes get warnings.

```yaml
transitions:
  - from_node_ref: judge
    to_node_ref: rank
    condition: { type: expression, expr: 'approved == true' }
  - from_node_ref: judge
    to_node_ref: skip
    condition: { type: expression, expr: 'approved == false' }

nodes:
  finalize:
    input_mapping:
      result: '$.state.result' # ⚠️ Warning: '$.state.result' only written on conditional path through 'rank'
```

### 4. Graph Integrity

- **Unreachable nodes**: Nodes not reachable from `initial_node_ref`
- **Cycles without loop_config**: Cycles must have explicit `loop_config`
- **Missing nodes**: Transitions referencing undefined node refs
- **Orphan writes**: Writes to paths never read by any node

### 5. Task Schema Compatibility

- **input_mapping keys** must match the referenced task's `input_schema`
- **output_mapping values** must match the referenced task's `output_schema`

---

## IDE Features

### Diagnostics (Squigglies)

Real-time error highlighting as you type:

```
Error: Path '$.state.ideaz' does not exist in context_schema
  → Did you mean '$.state.ideas'?

Error: Node 'rank' reads '$.state.scores' but no guaranteed predecessor writes it
  → Possible writers: ['judge'] (conditional)

Warning: Node 'cleanup' is not reachable from initial node 'ideate'
```

### Autocomplete

Trigger autocomplete with `$`, `.`, or `@`:

```yaml
nodes:
  rank:
    input_mapping:
      ideas: '$.state.|' # Popup: ideas, scores

  process:
    task_id: '@library/|' # Popup: ideation/, analysis/, transforms/
```

### Hover Information

Hover over any JSONPath or node reference:

```
$.state.ideas
─────────────
Type: string[]
Written by: ideate (output_mapping)
Read by: judge, rank (input_mapping)
```

```
@library/ideation/generate
──────────────────────────
Task: Generate Ideas
Input Schema: { topic: string, count: integer }
Output Schema: { ideas: string[] }
Version: 2 (latest: 3)
```

### Go to Definition

- Click `@library/ideation/generate` → Jump to task definition
- Click `dev_env` in resource_bindings → Jump to resource declaration
- Click `judge` in transition → Jump to node definition

### Find All References

Right-click on `$.state.ideas`:

- `ideate` — writes via output_mapping
- `judge` — reads via input_mapping
- `rank` — reads via input_mapping

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        VS Code                               │
│  ┌─────────────┐     ┌─────────────┐     ┌───────────────┐  │
│  │ .wflow file │────▶│ LSP Client  │◀───▶│  wflow-lsp    │  │
│  │   (editor)  │     │ (extension) │     │    Server     │  │
│  └─────────────┘     └─────────────┘     └───────┬───────┘  │
└───────────────────────────────────────────────────┼──────────┘
                                                    │
                    ┌───────────────────────────────┘
                    ▼
    ┌───────────────────────────────────────┐
    │           wflow-lsp Server            │
    │  ┌─────────────┐  ┌────────────────┐  │
    │  │   Parser    │  │ Schema Registry│  │
    │  │ (YAML → AST)│  │ (load schemas) │  │
    │  └──────┬──────┘  └───────┬────────┘  │
    │         │                 │           │
    │         ▼                 ▼           │
    │  ┌────────────────────────────────┐   │
    │  │       Graph Analyzer           │   │
    │  │  • Build adjacency list        │   │
    │  │  • Compute reachability        │   │
    │  │  • Track reads/writes per path │   │
    │  └───────────────┬────────────────┘   │
    │                  │                    │
    │                  ▼                    │
    │  ┌────────────────────────────────┐   │
    │  │      Diagnostic Emitter        │   │
    │  │  • Path validation errors      │   │
    │  │  • Unreachable node warnings   │   │
    │  │  • Data flow errors            │   │
    │  └────────────────────────────────┘   │
    └───────────────────────────────────────┘
```

---

## Package Structure

```
packages/
  wflow/                      # Core package
    src/
      parser/                 # YAML → AST
        index.ts
        yaml-adapter.ts
        wflow-parser.ts       # .wflow specific
        wtask-parser.ts       # .task specific
        waction-parser.ts     # .action specific
        test-parser.ts       # .test specific
      analyzer/               # Graph analysis, validation
        schema-validator.ts
        path-validator.ts
        graph.ts
        dataflow.ts
      runner/                 # Test execution
        executor.ts
        mock-registry.ts
        assertion-engine.ts
        coverage.ts
      types/                  # TypeScript types for the AST
        ast.ts
        diagnostics.ts
        test-types.ts
      index.ts                # Public API

  wflow-lsp/                  # Language Server
    src/
      server.ts               # LSP entry point
      capabilities/
        diagnostics.ts
        completions.ts
        hover.ts
        definition.ts
        references.ts
      document-manager.ts

  wflow-vscode/               # VS Code Extension
    src/
      extension.ts            # Extension entry
    syntaxes/
      wflow.tmLanguage.json   # Workflow grammar
      wtask.tmLanguage.json   # Task grammar
      waction.tmLanguage.json # Action grammar
      test.tmLanguage.json   # Test grammar
    language-configuration.json
    package.json

  wflow-cli/                  # CLI Tool
    src/
      commands/
        validate.ts
        run.ts
        test.ts
        export.ts
        init.ts
      index.ts
    bin/
      wflow.ts
```

---

## Core Types

### AST

```typescript
interface WflowDocument {
  workflow: string;
  version: number;
  description?: string;

  input_schema: JSONSchema;
  context_schema: JSONSchema;
  output_schema: JSONSchema;

  resources?: Record<string, ResourceDecl>;
  nodes: Record<string, NodeDecl>;
  transitions: TransitionDecl[];

  initial_node_ref: string;
  timeout_ms?: number;
  on_timeout?: 'human_gate' | 'fail' | 'cancel_all';

  _loc: SourceLocation;
}

interface NodeDecl {
  ref: string;
  name: string;
  task_id: string;
  task_version: number;
  input_mapping: Record<string, string> | null; // task input key → JSONPath
  output_mapping: Record<string, string> | null; // context path → JSONPath
  resource_bindings?: Record<string, string>;
  _loc: SourceLocation;
}

interface TransitionDecl {
  ref?: string;
  from_node_ref: string;
  to_node_ref: string | null; // null = terminal
  priority: number;
  condition?: ConditionDecl;
  spawn_count?: number;
  foreach?: ForeachConfig;
  synchronization?: SyncConfig;
  loop_config?: LoopConfig;
  _loc: SourceLocation;
}

interface ConditionDecl {
  type: 'structured' | 'expression';
  definition?: StructuredCondition; // when type = 'structured'
  expr?: string; // when type = 'expression'
}

interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}
```

### Graph Analysis

```typescript
interface GraphAnalysis {
  adjacency: Map<string, string[]>; // node → successors
  predecessors: Map<string, string[]>; // node → predecessors
  reachable: Map<string, Set<string>>; // node → all reachable
  cycles: string[][]; // detected cycles
  unreachable: string[]; // not reachable from initial
}
```

### Data Flow Analysis

```typescript
interface DataFlowAnalysis {
  // For each node, paths guaranteed written before execution
  availableReads: Map<string, Set<string>>;

  // For each path, which nodes write to it
  writers: Map<string, string[]>;

  // Paths read but only conditionally written
  maybeUndefined: Map<
    string,
    {
      node: string;
      path: string;
      reason: string;
    }[]
  >;
}
```

---

## Data Flow Algorithm

The key validation is ensuring input_mapping reads are satisfied by output_mapping writes. Algorithm:

```typescript
function analyzeDataFlow(doc: WflowDocument, graph: GraphAnalysis): DataFlowAnalysis {
  const availableWrites = new Map<string, Set<string>>();
  const writers = new Map<string, string[]>();

  // Input paths are always available
  const inputPaths = extractPaths(doc.input_schema, 'input');

  // Process nodes in topological order
  for (const nodeRef of topologicalOrder(graph)) {
    const available = new Set(inputPaths);
    const predecessors = graph.predecessors.get(nodeRef) || [];

    for (const pred of predecessors) {
      const predNode = doc.nodes[pred];
      const transition = findTransition(doc, pred, nodeRef);

      if (!transition.condition) {
        // Unconditional: output_mapping writes are guaranteed
        for (const [contextPath] of Object.entries(predNode.output_mapping || {})) {
          available.add(contextPath);
        }
      } else {
        // Conditional: track as maybe-undefined
        // Only guaranteed if ALL paths to this node write it
      }
    }

    availableWrites.set(nodeRef, available);

    // Track writers for hover info
    for (const [contextPath] of Object.entries(doc.nodes[nodeRef].output_mapping || {})) {
      const existing = writers.get(contextPath) || [];
      writers.set(contextPath, [...existing, nodeRef]);
    }
  }

  return { availableWrites, writers, maybeUndefined };
}

function validateNodeInputs(doc: WflowDocument, dataFlow: DataFlowAnalysis): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const [nodeRef, node] of Object.entries(doc.nodes)) {
    const available = dataFlow.availableWrites.get(nodeRef)!;

    for (const [, jsonPath] of Object.entries(node.input_mapping || {})) {
      // Extract context path from JSONPath (e.g., "$.state.ideas" → "state.ideas")
      const contextPath = jsonPath.replace(/^\$\./, '');

      if (!available.has(contextPath) && !contextPath.startsWith('input.')) {
        diagnostics.push({
          message: `'${jsonPath}' may not be written when '${nodeRef}' executes`,
          severity: 'error',
          // ... location info
        });
      }
    }
  }

  return diagnostics;
}
```

For conditional branches and fan-in, the analysis must compute **intersection** (what's guaranteed by ALL paths) vs **union** (what's written by ANY path).

---

## Integration with Runtime

`.wflow` files are parsed and converted to the TypeScript runtime types defined in [primitives.md](./primitives.md):

```
.wflow file
    │
    ▼
┌─────────┐
│  Parse  │ → WflowDocument (AST)
└────┬────┘
     │
     ▼
┌──────────┐
│ Validate │ → Diagnostics (shown in editor)
└────┬─────┘
     │
     ▼
┌──────────┐
│ Transform│ → WorkflowDef, Node[], Transition[], Task[]
└────┬─────┘
     │
     ▼
  D1 Storage (Resources Service)
```

The transform phase:

1. Generates ULIDs for all entities
2. Resolves `@library/...` references to actual IDs
3. Converts `reads`/`writes` to `input_mapping`/`output_mapping` JSONPath expressions
4. Separates embedded task definitions into standalone Tasks

---

## Implementation Phases

### Phase 1: Core Parser

- YAML parsing with source location tracking
- AST type definitions
- Basic structural validation (missing required fields, wrong types)

### Phase 2: Schema Validation

- Type system implementation (primitives, arrays, objects, nullable)
- Path extraction from schema definitions
- Path → type mapping for all valid paths

### Phase 3: Graph Analysis

- Build adjacency list from transitions
- Compute reachability (transitive closure)
- Cycle detection (Tarjan's algorithm)
- Identify unreachable nodes

### Phase 4: Data Flow Analysis

- Track output_mapping writes per node
- Compute available paths at each node based on predecessors
- Handle conditional branches (intersection vs union)
- Generate "may be undefined" warnings for input_mapping reads

### Phase 5: LSP Diagnostics

- Error reporting with source locations
- Suggestions for typos (Levenshtein distance)
- Related information (show where path is written)

### Phase 6: LSP Completions

- JSONPath autocomplete in `input_mapping` values
- Context path autocomplete in `output_mapping` keys
- Node reference autocomplete in transitions
- Task reference autocomplete (`@library/...`)
- Resource reference autocomplete

### Phase 7: LSP Hover & Navigation

- Hover info showing type and data flow
- Go-to-definition for tasks, nodes, resources
- Find all references for paths

### Phase 8: VS Code Extension

- TextMate grammar for syntax highlighting
- Language configuration (brackets, comments)
- Extension packaging and distribution

### Phase 9: Runtime Integration

- Transform `.wflow` AST to runtime primitives
- Resolve `@library/...` and `@project/...` references to ULIDs
- Validate task schemas match input_mapping/output_mapping
- Persist to D1 via Resources service

---

## Related File Types

The DSL includes three definition file types (`.wflow`, `.task`, `.action`) and one test file type (`.test`). All share the same import syntax and LSP features.

### .task — Task Definitions

Tasks define discrete units of work that workflows orchestrate. A task contains steps that reference actions.

```yaml
# tasks/generate-ideas.task

task: generate-ideas
version: 2
description: Generate creative ideas for a given topic

imports:
  llm_call: '@library/actions/llm-call'
  format: './format-output.action'

input_schema:
  type: object
  properties:
    topic: { type: string }
    count: { type: integer, default: 5 }
  required: [topic]

output_schema:
  type: object
  properties:
    ideas: { type: array, items: { type: string } }
  required: [ideas]

steps:
  generate:
    name: Generate via LLM
    action_id: llm_call
    action_version: 1
    config:
      model: gpt-4
      temperature: 0.8
      prompt_template: |
        Generate {{count}} creative ideas about: {{topic}}

  format:
    name: Format Output
    action_id: format
    action_version: 1
    depends_on: [generate]
```

### .action — Action Definitions

Actions are the atomic units of execution—actual code or API calls that do work.

```yaml
# actions/llm-call.action

action: llm-call
version: 1
description: Make an LLM API call

input_schema:
  type: object
  properties:
    model: { type: string }
    prompt: { type: string }
    temperature: { type: number, default: 0.7 }
  required: [model, prompt]

output_schema:
  type: object
  properties:
    response: { type: string }
    tokens_used: { type: integer }
  required: [response]

execution:
  type: http
  method: POST
  url: 'https://api.openai.com/v1/chat/completions'
  headers:
    Authorization: 'Bearer {{env.OPENAI_API_KEY}}'
  body:
    model: '{{input.model}}'
    messages:
      - role: user
        content: '{{input.prompt}}'
    temperature: '{{input.temperature}}'
  response_mapping:
    response: '$.choices[0].message.content'
    tokens_used: '$.usage.total_tokens'
```

### Import Syntax

All file types support the same import system:

```yaml
imports:
  # Relative imports - resolved from current file's directory
  local_task: './subtasks/helper.task'
  sibling: '../shared/common.action'

  # Package imports - resolved from package registry
  library_task: '@library/ideation/generate'
  project_action: '@project/custom/my-action'
```

**Resolution rules:**

- Relative paths (`./`, `../`) resolve from the importing file's directory
- `@library/` paths resolve to the shared library registry
- `@project/` paths resolve to the current project's definitions

---

## .test — Test Definitions

`.test` files define declarative tests for workflows, tasks, and actions. The LSP provides the same validation, completions, and hover support as definition files.

### Basic Structure

```yaml
# tests/ideation.test

test_suite: ideation-tests
description: Tests for the ideation workflow

imports:
  ideation: './workflows/ideation-pipeline.wflow'
  generate: './tasks/generate-ideas.task'
  llm_call: '@library/actions/llm-call'

mocks:
  llm_call:
    response: "Mock idea 1\nMock idea 2\nMock idea 3"
    tokens_used: 150

tests:
  generates_correct_count:
    description: Should generate the requested number of ideas
    target: ideation
    input:
      topic: 'sustainable energy'
      count: 3
    timeout_ms: 5000
    assert:
      status: completed
      output.ideas:
        length: 3
      output.ideas[0]:
        type: string
        not_empty: true

  handles_empty_topic:
    description: Should fail gracefully with empty topic
    target: ideation
    input:
      topic: ''
      count: 5
    assert:
      status: failed
      error.code: VALIDATION_ERROR

  task_generates_ideas:
    description: Test the generate task directly
    target: generate
    input:
      topic: 'AI applications'
    assert:
      output.ideas:
        contains: 'AI'
```

### Test Structure

| Field         | Type   | Description                              |
| ------------- | ------ | ---------------------------------------- |
| `test_suite`  | string | Name of the test suite                   |
| `description` | string | Human-readable description               |
| `imports`     | Record | Import workflows, tasks, actions to test |
| `mocks`       | Record | Mock definitions for actions             |
| `fixtures`    | Record | Reusable test data                       |
| `tests`       | Record | Test case definitions                    |

### Test Case Fields

| Field         | Type   | Description                                  |
| ------------- | ------ | -------------------------------------------- |
| `description` | string | What this test verifies                      |
| `target`      | string | Import alias of workflow/task/action to test |
| `input`       | object | Input data for the target                    |
| `context`     | object | Initial context (workflows only)             |
| `mocks`       | Record | Test-specific mock overrides                 |
| `timeout_ms`  | number | Maximum execution time                       |
| `assert`      | object | Assertions to verify                         |

### Assertion Syntax

Assertions use a path-based syntax with assertion primitives:

```yaml
assert:
  # Simple equality
  status: completed
  output.winner: 'idea-3'

  # Numeric comparisons
  output.confidence:
    gt: 0.5
    lte: 1.0

  # String assertions
  output.summary:
    contains: 'energy'
    matches: "^[A-Z].*\\.$"
    not_empty: true

  # Array assertions
  output.ideas:
    length: 3
    every:
      type: string
      not_empty: true

  # Object assertions
  output.metadata:
    has_keys: [created_at, version]
    type: object

  # Existence
  output.optional_field:
    exists: false

  # Negation
  error:
    not:
      exists: true
```

### Assertion Primitives

| Primitive      | Applies To            | Description                                               |
| -------------- | --------------------- | --------------------------------------------------------- |
| `eq`           | any                   | Exact equality (implicit when value given directly)       |
| `not_eq`       | any                   | Not equal                                                 |
| `gt`, `gte`    | number                | Greater than (or equal)                                   |
| `lt`, `lte`    | number                | Less than (or equal)                                      |
| `contains`     | string, array         | Substring or element containment                          |
| `not_contains` | string, array         | Does not contain                                          |
| `matches`      | string                | Regex match                                               |
| `starts_with`  | string                | String prefix                                             |
| `ends_with`    | string                | String suffix                                             |
| `length`       | string, array         | Exact length                                              |
| `min_length`   | string, array         | Minimum length                                            |
| `max_length`   | string, array         | Maximum length                                            |
| `type`         | any                   | Type check (string, number, boolean, array, object, null) |
| `exists`       | any                   | Path exists (true) or not (false)                         |
| `not_empty`    | string, array, object | Has content                                               |
| `has_keys`     | object                | Required keys present                                     |
| `every`        | array                 | All elements match nested assertions                      |
| `some`         | array                 | At least one element matches                              |
| `not`          | any                   | Negate nested assertion                                   |

### Mocks

Mocks replace action execution with predefined responses:

```yaml
mocks:
  # Simple response mock
  llm_call:
    response: 'Mocked response'
    tokens_used: 100

  # Conditional mocks
  http_fetch:
    when:
      input.url:
        contains: 'api.example.com'
    then:
      status: 200
      body: { data: 'mocked' }

  # Sequence mocks (different response each call)
  retry_action:
    sequence:
      - error: 'Connection failed'
      - error: 'Connection failed'
      - response: 'Success on third try'

  # Error mocks
  flaky_service:
    error:
      code: TIMEOUT
      message: 'Service unavailable'
```

### Fixtures

Reusable test data:

```yaml
fixtures:
  valid_topic:
    topic: 'renewable energy'
    count: 5

  large_input:
    topic: 'comprehensive analysis of global economic trends'
    count: 20

tests:
  basic_generation:
    target: ideation
    input: $fixtures.valid_topic
    assert:
      status: completed

  handles_large_input:
    target: ideation
    input: $fixtures.large_input
    timeout_ms: 30000
    assert:
      status: completed
```

### Lifecycle Hooks

```yaml
hooks:
  before_all:
    - action: setup_database
      input: { schema: 'test' }

  before_each:
    - action: clear_cache

  after_each:
    - action: log_result
      input:
        test_name: $test.name
        status: $test.status

  after_all:
    - action: cleanup_database
```

### Test Organization

```yaml
# Group related tests
groups:
  happy_path:
    tests: [generates_correct_count, formats_output]
    tags: [smoke, ci]

  error_handling:
    tests: [handles_empty_topic, handles_invalid_count]
    tags: [error, ci]

  performance:
    tests: [handles_large_input]
    tags: [perf]
    skip_ci: true

# Run configuration
config:
  parallel: true
  max_concurrent: 4
  retry_failed: 2
  fail_fast: false
```

### Snapshot Testing

```yaml
tests:
  output_structure:
    target: ideation
    input:
      topic: 'test'
      count: 1
    assert:
      output:
        snapshot: ideation-output-v1
        # First run creates snapshot, subsequent runs compare
```

Snapshots are stored in `__snapshots__/` adjacent to the test file.

### Coverage

```yaml
coverage:
  targets:
    - ideation
    - generate
  thresholds:
    nodes: 80 # % of workflow nodes executed
    branches: 70 # % of conditional branches taken
    actions: 90 # % of actions invoked
```

---

## CLI

See [cli.md](./cli.md) for the full CLI reference including:

- `wflow check` — Check files for errors and warnings
- `wflow validate` — Deep validation with schema resolution
- `wflow run` — Execute workflows
- `wflow test` — Run test suites
- `wflow export` — Export to JSON, TypeScript, or diagrams
- `wflow init` — Scaffold new projects and files

---

## Future Enhancements

- **Graph visualization** — Webview panel showing workflow as interactive DAG
- **Live simulation** — Step through execution with sample data
- **Refactoring** — Rename node, extract sub-workflow
- **Schema inference** — Infer schemas from task definitions
- **Migration tooling** — Convert TypeScript SDK builders to `.wflow`
- **Property-based testing** — Generate random inputs within schema constraints
- **Mutation testing** — Verify test quality by injecting faults
- **Time travel debugging** — Replay workflow execution step by step
