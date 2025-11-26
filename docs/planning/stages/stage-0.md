# Stage 0: Vertical Slice

<!-- TODO: Stage 0-specific implementation details to decide:
- Seed script: exact data values for workspace, project, model_profile
- Workers AI: which model to use (@cf/meta/llama-3-8b-instruct?)
- Workflow structure: exact prompt template text
- Integration test: assertions to validate (context.output fields, event payload structure)
-->

## Goal

Create and persist a single-node LLM workflow, then execute it once.

## What It Proves

- Graph authoring → D1 persistence → retrieval → Workers AI execution → result storage

## The Workflow

```
[start] → [llm_node: "Summarize this text"] → [end]
```

Single node is both start and terminal (no transitions needed).

## Data Created

1. One `workspace` + `project` (seeded)
2. One `model_profile` (Workers AI Llama 3 8B)
3. One `prompt_spec` ("Summarize: {{input.text}}")
4. One `action` (llm_call referencing the prompt_spec + model_profile)
5. One `workflow_def` with one `node`
6. One `workflow` binding the def to the project
7. One `workflow_run` with result in `context.output` + `latest_snapshot`
8. One `token` (created → completed lifecycle)
9. Four `events` (workflow_started, node_started, node_completed, workflow_completed)

## Files

| File                                      | LOC est. | Purpose                                                         |
| ----------------------------------------- | -------- | --------------------------------------------------------------- |
| `domains/graph/repository.ts`             | ~80      | CRUD: workflow_defs, nodes, transitions                         |
| `domains/ai/repository.ts`                | ~60      | CRUD: prompt_specs, model_profiles                              |
| `domains/effects/repository.ts`           | ~40      | CRUD: actions                                                   |
| `domains/execution/repository.ts`         | ~70      | CRUD: workflow_runs, tokens                                     |
| `domains/execution/service.ts`            | ~120     | `executeWorkflow(workflowId, input)` — token lifecycle + events |
| `domains/events/repository.ts`            | ~30      | Write events to D1 (batch insert)                               |
| `infrastructure/clients/workers-ai.ts`    | ~30      | `runInference(model, messages)`                                 |
| `infrastructure/validation/schema.ts`     | ~40      | Validate context.input against workflow schema                  |
| `infrastructure/db/seed.ts`               | ~50      | Seed workspace, project, model_profile                          |
| `test/unit/validation/schema.test.ts`     | ~60      | Unit: schema validation edge cases                              |
| `test/unit/execution/service.test.ts`     | ~80      | Unit: token lifecycle, event sequencing (mock repositories)     |
| `test/integration/vertical-slice.test.ts` | ~100     | End-to-end test (including event/token assertions)              |

**~760 LOC total**

## Test

```typescript
// 1. Seed base data
// 2. Create prompt_spec, action, workflow_def, node, workflow
// 3. Call executeWorkflow({ text: "Long article..." })
// 4. Assert workflow_run.status === 'completed'
// 5. Assert workflow_run.context.output.summary exists
// 6. Assert workflow_run.latest_snapshot exists
// 7. Assert token created and completed
// 8. Assert 4 events emitted in correct sequence
```

## Scope Exclusions

- No fan-out/fan-in
- No transitions (single node)
- No triggers
- No artifacts
- No human input gates
- No sub-workflows

## Implementation Steps

### Step 1: Schema Validation (Pure Logic) ✅

**Files:** `infrastructure/validation/schema.ts` + `test/unit/validation/schema.test.ts`  
**What:** Validate objects against `SchemaType` definitions  
**Test:** Unit tests with mock schemas (valid/invalid inputs, nested objects, arrays, required fields)  
**Status:** Complete - 15 tests passing. Root-level fields required by convention, nested objects use `required` array.

### Step 2: Repository Layer (Data Access)

**Files:** `domains/graph/repository.ts`, `domains/ai/repository.ts`, `domains/effects/repository.ts`, `domains/execution/repository.ts`, `domains/events/repository.ts`  
**What:** D1 insert/select operations for each entity type  
**Test:** Simple CRUD test per repository (create entity, get by id, assert fields match)

### Step 3: Seed Data

**Files:** `infrastructure/db/seed.ts`  
**What:** Bootstrap workspace + project + model_profile  
**Test:** Run seed script, query D1 to verify entities exist with correct relationships

### Step 4: Workers AI Client

**Files:** `infrastructure/clients/workers-ai.ts`  
**What:** Thin wrapper around Workers AI binding  
**Test:** Integration test with real AI binding (or mock in test env), assert response structure

### Step 5: Execution Service (Mock LLM)

**Files:** `domains/execution/service.ts` + `test/unit/execution/service.test.ts`  
**What:** Token lifecycle, event emission, context initialization (stub LLM call for now)  
**Test:** Unit test with mocked repositories + LLM client, assert token/event sequences

### Step 6: End-to-End Integration

**Files:** Wire everything together  
**What:** Create workflow, execute with real Workers AI, validate full result  
**Test:** `test/integration/vertical-slice.test.ts` — complete vertical slice with real D1 + Workers AI

## Dependencies

- D1 database with schema migrated
- Workers AI binding configured in `wrangler.jsonc`
