# Branch Storage: SQL-based Isolation

## Problem Statement

During parallel execution (fan-out), multiple tokens execute simultaneously and produce outputs. These outputs must be:

1. **Isolated** - No shared state mutation between branches
2. **Mergeable** - Collected at fan-in points
3. **Schema-validated** - Type-safe via `@wonder/schema`
4. **SQL-native** - Stored in DO SQLite, not JSON blobs

The challenge: How do we store branch-isolated data in schema-driven SQL tables?

## Design: Token-Scoped Tables

### Approach

Each branch writes to **separate ephemeral tables** prefixed by token ID. At fan-in, data is read from all sibling token tables, merged according to strategy, and written to the main context tables.

**Key insight:** Branch isolation is achieved through table namespacing, not row filtering.

### Example: 5-way fan-out for voting

**Workflow state schema:**

```typescript
state_schema: {
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

**Node output schema (each judge):**

```typescript
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
    mergeConfig: MergeConfig,
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
const nodeOutputSchema = workflow.nodes.find((n) => n.id === params.node_id)?.output_schema;

if (nodeOutputSchema) {
  operations.context.initializeBranchTable(sql, token.id, nodeOutputSchema);
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
operations.context.applyNodeOutput(sql, tokenId, result.output_data, node.output_schema);
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
  return [
    {
      type: 'MERGE_BRANCHES',
      siblings: siblingTokens,
      mergeConfig: transition.synchronization.merge,
      outputSchema: node.output_schema,
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
    decision.mergeConfig,
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
  mergeConfig: MergeConfig,
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
  const merged = applyMergeStrategy(branchData, mergeConfig.strategy);

  // Write to main context
  operations.context.set(sql, mergeConfig.target, merged);
}
```

**Merge strategies:**

- **append** - Collect all outputs into array

  ```typescript
  merged = branchData.map((b) => b.output);
  // Result: [{ choice: 'A', rationale: '...' }, { choice: 'B', ... }, ...]
  ```

- **merge** - Shallow merge all outputs

  ```typescript
  merged = Object.assign({}, ...branchData.map((b) => b.output));
  // Result: { choice: 'B', rationale: '...' } (last wins for conflicts)
  ```

- **keyed** - Object keyed by branch index

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

Node output schemas come from:

1. **Explicit definition** - `NodeDef.output_schema` (user-defined)
2. **Action schema** - `ActionDef.produces` (default from action type)
3. **Inferred from LLM** - For `llm_call` actions with structured output

### Merge Target Validation

The merged result must match the target path's schema:

```typescript
// Merge config
merge: {
  source: '*',  // All of branch output
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

If a branch produces nested objects:

```typescript
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

Branch table structure (flattened by `@wonder/schema`):

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

## Alternative: Single Table with token_id Column

**Simpler approach:** Use a single branch_output table with a `token_id` discriminator column.

```sql
CREATE TABLE branch_outputs (
  id INTEGER PRIMARY KEY,
  token_id TEXT NOT NULL,
  choice TEXT CHECK (choice IN ('A', 'B')),
  rationale TEXT
);

CREATE INDEX idx_branch_outputs_token ON branch_outputs(token_id);
```

**Pros:**

- Fewer tables (no CREATE/DROP per token)
- Simpler schema management
- Works with any number of parallel branches

**Cons:**

- Shared table for all branches (potential contention, though mitigated by DO single-threading)
- Harder to enforce per-branch schema constraints
- Manual cleanup (DELETE WHERE token_id IN (...))

**Recommendation:** Start with token_id column approach for simplicity. Profile and switch to separate tables if CREATE/DROP overhead is acceptable.

## Decision Type Addition

Add new decision type for merge:

```typescript
type Decision =
  // ... existing decisions
  {
    type: 'MERGE_BRANCHES';
    siblings: TokenRow[];
    mergeConfig: MergeConfig;
    outputSchema: JSONSchema;
  };
```

## Path Syntax Clarification

With this design, merge source paths are:

- `*` - Entire branch output object
- `choice` - Single field from branch output
- `reasoning.pros` - Nested field from branch output

**Not** `_branch.output.choice` - the `_branch` prefix is implicit when reading from branch tables during merge.

Target paths are standard JSONPath into main context:

- `state.votes` - Array in state
- `state.results.final` - Nested object in state
- `output.winner` - Top-level output field

## Summary

**Branch isolation via table namespacing:**

- Each token gets `branch_output_{tokenId}` table(s) during fan-out
- Node outputs write to isolated branch tables via `@wonder/schema` DML
- Fan-in reads all sibling branch tables, merges, writes to main context
- Branch tables dropped after merge (cleanup)

**Alternative: Single table with token_id column for simplicity**

**Key operations:**

- `initializeBranchTable(tokenId, schema)` - CREATE TABLE
- `applyNodeOutput(tokenId, output, schema)` - INSERT into branch table
- `mergeBranches(siblings, mergeConfig, schema)` - Read branches, merge, write to context
- `dropBranchTables(tokenIds)` - DROP TABLE cleanup

**Schema-driven throughout:**

- Branch table DDL from node.output_schema
- Branch inserts via DML generator
- Merge validation against target path schema
- Type safety end-to-end
