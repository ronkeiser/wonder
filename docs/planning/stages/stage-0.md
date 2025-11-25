# Stage 0: Vertical Slice

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

## Dependencies

- D1 database with schema migrated
- Workers AI binding configured in `wrangler.jsonc`
