# ID/Ref Conflation Issues

## Summary

The codebase currently conflates **IDs (ULIDs)** with **refs (human-readable references)**, especially in workflow definition creation. This document outlines the issues and required corrections.

## Core Distinction

- **IDs (ULIDs)**: Server-generated, globally unique, sortable identifiers. Used for all persistence and foreign key relationships.
- **Refs**: Client-provided, human-readable, workflow-scoped identifiers. Used during authoring to reference nodes/transitions before ULIDs are assigned.

## Current Issues

### 1. Schema Design Issues

**File**: `services/api/src/infrastructure/db/schema.ts`

**Problem**: No `ref` column on nodes or transitions tables.

```typescript
// Current schema (lines 118-145)
export const nodes = sqliteTable('nodes', {
  id: text('id').notNull(), // ULID only, no ref field
  workflow_def_id: text('workflow_def_id').notNull(),
  workflow_def_version: integer('workflow_def_version').notNull(),
  name: text('name').notNull(),
  action_id: text('action_id').notNull(),
  // ...
});

export const transitions = sqliteTable('transitions', {
  id: text('id').notNull(), // ULID only, no ref field
  workflow_def_id: text('workflow_def_id').notNull(),
  workflow_def_version: integer('workflow_def_version').notNull(),
  from_node_id: text('from_node_id').notNull(), // References ULID
  to_node_id: text('to_node_id').notNull(), // References ULID
  // ...
});
```

**Required Fix**:

- Add `ref` column to `nodes` table (unique within workflow_def_id)
- Add `ref` column to `transitions` table (unique within workflow_def_id)
- Keep foreign keys using ULIDs (`from_node_id`, `to_node_id`)

### 2. API Schema Issues

**File**: `services/http/src/schemas.ts`

**Problem**: CreateWorkflowDefSchema expects client to provide node IDs and uses them in transitions.

```typescript
// Lines 275-303
export const CreateWorkflowDefSchema = z.object({
  // ...
  initial_node_id: z.string().min(1).openapi({ example: 'node-1' }),
  nodes: z.array(
    z.object({
      id: z.string().min(1), // ❌ Client provides ID (should be ref)
      name: z.string().min(1),
      action_id: z.string().min(1),
      // ...
    }),
  ),
  transitions: z.array(
    z.object({
      from_node_id: z.string().min(1), // ❌ References client-provided ID
      to_node_id: z.string().min(1), // ❌ References client-provided ID
      // ...
    }),
  ),
});
```

**Required Fix**:

```typescript
export const CreateWorkflowDefSchema = z.object({
  // ...
  initial_node_ref: z.string().min(1).openapi({ example: 'start_node' }), // ✅ Changed
  nodes: z.array(
    z.object({
      ref: z
        .string()
        .min(1)
        .regex(/^[a-z_][a-z0-9_]*$/), // ✅ snake_case ref
      name: z.string().min(1),
      action_id: z.string().min(1), // ✅ This is correct - references existing action
      // ...
    }),
  ),
  transitions: z.array(
    z.object({
      from_node_ref: z.string().min(1), // ✅ References node ref
      to_node_ref: z.string().min(1), // ✅ References node ref
      // ...
    }),
  ),
});
```

### 3. RPC Implementation Issues

**File**: `services/api/src/rpc/workflow-defs.ts`

**Problem**: Creates nodes with client-provided IDs, doesn't validate ref uniqueness, doesn't translate refs to ULIDs.

```typescript
// Lines 29-72 (simplified)
async create(data) {
  const workflowDef = await graphRepo.createWorkflowDef(this.serviceCtx.db, {
    // ...
    initial_node_id: null,  // ❌ Should use ref, resolve later
  });

  let firstNodeId: string | null = null;
  for (const nodeData of data.nodes) {
    const node = await graphRepo.createNode(this.serviceCtx.db, {
      workflow_def_id: workflowDef.id,
      workflow_def_version: workflowDef.version,
      name: nodeData.name,
      action_id: nodeData.action_id,  // ✅ This is correct - ULID reference
      // ❌ No ref field being set
      // ...
    });
    if (firstNodeId === null) {
      firstNodeId = node.id;  // ❌ Uses ULID directly
    }
  }

  // ❌ Transitions created with client-provided node IDs
  if (data.transitions) {
    for (const transitionData of data.transitions) {
      await graphRepo.createTransition(this.serviceCtx.db, {
        id: transitionData.id,  // ❌ Client provides transition ID
        // ...
        from_node_id: transitionData.from_node_id,  // ❌ Client-provided
        to_node_id: transitionData.to_node_id,      // ❌ Client-provided
        // ...
      });
    }
  }
}
```

