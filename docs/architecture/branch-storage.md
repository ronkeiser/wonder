# Branch Storage: SQL-based Isolation

## Problem Statement

During parallel execution (fan-out), multiple tokens execute simultaneously and produce outputs. These outputs must be:

1. **Isolated** - No shared state mutation between branches
2. **Mergeable** - Collected at fan-in points
3. **Schema-validated** - Type-safe via `@wonder/schemas`
4. **SQL-native** - Stored in DO SQLite, not JSON blobs

The challenge: How do we store branch-isolated data in schema-driven SQL tables?

## Design: Token-Scoped Tables

Each branch writes to **separate ephemeral tables** prefixed by token ID. At fan-in, data is read from all sibling token tables, merged according to strategy, and written to the main context tables.

Branch isolation is achieved through table namespacing—each token gets its own set of tables generated from the schema.

### Example: 5-way fan-out for voting

**Workflow context schema:**

```typescript
// WorkflowDef.context_schema
context_schema: {
  type: 'object',
  properties: {
    votes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          choice: { type: 'string', enum: ['A', 'B'] },
          rationale: { type: 'string' }
        }
      }
    }
  }
}
```

**Task output schema (each judge task):**

```typescript
// Task.output_schema (referenced by Node via task_id)
output_schema: {
  type: 'object',
  properties: {
    choice: { type: 'string', enum: ['A', 'B'] },
    rationale: { type: 'string' }
  },
  required: ['choice', 'rationale']
}
```

**Storage structure:**

```sql
-- Main context tables (initially empty during fan-out)
CREATE TABLE context_state (
  id INTEGER PRIMARY KEY
);

CREATE TABLE context_state_votes (
  context_state_id INTEGER NOT NULL,
  index INTEGER NOT NULL,
  choice TEXT CHECK (choice IN ('A', 'B')),
  rationale TEXT,
  FOREIGN KEY (context_state_id) REFERENCES context_state(rowid)
);

-- Branch output tables (one set per token)
-- Token tok_abc123:
CREATE TABLE branch_output_tok_abc123 (
  id INTEGER PRIMARY KEY,
  choice TEXT CHECK (choice IN ('A', 'B')),
  rationale TEXT
);

-- Token tok_abc124:
CREATE TABLE branch_output_tok_abc124 (
  id INTEGER PRIMARY KEY,
  choice TEXT CHECK (choice IN ('A', 'B')),
  rationale TEXT
);

-- ... (3 more for tok_abc125, tok_abc126, tok_abc127)
```

## Operations API

### `operations/context.ts`

```typescript
interface ContextOperations {
  // Initialize main context tables from workflow schemas
  initializeTable(sql: SqlStorage, schema: JSONSchema): void;

  // Initialize branch output table for a token
  initializeBranchTable(sql: SqlStorage, tokenId: string, schema: JSONSchema): void;

  // Read from main context (for decision logic)
  get(sql: SqlStorage, path: string): unknown;
  getSnapshot(sql: SqlStorage): ContextSnapshot;

  // Write to main context (SET_CONTEXT decision)
  set(sql: SqlStorage, path: string, value: unknown): void;

  // Write node output to branch-isolated table
  applyNodeOutput(
    sql: SqlStorage,
    tokenId: string,
    output: Record<string, unknown>,
    outputSchema: JSONSchema,
  ): void;

  // Read all branch outputs from sibling tokens (for merge)
  getBranchOutputs(
    sql: SqlStorage,
    tokenIds: string[],
    outputSchema: JSONSchema,
  ): Array<{ tokenId: string; output: Record<string, unknown> }>;

  // Merge branch outputs into main context (at fan-in)
  mergeBranches(
    sql: SqlStorage,
    siblings: TokenRow[],
    merge: { source: string; target: string; strategy: string },
    outputSchema: JSONSchema,
  ): void;

  // Cleanup: drop branch tables after merge
  dropBranchTables(sql: SqlStorage, tokenIds: string[]): void;
}
```

## Lifecycle

### 1. Fan-out: Create Branch Tables

When a token is created during fan-out:

```typescript
// In dispatch/apply.ts handling CREATE_TOKEN decision
const token = operations.tokens.create(sql, params);

// Create isolated branch output table
// Get output schema from the node's Task
const node = workflow.nodes.find((n) => n.id === params.node_id);
const taskDef = await resources.getTask(node.task_id, node.task_version);
const taskOutputSchema = taskDef.output_schema;

if (taskOutputSchema) {
  operations.context.initializeBranchTable(sql, token.id, taskOutputSchema);
}

dispatch(token.id);
```

