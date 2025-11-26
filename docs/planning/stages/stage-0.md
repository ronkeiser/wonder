# Stage 0: Vertical Slice

## Goal

Create and persist a single-node LLM workflow, then execute it once using the proper DO-based coordination architecture.

## What It Proves

- Graph authoring → D1 persistence → retrieval
- **DO-based workflow coordination with SQLite context storage**
- **Queue-based task distribution (DO → Queue → Worker → DO)**
- Workers AI execution → result storage
- Proper separation: DO coordinates, Worker executes

## The Workflow

```
[start] → [llm_node: "Summarize this text"] → [end]
```

Single node is both start and terminal (no transitions needed).

## Architecture Flow

```
HTTP Request
  ↓
triggerWorkflow() creates run in D1, gets DO stub
  ↓
DO.executeWorkflow() initializes context in SQLite
  ↓
DO enqueues WorkflowTask to Queue
  ↓
Worker picks up task, executes LLM call
  ↓
Worker returns WorkflowTaskResult to DO
  ↓
DO updates context, emits events, completes workflow
```

## Data Created

1. One `workspace` + `project` (seeded)
2. One `model_profile` (Workers AI Llama 3 8B)
3. One `prompt_spec` ("Summarize: {{input.text}}")
4. One `action` (llm_call referencing the prompt_spec + model_profile)
5. One `workflow_def` with one `node`
6. One `workflow` binding the def to the project
7. One `workflow_run` with `durable_object_id` + result in `context.output`
8. **DO SQLite storage:** context (input, state, output as columns/tables), token state
9. Four `events` (workflow_started, node_started, node_completed, workflow_completed)

## Files

| File                                            | LOC est. | Purpose                                                       |
| ----------------------------------------------- | -------- | ------------------------------------------------------------- |
| `domains/graph/repository.ts`                   | ~80      | CRUD: workflow_defs, nodes, transitions                       |
| `domains/ai/repository.ts`                      | ~60      | CRUD: prompt_specs, model_profiles                            |
| `domains/effects/repository.ts`                 | ~40      | CRUD: actions                                                 |
| `domains/execution/repository.ts`               | ~70      | CRUD: workflow_runs (in D1)                                   |
| **`infrastructure/do/workflow-coordinator.ts`** | **~480** | **DO class using @wonder/schema DDL/DML for context storage** |
| **`infrastructure/queue/types.ts`**             | **~70**  | **WorkflowTask, WorkflowTaskResult, task queue types**        |
| `domains/execution/service.ts`                  | ~180     | `triggerWorkflow()` — creates run, invokes DO                 |
| **`domains/execution/worker.ts`**               | **~200** | **Worker task handler: execute action, return result**        |
| `domains/events/repository.ts`                  | ~30      | Write events to D1 (batch insert)                             |
| `infrastructure/clients/workers-ai.ts`          | ~30      | `runInference(model, messages)`                               |
| `infrastructure/validation/schema.ts`           | ~40      | Validate context.input against workflow schema                |
| `infrastructure/db/seed.ts`                     | ~50      | Seed workspace, project, model_profile                        |
| `test/unit/validation/schema.test.ts`           | ~60      | Unit: schema validation edge cases                            |
| `test/unit/do/workflow-coordinator.test.ts`     | ~120     | Unit: DO coordination logic (mocked queue)                    |
| `test/integration/vertical-slice.test.ts`       | ~120     | End-to-end test with real DO, Queue, Worker                   |

**~1,380 LOC total** (+620 for DO coordination)

**Note:** Removed `infrastructure/do/context-storage.ts` - using `@wonder/schema` DDL/DML generators directly instead of duplicating functionality.

## Test

```typescript
// 1. Seed base data
// 2. Create prompt_spec, action, workflow_def, node, workflow
// 3. Call triggerWorkflow(workflowId, { text: "Long article..." })
// 4. Wait for async execution (DO → Queue → Worker → DO)
// 5. Assert workflow_run.status === 'completed'
// 6. Assert workflow_run.context.output.summary exists
// 7. Query DO SQLite directly to verify context storage structure
// 8. Assert 4 events emitted in correct sequence
// 9. Verify durable_object_id set correctly
```

