# Context: Runtime State Management

## Overview

Context is the runtime state container for workflow execution. Unlike traditional workflow engines that store state as opaque JSON blobs, Wonder uses **schema-driven normalized SQL tables** generated dynamically from user-defined JSONSchema.

Context has four components:

- **input** - Immutable workflow inputs (set at start, never modified)
- **state** - Mutable accumulator for intermediate results
- **output** - Final workflow output (set before completion)
- **artifacts** - References to persisted artifacts (write_artifact actions)

## Schema Authoring

When users author a WorkflowDef (via SDK or UI), they define schemas as JSONSchema:

- `inputSchema` - Validates workflow inputs (immutable after start)
- `contextSchema` - Defines mutable state structure (auto-inferred from graph or user-defined)
- `outputSchema` - Validates final workflow outputs

These schemas are **stored as JSON** in D1 as part of the `WorkflowDef` record. Tasks (referenced by Nodes) define `outputSchema` for their results, enabling structured outputs and downstream validation.

```typescript
WorkflowDef {
  id: string;
  version: number;
  // ...
  inputSchema: JSONSchema;       // JSON blob in D1
  contextSchema: JSONSchema;     // JSON blob in D1 (defines state structure)
  outputSchema: JSONSchema;      // JSON blob in D1
}

Task {
  id: string;
  version: number;
  // ...
  inputSchema: JSONSchema;       // Task input schema
  outputSchema: JSONSchema;      // Task output schema (used for branch storage)
  // Steps execute actions, final step output becomes task output
}

Node {
  id: string;
  taskId: string;                // References Task
  taskVersion: number;
  inputMapping: object | null;   // Map context → task input
  outputMapping: object | null;  // Map task output → context
  // Nodes don't have outputSchema - they reference Tasks that do
}
```

## Runtime Table Generation

When a workflow run starts, the Coordinator:

1. Loads the `WorkflowDef` from RESOURCES (including schema JSON, cached in DO)
2. Passes `inputSchema` and `contextSchema` to `@wonder/schemas`
3. `@wonder/schemas` generates DDL (CREATE TABLE statements)
4. Coordinator calls `ContextManager.initialize(input)` which creates tables and inserts input
5. Tables are created in the isolated DO instance for this workflow run
6. Input data is validated against `inputSchema` and inserted into context

**Example contextSchema:**

```typescript
{
  type: "object",
  properties: {
    approved: { type: "boolean" },
    votes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          choice: { type: "string", enum: ["A", "B"] },
          rationale: { type: "string" }
        }
      }
    },
    metadata: {
      type: "object",
      properties: {
        timestamp: { type: "integer" },
        source: { type: "string" }
      }
    }
  }
}
```

**Generated DDL (by @wonder/schemas):**

```sql
CREATE TABLE context_state (
  approved INTEGER,  -- SQLite boolean (0/1)
  metadata_timestamp INTEGER,
  metadata_source TEXT
);

CREATE TABLE context_state_votes (
  context_state_id INTEGER NOT NULL,
  index INTEGER NOT NULL,
  choice TEXT CHECK (choice IN ('A', 'B')),
  rationale TEXT,
  FOREIGN KEY (context_state_id) REFERENCES context_state(rowid)
);
```

## Data Operations

During workflow execution, the coordinator performs context operations via `ContextManager`:

```typescript
class ContextManager {
  // Initialization
  initialize(input: Record<string, unknown>): void;  // Create tables, validate & insert input

  // Read operations
  getSection(section: string): Record<string, unknown>;  // Read entire section
  get(path: string): unknown;                            // Read context value (e.g., 'state.votes')
  getSnapshot(): ContextSnapshot;                        // Read-only view for decision logic

  // Write operations
  setField(path: string, value: unknown): void;          // Set nested field value
  replaceSection(section: string, data: Record<string, unknown>): void;

  // Output mapping (linear flows)
  applyOutputMapping(
    outputMapping: Record<string, string> | null,
    taskOutput: Record<string, unknown>,
  ): void;

  // Branch storage (parallel flows)
  initializeBranchTable(tokenId: string, outputSchema: JSONSchema): void;
  applyBranchOutput(tokenId: string, output: Record<string, unknown>): void;
  getBranchOutputs(tokenIds: string[], branchIndices: number[], outputSchema: JSONSchema): BranchOutput[];
  mergeBranches(branchOutputs: BranchOutput[], merge: MergeConfig): void;
  dropBranchTables(tokenIds: string[]): void;
}
```

