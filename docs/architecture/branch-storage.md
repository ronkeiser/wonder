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
// WorkflowDef.contextSchema
contextSchema: {
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
// Task.outputSchema (referenced by Node via taskId)
outputSchema: {
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
class ContextManager {
  constructor(sql: SqlStorage, defs: DefinitionManager, emitter: Emitter);

  // Initialize context tables from workflow schemas and store input
  initialize(input: Record<string, unknown>): void;

  // Read from main context
  getSection(section: string): Record<string, unknown>;
  get(path: string): unknown;
  getSnapshot(): ContextSnapshot;

  // Write to main context
  setField(path: string, value: unknown): void;
  replaceSection(section: string, data: Record<string, unknown>): void;

  // Apply node's outputMapping to write task output to context (linear flows)
  applyOutputMapping(
    outputMapping: Record<string, string> | null,
    taskOutput: Record<string, unknown>,
  ): void;

  // Branch storage operations (parallel flows)
  initializeBranchTable(tokenId: string, outputSchema: JSONSchema): void;
  applyBranchOutput(tokenId: string, output: Record<string, unknown>): void;
  getBranchOutputs(
    tokenIds: string[],
    branchIndices: number[],
    outputSchema: JSONSchema,
  ): BranchOutput[];
  mergeBranches(branchOutputs: BranchOutput[], merge: MergeConfig): void;
  dropBranchTables(tokenIds: string[]): void;
}

type BranchOutput = {
  tokenId: string;
  branchIndex: number;
  output: unknown;
};

type MergeConfig = {
  source: string;  // Path in branch output (e.g., '_branch.output')
  target: string;  // Where to write merged result (e.g., 'state.votes')
  strategy: 'append' | 'collect' | 'merge_object' | 'keyed_by_branch' | 'last_wins';
};
```

## Lifecycle

### 1. Fan-out: Create Branch Tables

When a token is created during fan-out:

```typescript
// In dispatch/apply.ts handling CREATE_TOKEN decision
const token = operations.tokens.create(decision);

// Create isolated branch output table if node has outputSchema
const outputSchema = defs.getNode(decision.nodeId).outputSchema;
if (outputSchema) {
  context.initializeBranchTable(token.id, outputSchema);
}

dispatch(token.id);
```

Implementation uses `@wonder/schemas` Schema class:

```typescript
initializeBranchTable(tokenId: string, outputSchema: JSONSchema): void {
  const tableName = `branch_output_${tokenId}`;
  const schema = new Schema(outputSchema);
  const table = schema.bind(this.sql, tableName, this.sqlHook);
  table.create();
  this.branchTables.set(tokenId, table);  // Cache for later use
}
```

### 2. Execution: Write to Branch Table

When executor returns a result:

```typescript
// In dispatch/apply.ts handling COMPLETE_TOKEN decision for branch tokens
// Output is written to branch table for later merge
context.applyBranchOutput(tokenId, result.output);
```

Implementation uses cached SchemaTable:

```typescript
applyBranchOutput(tokenId: string, output: Record<string, unknown>): void {
  const table = this.branchTables.get(tokenId);
  if (!table) {
    throw new Error(`Branch table not found for token ${tokenId}`);
  }

  // Validate output against schema
  const result = table.validate(output);
  if (!result.valid) {
    throw new Error(`Branch output validation failed: ${result.errors.map((e) => e.message).join(', ')}`);
  }

  table.insert(output);
}
```

### 3. Fan-in: Merge Branch Tables

When synchronization condition is met, planning emits decisions:

```typescript
// In planning/synchronization.ts
if (syncConditionMet) {
  const merge = transition.synchronization!.merge!;

  return [
    {
      type: 'MERGE_BRANCHES',
      tokenIds: siblingTokenIds,
      branchIndices: siblingBranchIndices,
      outputSchema: nodeOutputSchema,
      merge,
    },
    {
      type: 'DROP_BRANCH_TABLES',
      tokenIds: siblingTokenIds,
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
  const branchOutputs = context.getBranchOutputs(
    decision.tokenIds,
    decision.branchIndices,
    decision.outputSchema,
  );
  context.mergeBranches(branchOutputs, decision.merge);
  break;
}

case 'DROP_BRANCH_TABLES': {
  context.dropBranchTables(decision.tokenIds);
  break;
}
```

### 4. Merge Strategies

```typescript
mergeBranches(branchOutputs: BranchOutput[], merge: MergeConfig): void {
  // Extract outputs based on source path
  const extractedOutputs = branchOutputs.map((b) => {
    if (merge.source === '_branch.output') {
      return b;
    }
    // Extract nested path from output (e.g., '_branch.output.ideas')
    const path = merge.source.replace('_branch.output.', '');
    return { ...b, output: getNestedValue(b.output, path) };
  });

  // Apply merge strategy
  let merged: unknown;
  switch (merge.strategy) {
    case 'append': /* ... */ break;
    case 'collect': /* ... */ break;
    case 'merge_object': /* ... */ break;
    case 'keyed_by_branch': /* ... */ break;
    case 'last_wins': /* ... */ break;
  }

  // Write to target path in context
  this.setField(merge.target, merged);
}
```

**Merge strategies:**

- **append** - Collect all outputs into array, ordered by branch index. If all outputs are arrays, flattens them.

  ```typescript
  const sorted = extractedOutputs.sort((a, b) => a.branchIndex - b.branchIndex);
  const outputs = sorted.map((b) => b.output);
  merged = outputs.every((o) => Array.isArray(o)) ? outputs.flat() : outputs;
  // Result: [{ choice: 'A', rationale: '...' }, { choice: 'B', ... }, ...]
  // Or if outputs are arrays: [item1, item2, item3, item4, ...]
  ```

- **collect** - Collect all outputs into array, preserving structure (no flattening)

  ```typescript
  const sorted = extractedOutputs.sort((a, b) => a.branchIndex - b.branchIndex);
  merged = sorted.map((b) => b.output);
  // Result: [[a,b], [c,d]] instead of [a,b,c,d]
  ```

- **merge_object** - Shallow merge all outputs

  ```typescript
  merged = Object.assign({}, ...extractedOutputs.map((b) => b.output));
  // Result: { choice: 'B', rationale: '...' } (last wins for conflicts)
  ```

- **keyed_by_branch** - Object keyed by branch index

  ```typescript
  merged = Object.fromEntries(extractedOutputs.map((b) => [b.branchIndex.toString(), b.output]));
  // Result: { '0': {...}, '1': {...}, '2': {...} }
  ```

- **last_wins** - Take highest branch index
  ```typescript
  const sorted = extractedOutputs.sort((a, b) => b.branchIndex - a.branchIndex);
  merged = sorted[0]?.output ?? {};
  // Result: { choice: 'A', rationale: '...' }
  ```

## Schema Considerations

### Branch Output Schema Sources

Output schemas come from:

1. **Task.outputSchema** - Primary source, defines what the task produces (used for branch table DDL)
2. **Structured LLM output** - For LLM actions with JSON schema output validation

Note: Nodes don't have outputSchema - they reference Tasks via `taskId` and `taskVersion`. The node's `outputMapping` maps task output to context paths.

### Merge Target Validation

The merged result must match the target path's schema:

```typescript
// Merge config
merge: {
  source: '_branch.output',  // All of branch output
  target: 'state.votes',     // Array in state schema
  strategy: 'append'
}

// Validation
const targetSchema = getSchemaAtPath(workflow.contextSchema, 'state.votes');
// targetSchema = { type: 'array', items: { ... } }

const merged = applyMergeStrategy(branchData, 'append');
validateSchema(merged, targetSchema);  // Must be array of vote objects
```

### Nested Objects in Branch Output

If a node's output schema defines nested objects:

```typescript
// Node.outputSchema
outputSchema: {
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

## Decision Types

Branch storage uses these decision types:

```typescript
type Decision =
  // ... existing decisions
  | {
      type: 'MERGE_BRANCHES';
      tokenIds: string[];
      branchIndices: number[];
      outputSchema: JSONSchema;
      merge: MergeConfig;
    }
  | {
      type: 'DROP_BRANCH_TABLES';
      tokenIds: string[];
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
- Task outputs write to isolated branch tables via `@wonder/schemas` DML
- Fan-in reads all sibling branch tables, merges, writes to main context
- Branch tables dropped after merge (cleanup)

**Alternative: Single table with token_id column for simplicity**

**Key operations:**

- `initializeBranchTable(tokenId, outputSchema)` - CREATE TABLE using @wonder/schemas
- `applyBranchOutput(tokenId, output)` - INSERT into branch table with validation
- `getBranchOutputs(tokenIds, branchIndices, outputSchema)` - Read from branch tables
- `mergeBranches(branchOutputs, merge)` - Apply merge strategy, write to context
- `dropBranchTables(tokenIds)` - DROP TABLE cleanup

**Schema-driven throughout:**

- Branch table DDL from Task.outputSchema via @wonder/schemas
- Branch inserts via SchemaTable.insert() with validation
- Merge validation against target path schema
- Type safety end-to-end