Implementation:

```typescript
function initializeBranchTable(sql: SqlStorage, tokenId: string, schema: JSONSchema): void {
  const tableName = `branch_output_${tokenId}`;
  const ddlGen = new DDLGenerator(schema, registry);
  const ddl = ddlGen.generateDDL(tableName);
  sql.exec(ddl); // Creates branch_output_tok_xxx table(s)
}
```

### 2. Execution: Write to Branch Table

When executor returns a result:

```typescript
// In coordinator handleTaskResult()
// Output schema comes from Task, not Node
const taskDef = await resources.getTask(node.task_id, node.task_version);
operations.context.applyNodeOutput(sql, tokenId, result.output_data, taskDef.output_schema);
```

Implementation:

```typescript
function applyNodeOutput(
  sql: SqlStorage,
  tokenId: string,
  output: Record<string, unknown>,
  outputSchema: JSONSchema,
): void {
  const tableName = `branch_output_${tokenId}`;
  const dmlGen = new DMLGenerator(outputSchema, registry);

  // Generate INSERT statements
  const { statements, values } = dmlGen.generateInsert(tableName, output);

  // Execute parameterized inserts
  for (let i = 0; i < statements.length; i++) {
    sql.exec(statements[i], values[i]);
  }
}
```

### 3. Fan-in: Merge Branch Tables

When synchronization condition is met:

```typescript
// In decisions/synchronization.ts
if (syncConditionMet) {
  // Get Task output schema for merge validation
  const node = workflow.nodes.find((n) => n.id === token.node_id);
  const taskDef = await resources.getTask(node.task_id, node.task_version);

  return [
    {
      type: 'MERGE_BRANCHES',
      siblings: siblingTokens,
      merge: transition.synchronization.merge,
      outputSchema: taskDef.output_schema,
    },
    {
      type: 'ACTIVATE_FAN_IN_TOKEN',
      // ...
    },
  ];
}
```

Implementation in dispatch/apply.ts:

```typescript
case 'MERGE_BRANCHES': {
  operations.context.mergeBranches(
    sql,
    decision.siblings,
    decision.merge,
    decision.outputSchema
  );

  // Cleanup branch tables
  const tokenIds = decision.siblings.map(s => s.id);
  operations.context.dropBranchTables(sql, tokenIds);
  break;
}
```

### 4. Merge Strategies

```typescript
function mergeBranches(
  sql: SqlStorage,
  siblings: TokenRow[],
  merge: { source: string; target: string; strategy: string },
  outputSchema: JSONSchema,
): void {
  // Read all branch outputs
  const branchData = siblings.map((sibling) => {
    const tableName = `branch_output_${sibling.id}`;
    // Read using schema-driven query
    return {
      tokenId: sibling.id,
      branchIndex: sibling.branch_index,
      output: readBranchTable(sql, tableName, outputSchema),
    };
  });

  // Apply merge strategy
  const merged = applyMergeStrategy(branchData, merge.strategy);

  // Write to main context
  operations.context.set(sql, merge.target, merged);
}
```

**Merge strategies:**

- **append** - Collect all outputs into array

  ```typescript
  merged = branchData.map((b) => b.output);
  // Result: [{ choice: 'A', rationale: '...' }, { choice: 'B', ... }, ...]
  ```

- **merge_object** - Shallow merge all outputs

  ```typescript
  merged = Object.assign({}, ...branchData.map((b) => b.output));
  // Result: { choice: 'B', rationale: '...' } (last wins for conflicts)
  ```

- **keyed_by_branch** - Object keyed by branch index

  ```typescript
  merged = Object.fromEntries(branchData.map((b) => [b.branchIndex.toString(), b.output]));
  // Result: { '0': {...}, '1': {...}, '2': {...} }
  ```

- **last_wins** - Take last completed branch
  ```typescript
  merged = branchData[branchData.length - 1].output;
  // Result: { choice: 'A', rationale: '...' }
  ```

## Schema Considerations

### Branch Output Schema Sources

Task output schemas come from:

1. **Task.output_schema** - Primary source, defines what the task produces
2. **Derived from Actions** - If Task doesn't specify, can be inferred from final step's ActionDef.produces
3. **Structured LLM output** - For LLM actions with JSON schema output validation

