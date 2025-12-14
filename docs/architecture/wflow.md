# .wflow — Workflow Definition DSL

A declarative DSL for defining Wonder workflows with IDE-powered validation. Files use the `.wflow` extension and are validated in real-time via Language Server Protocol.

## Motivation

Workflow definitions have a graph structure: **nodes** declare what they read/write, but **transitions** determine execution order. This creates a validation challenge—when Node B reads `context.scores`, we need to verify that some predecessor node actually writes it.

TypeScript's type system can validate individual mappings, but graph-aware data flow analysis requires understanding the full topology. A custom DSL with LSP support provides:

- **Real-time diagnostics** as you type (not after `tsc`)
- **Graph-aware validation** ("this path may not be written when this node executes")
- **Domain-specific errors** instead of cryptic type errors
- **Autocomplete** for paths, node references, task references
- **Hover documentation** showing types and data flow

---

## File Format

### Basic Structure

```yaml
# workflows/ideation-pipeline.wflow

workflow: ideation-pipeline
version: 1
description: Generate and rank ideas

schemas:
  input:
    topic: string
    count: integer

  context:
    ideas: string[]
    scores: number[]
    selected_idea: string?     # Optional (nullable)

  output:
    winner: string
    confidence: number

resources:
  dev_env:
    type: container
    image: node:20
    repo: @project/main
    branch: main

nodes:
  ideate:
    task: @library/ideation/generate
    version: 2                          # Pin task version
    reads: [input.topic, input.count]
    writes: [context.ideas]
    resources:
      container: dev_env                # Bind resource

  judge:
    task: @library/ideation/judge
    reads: [context.ideas]
    writes: [context.scores]

  rank:
    task: @library/ideation/rank
    reads: [context.ideas, context.scores]
    writes: [output.winner, output.confidence]

transitions:
  - ideate -> judge

  - judge -> rank:
      when: length(context.scores) > 0

  - judge -> ideate:                    # Retry loop
      when: length(context.scores) == 0
      loop:
        max: 3

  - rank -> end:
      when: output.confidence > 0.8

  - rank -> judge:                      # Low confidence retry
      when: output.confidence <= 0.8

initial: ideate
timeout: 5m
on_timeout: human_gate
```

### Type System

```
Primitives:    string, integer, number, boolean
Nullable:      string?, number?
Arrays:        string[], {id: string, score: number}[]
Objects:       {name: string, age: integer}
References:    @library/path/to/task, @project/repo-name
Expressions:   length(x) > 0, x == "value", x.field != null
Durations:     5m, 30s, 1h
```

### Transition Syntax

Simple transitions use arrow syntax:

```yaml
transitions:
  - ideate -> judge # Unconditional

  - judge -> rank: # With options
      when: context.scores.length > 0
      priority: 1
```

Advanced transitions support fan-out, fan-in, and loops:

```yaml
transitions:
  # Fan-out: spawn parallel tokens
  - generate -> process:
      spawn: 5 # Fixed count

  - generate -> process:
      foreach: context.items # Dynamic count
      as: item

  # Fan-in: synchronize parallel tokens
  - process -> aggregate:
      sync:
        strategy: all # Wait for all siblings
        merge:
          source: _branch.result
          target: context.results
          strategy: append

  # Loops with limits
  - refine -> evaluate:
      loop:
        max: 5
        timeout: 10m
```

---

## Validation Rules

### 1. Path Validity

Every path in `reads` and `writes` must exist in the declared schemas.

```yaml
nodes:
  judge:
    reads: [context.ideaz] # ❌ Error: Path 'context.ideaz' does not exist. Did you mean 'context.ideas'?
```

### 2. Data Flow Soundness

Every path a node reads must be guaranteed to be written by a predecessor.

```yaml
nodes:
  rank:
    reads: [context.scores] # ❌ Error: 'context.scores' is not written by any predecessor of 'rank'
```

### 3. Conditional Write Warnings

When a path is only written on conditional branches, reading nodes get warnings.

```yaml
transitions:
  - judge -> rank:
      when: approved == true
  - judge -> skip:
      when: approved == false

nodes:
  finalize:
    reads: [context.result] # ⚠️ Warning: 'context.result' only written on conditional path through 'rank'
```

### 4. Graph Integrity

- **Unreachable nodes**: Nodes not reachable from `initial`
- **Cycles without loop config**: Cycles must have explicit `loop` configuration
- **Missing nodes**: Transitions referencing undefined nodes
- **Orphan writes**: Writes to paths never read by any node