`@wonder/schemas` generates parameterized SQL:

- **DDL** - CREATE TABLE statements from JSONSchema (with CHECK constraints)
- **DML** - Parameterized INSERT/UPDATE/DELETE statements
- **Validation** - Runtime type checking before SQL execution

The generated SQL operates on normalized tables, not JSON columns. Scalars become columns, arrays become separate tables with foreign keys.

## Key Characteristics

### Schema as Data

Schemas are authored, versioned, and stored as JSON - not compiled into code. This enables:

- **Dynamic table structure** per workflow run
- **Schema evolution** across workflow versions
- **Runtime flexibility** without redeployment

### Normalized Storage

Arrays and nested objects become separate tables with foreign keys, not JSON columns. This enables:

- **Direct SQL queries** in transition conditions
- **Type safety** via SQLite constraints
- **Efficient joins** for complex queries

### Isolation

Each workflow run gets its own isolated context in a dedicated DO instance. Schema changes between workflow versions don't affect running workflows.

### Branch Context

During fan-out, each token writes to isolated branch storage. See `branch-storage.md` for complete design.

**Storage approach:** Each branch gets separate SQL tables (e.g., `branch_output_tok_abc123`) generated from the Task's `outputSchema` (referenced via `node.taskId`). This provides:

- True isolation (no shared state)
- Schema validation via `@wonder/schemas`
- Native SQL storage (not JSON blobs)

**Branch metadata** tracked in token table:

```typescript
Token {
  id: string,              // Token ID
  branchIndex: number,     // 0-indexed position in sibling group
  branchTotal: number,     // Total siblings
  siblingGroup: string,    // Named group identifier from fan-out transition
  parentTokenId?: string   // For nested fan-outs
}
```

At fan-in, `planning/synchronization.ts` evaluates merge strategies:

- **append** - Collect all outputs into an array, ordered by branch index (flattens arrays)
- **collect** - Collect all outputs into array, preserving structure (no flattening)
- **merge_object** - Shallow merge all outputs into one object
- **keyed_by_branch** - Merge into object keyed by branch index
- **last_wins** - Take the highest branch index's output

Merged data is written to context via `MERGE_BRANCHES` decision → `dispatch/apply.ts` → `context.mergeBranches()`.

## Lifecycle

1. **Authoring**: User defines `inputSchema`, `contextSchema`, `outputSchema` as JSONSchema (via SDK/UI)
2. **Storage**: Schemas stored as JSON in D1 with `WorkflowDef`; Tasks store their own `outputSchema`
3. **Initialization**:
   - Coordinator loads `WorkflowDef` from RESOURCES (cached in DefinitionManager)
   - `@wonder/schemas` generates DDL from schemas
   - `ContextManager.initialize()` creates tables and inserts input
   - Input data validated and inserted
4. **Execution**:
   - Task outputs validated against `Task.outputSchema` (referenced via `node.taskId`)
   - For linear flows: `applyOutputMapping()` maps task output to context paths
   - For parallel flows: `applyBranchOutput()` writes to branch tables, `mergeBranches()` combines at fan-in
   - Decision logic reads via `getSnapshot()` (read-only)
   - Dispatch layer writes via `setField()` and output mapping operations
5. **Completion**:
   - `planning/lifecycle.ts` checks completion conditions
   - Artifacts committed to RESOURCES
   - DO state persists until explicit cleanup

Each workflow run has isolated context in its own DO instance. Schema changes between workflow versions don't affect running workflows.

## Integration with Coordinator

Context operations are called by the dispatch layer after planning decisions:

```typescript
// Planning (pure functions)
const decisions = decideRouting({ completedToken, transitions, context });

// Dispatch applies decisions via ContextManager
await applyDecisions(decisions, ctx);
// → APPLY_OUTPUT_MAPPING decision → context.applyOutputMapping(mapping, output)
// → INIT_BRANCH_TABLE decision → context.initializeBranchTable(tokenId, schema)
// → APPLY_BRANCH_OUTPUT decision → context.applyBranchOutput(tokenId, output)
// → MERGE_BRANCHES decision → context.mergeBranches(branchOutputs, mergeConfig)
// → SET_CONTEXT decision → context.setField(path, value)
```

Separation of concerns:

- **planning/** - Pure logic, reads context via snapshots, returns Decision[]
- **dispatch/** - Applies decisions via operations managers
- **operations/context.ts** - ContextManager with SQL operations via `@wonder/schemas`
