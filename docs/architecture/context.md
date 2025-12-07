# Context: Runtime State Management

## Overview

Context is the runtime state container for workflow execution. Unlike traditional workflow engines that store state as opaque JSON blobs, Wonder uses **schema-driven normalized SQL tables** generated dynamically from user-defined JSONSchema.

## Schema Authoring

When users author a WorkflowDef (via SDK or UI), they define three schemas as JSONSchema:

- `input_schema` - Validates workflow inputs (immutable after start)
- `output_schema` - Validates final workflow outputs
- `context_schema` - Defines the runtime state structure

These schemas are **stored as JSON** in D1 as part of the `WorkflowDef` record.

```typescript
WorkflowDef {
  id: string;
  version: number;
  // ...
  input_schema: JSONSchema;      // JSON blob in D1
  output_schema: JSONSchema;     // JSON blob in D1
  context_schema: JSONSchema;    // JSON blob in D1
}
```

## Runtime Table Generation

When a workflow run starts, the Coordinator:

1. Loads the `WorkflowDef` from D1 (including schema JSON)
2. Passes `context_schema` to `@wonder/schema`
3. `@wonder/schema` generates DDL (CREATE TABLE statements)
4. Coordinator executes DDL in DO SQLite
5. Tables are created in the isolated DO instance for this workflow run

**Example context_schema:**

```typescript
{
  type: "object",
  properties: {
    user_id: { type: "integer" },
    approved: { type: "boolean" },
    results: { type: "array", items: { type: "string" } },
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

**Generated DDL (by @wonder/schema):**

```sql
CREATE TABLE workflow_context (
  user_id INTEGER,
  approved INTEGER,  -- SQLite boolean (0/1)
  metadata_timestamp INTEGER,
  metadata_source TEXT
);

CREATE TABLE workflow_context_results (
  workflow_context_id INTEGER NOT NULL,
  index INTEGER NOT NULL,
  value TEXT,
  FOREIGN KEY (workflow_context_id) REFERENCES workflow_context(rowid)
);
```

## Data Operations

During workflow execution, the coordinator performs context operations via `operations/context.ts`:

```typescript
initializeTable(sql) → void              // Create tables from schema DDL
initializeWithInput(sql, input) → void   // Populate initial context
get(sql, path) → unknown                 // Read context value
set(sql, path, value) → void             // Write context value
applyNodeOutput(sql, nodeRef, output, tokenId?) → void  // Apply node output mapping
getSnapshot(sql) → ContextSnapshot       // Read-only view for decision logic
getBranchOutputs(sql, nodeRef) → Array<Record<string, unknown>>
```

`@wonder/schema` generates:

- **DDL** - CREATE TABLE statements from JSONSchema
- **DML** - SQL statements for reads/writes/updates

The generated SQL operates on normalized tables, not JSON columns.

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

During fan-out, tokens write to isolated `_branch` context. From branching.md:

- `_branch.item` - The collection item for foreach transitions
- `_branch.output` - Node outputs from this branch

At fan-in, merge strategies combine `_branch.output` from siblings into the main context (source path in merge config references `_branch.output`).

## Lifecycle

1. **Authoring**: User defines `context_schema` as JSONSchema
2. **Storage**: Schema stored as JSON in D1 with `WorkflowDef`
3. **Initialization**: Coordinator loads schema, `@wonder/schema` generates DDL, coordinator executes CREATE TABLE in DO SQLite
4. **Execution**: Context operations use generated DML to read/write normalized tables
5. **Completion**: Workflow completes, final output extracted via `extractFinalOutput()`

Each workflow run has isolated context in its own DO instance. Schema changes between workflow versions don't affect running workflows.