Note: Nodes reference Tasks via `node.task_id` and `node.task_version`. The Node itself only defines data mapping (`input_mapping`, `output_mapping`), not schemas.

### Merge Target Validation

The merged result must match the target path's schema:

```typescript
// Merge config
merge: {
  source: '_branch.output',  // All of branch output
  target: 'state.votes',  // Array in state schema
  strategy: 'append'
}

// Validation
const targetSchema = getSchemaAtPath(workflow.state_schema, 'state.votes');
// targetSchema = { type: 'array', items: { ... } }

const merged = applyMergeStrategy(branchData, 'append');
validateSchema(merged, targetSchema);  // Must be array of vote objects
```

### Nested Objects in Branch Output

If a Task output schema defines nested objects:

```typescript
// Task.output_schema
output_schema: {
  type: 'object',
  properties: {
    decision: { type: 'string' },
    confidence: { type: 'number' },
    reasoning: {
      type: 'object',
      properties: {
        pros: { type: 'array', items: { type: 'string' } },
        cons: { type: 'array', items: { type: 'string' } }
      }
    }
  }
}
```

Branch table structure (flattened by `@wonder/schemas`):

```sql
CREATE TABLE branch_output_tok_abc123 (
  id INTEGER PRIMARY KEY,
  decision TEXT,
  confidence REAL,
  reasoning_pros TEXT,  -- Or separate table if array strategy is 'table'
  reasoning_cons TEXT
);
```

Reading with schema reconstructs the nested structure.

## Nested Fan-out

For nested fan-outs (fan-out within fan-out), branch tables nest by token ancestry:

```
Root token spawns 3 tokens: tok_1, tok_2, tok_3
Token tok_1 spawns 5 tokens: tok_1_a, tok_1_b, tok_1_c, tok_1_d, tok_1_e

Branch tables:
- branch_output_tok_1
- branch_output_tok_2
- branch_output_tok_3
- branch_output_tok_1_a
- branch_output_tok_1_b
- branch_output_tok_1_c
- branch_output_tok_1_d
- branch_output_tok_1_e
```

Inner fan-in (tok_1_a through tok_1_e) merges into `branch_output_tok_1`.
Outer fan-in (tok_1, tok_2, tok_3) merges into main `context_state`.

Each level of fan-in reads from its sibling branch tables and writes to its parent's context (which might itself be a branch table).

## Decision Type Addition

Add new decision type for merge:

```typescript
type Decision =
  // ... existing decisions
  {
    type: 'MERGE_BRANCHES';
    siblings: TokenRow[];
    merge: { source: string; target: string; strategy: string };
    outputSchema: JSONSchema;
  };
```

## Path Syntax Clarification

**In Transition merge configuration (primitives.md):**

```typescript
merge: {
  source: "_branch.output",  // Reads from each sibling's branch table
  target: "state.votes",     // Writes to main context
  strategy: "append"
}
```

The `_branch.output` path tells the Coordinator to read from branch-isolated tables. During merge execution:

- `_branch.output` → read entire output from `branch_output_{tokenId}` table
- `_branch.output.choice` → read specific field from branch table
- `_branch.output.reasoning.pros` → read nested field from branch table

**Implementation detail:** The `getBranchOutputs()` operation strips the `_branch.` prefix and reads from the token-scoped tables. The prefix is a **logical path** in the workflow definition, not a physical table name.

Target paths are standard JSONPath into main context:

- `state.votes` - Array in state
- `state.results.final` - Nested object in state
- `output.winner` - Top-level output field

## Summary

**Branch isolation via table namespacing:**

- Each token gets `branch_output_{tokenId}` table(s) during fan-out
- Node outputs write to isolated branch tables via `@wonder/schemas` DML
- Fan-in reads all sibling branch tables, merges, writes to main context
- Branch tables dropped after merge (cleanup)

**Alternative: Single table with token_id column for simplicity**

**Key operations:**

- `initializeBranchTable(tokenId, schema)` - CREATE TABLE
- `applyNodeOutput(tokenId, output, schema)` - INSERT into branch table
- `mergeBranches(siblings, merge, schema)` - Read branches, merge, write to context
- `dropBranchTables(tokenIds)` - DROP TABLE cleanup

**Schema-driven throughout:**

- Branch table DDL from node.output_schema
- Branch inserts via DML generator
- Merge validation against target path schema
- Type safety end-to-end