---

## IDE Features

### Diagnostics (Squigglies)

Real-time error highlighting as you type:

```
Error: Path 'context.ideaz' does not exist in schemas
  → Did you mean 'context.ideas'?

Error: Node 'rank' reads 'context.scores' but no guaranteed predecessor writes it
  → Possible writers: ['judge'] (conditional)

Warning: Node 'cleanup' is not reachable from initial node 'ideate'
```

### Autocomplete

Trigger autocomplete with `.`, `@`, or `[`:

```yaml
nodes:
  rank:
    reads: [context.|]  # Popup: ideas, scores, selected_idea

  process:
    task: @library/|    # Popup: ideation/, analysis/, transforms/
```

### Hover Information

Hover over any path or node reference:

```
context.ideas
─────────────
Type: string[]
Written by: ideate
Read by: judge, rank
```

```
@library/ideation/generate
──────────────────────────
Task: Generate Ideas
Input: { topic: string, count: integer }
Output: { ideas: string[] }
Version: 2 (latest: 3)
```

### Go to Definition

- Click `@library/ideation/generate` → Jump to task definition
- Click `dev_env` in resource binding → Jump to resource declaration
- Click `judge` in transition → Jump to node definition

### Find All References

Right-click on `context.ideas`:

- `ideate` — writes
- `judge` — reads
- `rank` — reads

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
  schemas: SchemaBlock;
  resources?: Record<string, ResourceDecl>;
  nodes: Record<string, NodeDecl>;
  transitions: TransitionDecl[];
  initial: string;
  timeout?: Duration;
  on_timeout?: 'human_gate' | 'fail' | 'cancel_all';
  _loc: SourceLocation;
}

interface NodeDecl {
  task: TaskRef;
  version?: number;
  reads: PathRef[];
  writes: PathRef[];
  resources?: Record<string, string>;
  _loc: SourceLocation;
}

interface TransitionDecl {
  from: string;
  to: string;
  when?: Expression;
  priority?: number;
  loop?: LoopConfig;
  spawn?: number | ForeachConfig;
  sync?: SyncConfig;
  _loc: SourceLocation;
}

interface PathRef {
  segments: string[]; // ['context', 'ideas']
  raw: string; // 'context.ideas'
  _loc: SourceLocation;
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

The key validation is ensuring reads are satisfied by writes. Algorithm:

```typescript
function analyzeDataFlow(doc: WflowDocument, graph: GraphAnalysis): DataFlowAnalysis {
  const availableReads = new Map<string, Set<string>>();
  const writers = new Map<string, string[]>();

  // Input paths are always available
  const inputPaths = extractPaths(doc.schemas.input, 'input');

  // Process nodes in topological order
  for (const nodeRef of topologicalOrder(graph)) {
    const available = new Set(inputPaths);
    const predecessors = graph.predecessors.get(nodeRef) || [];

    for (const pred of predecessors) {
      const predNode = doc.nodes[pred];
      const transition = findTransition(doc, pred, nodeRef);

      if (!transition.when) {
        // Unconditional: writes are guaranteed
        for (const write of predNode.writes) {
          available.add(write.raw);
        }
      } else {
        // Conditional: track as maybe-undefined
        // Only guaranteed if ALL paths to this node write it
      }
    }

    availableReads.set(nodeRef, available);

    // Track writers for hover info
    for (const write of doc.nodes[nodeRef].writes) {
      const existing = writers.get(write.raw) || [];
      writers.set(write.raw, [...existing, nodeRef]);
    }
  }

  return { availableReads, writers, maybeUndefined };
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

- Track reads/writes per node
- Compute available paths at each node
- Handle conditional branches (intersection vs union)
- Generate "may be undefined" warnings

### Phase 5: LSP Diagnostics

- Error reporting with source locations
- Suggestions for typos (Levenshtein distance)
- Related information (show where path is written)

### Phase 6: LSP Completions

- Path autocomplete in `reads`/`writes` arrays
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
- Resolve `@library/...` references
- Generate `input_mapping`/`output_mapping` from `reads`/`writes`
- Persist to D1 via Resources service

---

## Future Enhancements

- **Graph visualization** — Webview panel showing workflow as interactive DAG
- **Live simulation** — Step through execution with sample data
- **Refactoring** — Rename node, extract sub-workflow
- **Schema inference** — Infer schemas from task definitions
- **Multi-file support** — Import nodes/schemas from other `.wflow` files
- **Migration tooling** — Convert TypeScript SDK builders to `.wflow`