**Required Fix**:

```typescript
async create(data) {
  // 1. Validate all node refs are unique
  const nodeRefs = new Set<string>();
  for (const nodeData of data.nodes) {
    if (nodeRefs.has(nodeData.ref)) {
      throw new ValidationError(`Duplicate node ref: ${nodeData.ref}`);
    }
    nodeRefs.add(nodeData.ref);
  }

  // 2. Validate all transition refs point to valid nodes
  for (const transition of data.transitions ?? []) {
    if (!nodeRefs.has(transition.from_node_ref)) {
      throw new ValidationError(`Invalid from_node_ref: ${transition.from_node_ref}`);
    }
    if (!nodeRefs.has(transition.to_node_ref)) {
      throw new ValidationError(`Invalid to_node_ref: ${transition.to_node_ref}`);
    }
  }

  // 3. Validate initial_node_ref exists
  if (!nodeRefs.has(data.initial_node_ref)) {
    throw new ValidationError(`Invalid initial_node_ref: ${data.initial_node_ref}`);
  }

  // 4. Create workflow def (initial_node_id will be set after nodes created)
  const workflowDef = await graphRepo.createWorkflowDef(this.serviceCtx.db, {
    // ...
    initial_node_id: null,  // Temporary
  });

  // 5. Create nodes, build ref→ULID map
  const refToIdMap = new Map<string, string>();
  for (const nodeData of data.nodes) {
    const node = await graphRepo.createNode(this.serviceCtx.db, {
      workflow_def_id: workflowDef.id,
      workflow_def_version: workflowDef.version,
      ref: nodeData.ref,  // ✅ Store ref
      name: nodeData.name,
      action_id: nodeData.action_id,  // ✅ Already a ULID
      // ...
    });
    refToIdMap.set(nodeData.ref, node.id);
  }

  // 6. Update initial_node_id using resolved ULID
  const initialNodeId = refToIdMap.get(data.initial_node_ref)!;
  await graphRepo.updateWorkflowDef(this.serviceCtx.db, workflowDef.id, workflowDef.version, {
    initial_node_id: initialNodeId,
  });

  // 7. Create transitions using resolved ULIDs
  if (data.transitions) {
    for (const transitionData of data.transitions) {
      await graphRepo.createTransition(this.serviceCtx.db, {
        // ✅ Server assigns ULID
        workflow_def_id: workflowDef.id,
        workflow_def_version: workflowDef.version,
        from_node_id: refToIdMap.get(transitionData.from_node_ref)!,  // ✅ Resolved
        to_node_id: refToIdMap.get(transitionData.to_node_ref)!,      // ✅ Resolved
        // ...
      });
    }
  }
}
```

### 4. Test Issues

**File**: `packages/e2e/src/tests/workflow-execution.test.ts`

**Problem**: Test doesn't provide node IDs or transition information at all.

```typescript
// Lines 75-110
const { data: workflowDefResponse, error: wfDefError } = await client.POST('/api/workflow-defs', {
  body: {
    // ...
    nodes: [
      {
        name: 'LLM Node',
        action_id: actionResponse!.action.id,
        action_version: 1,
        input_mapping: { name: '$.input.name' },
        output_mapping: { response: '$.response' },
        // ❌ Missing: ref, id, or any way to reference this node
      },
    ],
    // ❌ Missing: transitions array
    // ❌ Missing: initial_node_id or initial_node_ref
  },
});
```

**Required Fix**:

