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

- `input_schema` - Validates workflow inputs (immutable after start)
- `state_schema` - Defines mutable state structure (auto-inferred from graph or user-defined)
- `output_schema` - Validates final workflow outputs

These schemas are **stored as JSON** in D1 as part of the `WorkflowDef` record. Nodes can define `output_schema` for their action results, enabling structured LLM outputs and downstream validation.

```typescript
WorkflowDef {
  id: string;
  version: number;
  // ...
  input_schema: JSONSchema;      // JSON blob in D1
  state_schema: JSONSchema;      // JSON blob in D1 (auto-inferred or user-defined)
  output_schema: JSONSchema;     // JSON blob in D1
}

NodeDef {
  id: string;
  action_id: string;
  output_schema?: JSONSchema;    // Optional schema for action output
  // ...
}
```

## Runtime Table Generation

When a workflow run starts, the Coordinator:

1. Loads the `WorkflowDef` from RESOURCES (including schema JSON, cached in DO)
2. Passes `input_schema` and `state_schema` to `@wonder/context`
3. `@wonder/context` generates DDL (CREATE TABLE statements)
4. Coordinator executes DDL in DO SQLite via `operations.context.initializeTable()`
5. Tables are created in the isolated DO instance for this workflow run
6. Input data is validated against `input_schema` and inserted into context

**Example state_schema:**

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

**Generated DDL (by @wonder/context):**

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

During workflow execution, the coordinator performs context operations via `operations/context.ts`:

```typescript
initializeTable(sql) → void              // Create tables from schema DDL
initializeWithInput(sql, input) → void   // Validate and insert input data
get(sql, path) → unknown                 // Read context value (e.g., 'state.votes')
set(sql, path, value) → void             // Write context value with validation
applyNodeOutput(sql, nodeRef, output, tokenId?) → void  // Apply node output mapping
getSnapshot(sql) → ContextSnapshot       // Read-only view for decision logic
getBranchOutputs(sql, nodeRef) → Array<Record<string, unknown>>
```

`@wonder/context` generates parameterized SQL:

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

**Storage approach:** Each branch gets separate SQL tables (e.g., `branch_output_tok_abc123`) generated from the node's `output_schema`. This provides:

- True isolation (no shared state)
- Schema validation via `@wonder/context`
- Native SQL storage (not JSON blobs)

**Branch metadata** tracked in token table:

```typescript
Token {
  id: string,              // Token ID
  branch_index: number,    // 0-indexed position in sibling group
  branch_total: number,    // Total siblings
  fan_out_transition_id: string, // Transition that spawned this group
  parent_token_id?: string // For nested fan-outs
}
```

At fan-in, `decisions/synchronization.ts` evaluates merge strategies:

- **append** - Collect all `_branch.output` into an array
- **merge** - Shallow merge all outputs into one object
- **keyed** - Merge into object keyed by branch index
- **last_wins** - Take the last completed branch's output

Merged data is written to `context.state` via `SET_CONTEXT` decision → `dispatch/apply.ts` → `operations.context.set()`.

## Lifecycle

1. **Authoring**: User defines `input_schema`, `state_schema`, `output_schema` as JSONSchema (via SDK/UI)
2. **Storage**: Schemas stored as JSON in D1 with `WorkflowDef`
3. **Initialization**:
   - Coordinator loads `WorkflowDef` from RESOURCES (cached)
   - `@wonder/context` generates DDL from schemas
   - Coordinator executes CREATE TABLE in DO SQLite
   - Input data validated and inserted
4. **Execution**:
   - Node outputs validated against `node.output_schema`
   - Context operations use generated DML to read/write normalized tables
   - Decision logic reads via `getSnapshot()` (read-only)
   - Dispatch layer writes via `set()` and `applyNodeOutput()`
5. **Completion**:
   - `decisions/completion.ts` extracts final output via `output_schema` mapping
   - Artifacts committed to RESOURCES
   - DO state persists until explicit cleanup

Each workflow run has isolated context in its own DO instance. Schema changes between workflow versions don't affect running workflows.

## Integration with Coordinator

Context operations are called by the dispatch layer after decision logic:

```typescript
// Decision logic (pure)
const decisions = decisions.routing.decide(token, workflow, contextSnapshot);

// Dispatch converts decisions to operations
await dispatch.applyDecisions(decisions, sql, env, logger);
// → SET_CONTEXT decision → operations.context.set(sql, path, value)
// → APPLY_NODE_OUTPUT decision → operations.context.applyNodeOutput(sql, nodeRef, output)
```

Separation of concerns:

- **decisions/** - Pure logic, reads context via snapshots
- **dispatch/** - Converts decisions to operations
- **operations/context.ts** - SQL operations via `@wonder/context`