## Scope Exclusions

- No fan-out/fan-in (but DO fan-in tracking structure exists)
- No transitions (single node)
- No triggers (direct HTTP invocation only)
- No artifacts
- No human input gates
- No sub-workflows (but DO isolation pattern proven)
- No snapshots (structure exists, creation deferred)
- Simplified context storage (all scalars only, no arrays/complex objects)

## Implementation Steps

### Step 1: Schema Validation (Pure Logic) ✅

**Files:** `infrastructure/validation/schema.ts` + `test/unit/validation/schema.test.ts`  
**What:** Validate objects against `SchemaType` definitions  
**Test:** Unit tests with mock schemas (valid/invalid inputs, nested objects, arrays, required fields)  
**Status:** Complete - 15 tests passing. Root-level fields required by convention, nested objects use `required` array.

### Step 2: Repository Layer (Data Access) ✅

**Files:** `domains/graph/repository.ts`, `domains/ai/repository.ts`, `domains/effects/repository.ts`, `domains/execution/repository.ts`, `domains/events/repository.ts`  
**What:** D1 insert/select operations for each entity type  
**Test:** Simple CRUD test per repository (create entity, get by id, assert fields match)  
**Status:** Complete - 24 tests passing across 5 repository test files.

### Step 3: Seed Data ✅

**Files:** `src/infrastructure/db/migrations/0002_initial_seed.sql`, `test/helpers/migrate.ts`  
**What:** Bootstrap workspace + project + model_profile via SQL migration  
**Test:** Migration applied successfully, seed data verified in local D1  
**Status:** Complete

### Step 4: Workers AI Client ✅

**Files:** `infrastructure/clients/workers-ai.ts`  
**What:** Thin wrapper around Workers AI binding  
**Test:** Integration test with real AI binding (or mock in test env), assert response structure  
**Status:** Complete - 6 tests passing (5 mocked, 1 ReadableStream, 1 error handling)

### Step 5: DO Coordinator Implementation ✅

**Files:** `infrastructure/do/workflow-coordinator.ts`, `infrastructure/queue/types.ts`  
**What:** Durable Object class that owns workflow run state, manages context in SQLite, coordinates task execution  
**Key Methods:**

- `executeWorkflow(workflowId, input)` - initialize run, create context tables
- `enqueueTask(token, node, action)` - send WorkflowTask to Queue
- `receiveTaskResult(result)` - update context, advance token, emit events
- Context storage: map `context.input`, `context.state`, `context.output` to SQLite columns

**Test:** Unit test with mocked queue binding, assert context storage and task coordination  
**Status:** Complete - ~480 LOC implemented. Uses @wonder/schema DDL/DML generators for context storage.

### Step 6: Worker Task Handler ✅

**Files:** `domains/execution/worker.ts`  
**What:** Worker handler that receives WorkflowTask from Queue, executes action, returns WorkflowTaskResult to DO  
**Test:** Unit test with mocked AI client, assert task execution and result structure  
**Status:** Complete - ~200 LOC implemented. Executes LLM calls and sends results back to DO.

### Step 7: Trigger Service (Updated) ✅

**Files:** `domains/execution/service.ts` (refactored from monolithic executor to thin trigger)  
**What:** `triggerWorkflow(workflowId, input)` - creates run in D1, gets DO stub, invokes DO.executeWorkflow()  
**Test:** Unit tests updated for new async architecture (4 tests passing)  
**Status:** Complete - Refactored to DO-based architecture. Returns immediately with status='running'.

### Step 8: End-to-End Integration

**Files:** Wire everything together with DO, Queue, Worker coordination  
**What:** Create workflow, trigger execution, validate async coordination through DO → Queue → Worker → DO  
**Test:** `test/integration/vertical-slice.test.ts` — complete vertical slice with real D1 + DO + Queue + Workers AI  
**Validation:**

- Workflow run created with durable_object_id
- DO SQLite contains context data in proper schema
- Task enqueued and processed by worker
- Result returned to DO and context updated
- Events persisted to D1 in correct sequence
- Final status 'completed' with output

**Status:** Needs implementation