```typescript
body: {
  // ...
  initial_node_ref: 'llm_greet',  // ✅ Human-readable ref
  nodes: [
    {
      ref: 'llm_greet',  // ✅ snake_case ref
      name: 'LLM Node',
      action_id: actionResponse!.action.id,
      action_version: 1,
      input_mapping: { name: '$.input.name' },
      output_mapping: { response: '$.response' },
    },
  ],
  // Optional: transitions array (empty for single-node workflow)
  transitions: [],
}
```

### 5. Documentation Gaps

**File**: `docs/architecture/primitives.ts`

**Problem**: NodeDef and TransitionDef don't include ref field.

```typescript
// Lines 172-218
export type NodeDef = {
  id: string; // ✅ ULID
  workflow_def_id: string;
  name: string;
  action_id: string;
  // ❌ Missing: ref field
  // ...
};

export type TransitionDef = {
  id: string; // ✅ ULID
  workflow_def_id: string;
  from_node_id: string; // ✅ ULID reference
  to_node_id: string; // ✅ ULID reference
  // ❌ Missing: ref field
  // ...
};
```

**Required Fix**:

```typescript
export type NodeDef = {
  id: string; // ULID (server-assigned)
  ref: string; // human-readable reference (client-provided, unique per workflow)
  workflow_def_id: string;
  name: string;
  action_id: string; // ULID reference to action
  // ...
};

export type TransitionDef = {
  id: string; // ULID (server-assigned)
  ref?: string; // optional human-readable reference
  workflow_def_id: string;
  from_node_id: string; // ULID reference (resolved from from_node_ref at creation)
  to_node_id: string; // ULID reference (resolved from to_node_ref at creation)
  // ...
};
```

## Additional Considerations

### Client Authoring Payloads vs Stored Entities

**Authoring Payload** (what client sends):

- Uses `ref` fields everywhere
- No ULIDs (server assigns them)
- Transitions reference nodes via `from_node_ref` / `to_node_ref`

**Stored Entity** (what's in database):

- Has both `id` (ULID) and `ref` fields
- Foreign keys use ULIDs (`from_node_id`, `to_node_id`)
- Refs stored for human reference and lookup

**Response Payload** (what API returns):

- Includes both `id` and `ref` for all entities
- Client can use refs for display
- Client can use `findByRef(workflowDefId, ref)` helper when needed

### SDK Helper Functions

Provide convenience functions:

```typescript
// SDK helper
async function findNodeByRef(workflowDefId: string, ref: string): Promise<NodeDef | null> {
  // Query: SELECT * FROM nodes WHERE workflow_def_id = ? AND ref = ?
}

async function findTransitionByRef(
  workflowDefId: string,
  ref: string,
): Promise<TransitionDef | null> {
  // Query: SELECT * FROM transitions WHERE workflow_def_id = ? AND ref = ?
}
```

### Validation Rules

1. **Node refs**: Must be unique within a workflow_def_id
2. **Transition refs**: Must be unique within a workflow_def_id (if provided)
3. **Ref format**: `^[a-z_][a-z0-9_]*$` (snake_case)
4. **Transition resolution**: All `from_node_ref`/`to_node_ref` must resolve to existing node refs
5. **Initial node**: `initial_node_ref` must resolve to an existing node ref

## Migration Path

1. **Schema changes**: Add `ref` column to `nodes` and `transitions` tables
2. **Repository updates**: Update create/get functions to handle refs
3. **API schema changes**: Change request schemas to use refs instead of IDs
4. **RPC implementation**: Add validation and ref→ULID translation logic
5. **Tests**: Update to provide refs instead of IDs
6. **Documentation**: Update primitives.ts and architecture docs

## Files Requiring Changes

1. `services/api/src/infrastructure/db/schema.ts` - Add ref columns
2. `services/api/src/domains/graph/repository.ts` - Support ref in create/query
3. `services/http/src/schemas.ts` - Change API schemas to use refs
4. `services/api/src/rpc/workflow-defs.ts` - Add validation & translation
5. `packages/e2e/src/tests/workflow-execution.test.ts` - Use refs in test
6. `docs/architecture/primitives.ts` - Add ref to type definitions
7. New: `services/api/src/domains/graph/helpers.ts` - Add findByRef functions
