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
      analyzer/               # Graph analysis, validation
        schema-validator.ts
        path-validator.ts
        graph.ts
        dataflow.ts
      types/                  # TypeScript types for the AST
        ast.ts
        diagnostics.ts
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
      wflow.tmLanguage.json   # TextMate grammar
    language-configuration.json
    package.json
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
│ Transform│ → WorkflowDef, Node[], Transition[], TaskDef[]
└────┬─────┘
     │
     ▼
  D1 Storage (Resources Service)
```

The transform phase:

1. Generates ULIDs for all entities
2. Resolves `@library/...` references to actual IDs
3. Converts `reads`/`writes` to `input_mapping`/`output_mapping` JSONPath expressions
4. Separates embedded task definitions into standalone TaskDefs

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

## Future Enhancements

- **Graph visualization** — Webview panel showing workflow as interactive DAG
- **Live simulation** — Step through execution with sample data
- **Refactoring** — Rename node, extract sub-workflow
- **Schema inference** — Infer schemas from task definitions
- **Multi-file support** — Import nodes/schemas from other `.wflow` files
- **Migration tooling** — Convert TypeScript SDK builders to `.wflow`
