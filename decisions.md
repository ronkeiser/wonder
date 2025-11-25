# Key Design Decisions

Insights from workflow editor walkthrough (Nov 2024).

---

## 1. Unified Node Model Works in UI

The fan_out/fan_in model translates cleanly to no-code:

- Any node can have **Parallel Execution** settings
- **Fan Out**: "All" + branch count (static or `{{input.num_judges}}`)
- **Fan In**: "All" or "Any" or "M of N" + select which node to join
- **Merge**: source path, target path, strategy (append, merge, keyed, last_wins)

Visual indicators: `×N` badge for fan-out, `⊕` for fan-in.

---

## 2. Structured Outputs for LLM Nodes

LLM call nodes should define **output schema**:

- Guarantees structure for downstream references
- Enables autocomplete in prompt templates: `{{state.ideas[0].title}}`
- Schema defined inline on the node (local implementation detail)

Prompt templates use handlebars: `{{input.task}}`, `{{#each state.ideas}}`.

---

## 3. Two-Tier Data Model: Local State vs Artifacts

|                   | Local State                         | Artifacts                                |
| ----------------- | ----------------------------------- | ---------------------------------------- |
| **Scope**         | Current workflow/sub-workflow       | Global, persisted                        |
| **Lifetime**      | Discarded after completion          | Permanent                                |
| **Purpose**       | Working data (`ideas[]`, `votes[]`) | Intentional outputs (reports, decisions) |
| **Observability** | Logged in events                    | Logged + searchable (Vectorize, D1)      |

Local state is ephemeral _for runtime_ but _recorded in events_ for debugging/analytics.

---

## 4. Sub-Workflows Are the Scope Boundary

When a node calls a sub-workflow via `workflow_call`:

- Sub-workflow gets **fresh, isolated context**
- No access to parent state except via explicit `input_mapping`
- Returns results via explicit `output_mapping`
- Parent's `state.*` is untouched during sub-workflow execution

**Why isolation wins**:

- Clean, predictable, parallelizable
- No race conditions when multiple sub-workflows run in parallel
- Sub-workflows are pure functions: inputs → outputs
- A reasoning strategy 6 layers deep doesn't know or care about its ancestors

---

## 5. Deep Nesting is Expected

Real workflows will have 5-6+ layers:

```
Review PRs
  → Per PR (×10)
    → Per Commit (×N)
      → Per File (×M)
        → tree_of_thought (reasoning strategy)
          → internal nodes
```

Each layer fans out, calls sub-workflows, fans in. The model handles this because:

- Each sub-workflow is isolated
- Parent/child linked via `parent_run_id`, `parent_node_id`
- Events trace the full tree

---

## 6. Observability Without Shared State

Sub-workflows are **isolated for state** but **connected for observability**.

The system knows:

- Token positions at every layer (`path_id`: `"pr.3.commit.2.file.5"`)
- Full run tree (`parent_run_id` links)
- All state changes (in event log)

UI can show:

- Live tree view with completion status at each level
- Aggregated metrics (tokens active, LLM calls, spend)
- Drill-down to any node's inputs/outputs/errors

---

## 7. Known Risks to Validate

### DO Coordination at Scale

- One DO per top-level run coordinating thousands of tokens
- May need sub-workflow DOs with cross-DO coordination
- **Needs load testing**

### Event Volume

- 6 layers × fan-out = potentially 50k+ events per run
- Compaction, batching, aggregation strategies exist but need implementation
- **Needs real-world benchmarks**

### Error Propagation

- How do failures bubble up through 6 layers?
- `on_failure` exists but full error UX needs design
- **Needs detailed error handling spec**

### Timeouts and Stuck Workflows

- Human input 4 layers deep, no response for days
- How to surface, timeout, unstick?
- **Needs intervention tooling design**

---

## 8. Two-Layer Error Handling

Errors split into infrastructure vs business logic:

| Layer            | Handles                        | Configured By                             |
| ---------------- | ------------------------------ | ----------------------------------------- |
| **Queue/Worker** | Retries, timeouts, rate limits | Platform defaults + action-level override |
| **Workflow**     | Business logic errors          | Transitions with conditions               |

### Infrastructure Errors (Invisible)

Transient failures handled automatically—workflow author never sees them:

- LLM API timeout, rate limits (429), network blips
- Exponential backoff, max 3 attempts by default
- Action either succeeds (after retries) or fails permanently

Configured on `ActionDef` or `NodeDef`:

```typescript
retry?: {
  max_attempts?: number;       // default 3
  backoff_ms?: number;         // default 1000
  timeout_ms?: number;         // per-attempt timeout
}
```

### Business Logic Errors (Workflow-Level)

Meaningful failures the workflow should handle:

- LLM output doesn't make sense
- External API returns "not found" or "conflict"
- Human rejects at gate

These become transition conditions:

```
Node (call API)
  → Transition: success → Continue
  → Transition: "not_found" → Handle Missing
```

---

## Summary

The model is sound:

- Unified nodes with fan_out/fan_in
- Isolated sub-workflows with explicit I/O mapping
- Local state + global artifacts
- Full observability via events and run tree

Implementation will find edge cases. Build, measure, iterate.
