# Borrowed Ideas: Implementation Guide

This document catalogs concepts from Temporal, DSPy, and LangGraph that inform Wonder's design. Each idea is classified by implementation approach and mapped to Wonder's architecture.

## Summary

| Idea                         | Source    | Approach             | Effort          |
| ---------------------------- | --------- | -------------------- | --------------- |
| Assertions / Self-Refinement | DSPy      | Task pattern         | Library         |
| Prompt Optimization          | DSPy      | Workflow pattern     | Library         |
| Saga / Compensation          | Temporal  | Git revert pattern   | Library         |
| Cross-Run Memory             | LangGraph | Artifacts repo       | Already exists  |
| Fork from Checkpoint         | LangGraph | Branch from SHA      | API addition    |
| PR-Style Human Gates         | Temporal  | Workflow pattern     | Library         |
| Evaluation Harness           | DSPy      | Workflow pattern     | Library         |
| Example Harvesting           | DSPy      | Workflow pattern     | Library         |
| On-Conflict Routing          | Temporal  | Transition extension | Minor platform  |
| Async Signals                | Temporal  | DO entry point       | Minor platform  |
| Heartbeats                   | Temporal  | Protocol extension   | Medium platform |
| Continue-As-New              | Temporal  | Run chaining         | Medium platform |
| Queries                      | Temporal  | API endpoint         | Minor platform  |

---

## Library Patterns

These require no platform changes—just workflow/task definitions using existing primitives.

### Assertions / Self-Refinement

**Source:** DSPy's `Assert` and `Suggest` constructs.

**Concept:** LLM outputs are unreliable. Assertions define conditions that outputs must satisfy. On failure, the error message and failed output are injected into a retry prompt, enabling self-correction.

**Wonder Implementation:** A task that bundles LLM call → validation → conditional retry.

```
Task: llm_call_with_assertions
  Step 1: llm_call → store response in task state
  Step 2: evaluate_assertions → check conditions against response
          on_failure: retry_task
  Step 3: return validated response
```

The key mechanism: when `retry_task` triggers, task state resets but the workflow context retains the failed attempt. Input mappings can inject the prior failure into the next LLM call:

```
input_mapping:
  prior_attempt: state.last_response
  failure_reason: state.last_error
```

Assertions themselves are just data—a list of conditions with error messages:

```
assertions:
  - condition: len(response.answer) < 500
    message: "Answer exceeds 500 characters"
  - condition: response.confidence > 0.7
    message: "Low confidence—cite sources or acknowledge uncertainty"
```

---

### Prompt Optimization

**Source:** DSPy's teleprompters (MIPROv2, BootstrapFewShot).

**Concept:** Automatically improve prompts by generating variations, evaluating against a metric, and persisting winners.

**Wonder Implementation:** A research workflow—exactly what Wonder is designed for.

```
Workflow: optimize_prompt
  1. Load current PromptSpec for target node
  2. Generate N variations (llm_call)
  3. Fan-out: evaluate each variation
     - Run target workflow with prompt override
     - Score output against metric
  4. Fan-in: collect scores, select best
  5. If improved > threshold: update PromptSpec
```

The target workflow runs normally; the optimizer just overrides the prompt for one node and measures the result.

---

### Saga / Compensation

**Source:** Temporal's saga pattern.

**Concept:** Multi-step processes that must complete fully or roll back. Each step records how to undo itself; on failure, compensations execute in reverse order.

**Wonder Implementation:** Git provides natural compensation.

```
Each step:
  - Makes changes
  - Commits
  - Pushes commit SHA onto state.undo_stack

On failure:
  - Transition to compensate node
  - Run git revert for each SHA in reverse order
  - Commit the reverts
```

Git's atomic commits and built-in revert make saga trivial. No compensation framework needed—just a workflow pattern.

---

### PR-Style Human Gates

**Source:** Temporal human-in-the-loop, GitHub PR workflow.

**Concept:** Humans review diffs, not abstract approvals. Show what changed, let them approve/reject/request changes.

**Wonder Implementation:** The human_input node receives a diff URL constructed from the run's branch:

```
Node: human_review
  input:
    diff_url: /project/repo/compare/main...wonder/run-{run_id}
    prompt: "Review changes for feature X"
    options: [approve, request_changes, reject]

Transitions:
  approve → merge node
  request_changes → revision node → loop back to review
  reject → cleanup node
```

Familiar PR semantics, powered by Wonder's git-native branching.

---

### Evaluation Harness

**Source:** DSPy's metric-driven compilation.

**Concept:** Systematically measure workflow quality across a test set.

**Wonder Implementation:**

```
Workflow: evaluate_workflow
  Input: target workflow, test cases, metrics

  1. Fan-out over test cases
     - Run target workflow with test input
     - Capture output, latency, cost
  2. Fan-in: aggregate results
     - Compute metrics (accuracy, F1, etc.)
  3. Persist evaluation report as artifact
```

Enables A/B comparison of workflow versions, regression testing, and optimization feedback loops.

---

### Example Harvesting

**Source:** DSPy's BootstrapFewShot.

**Concept:** Use successful runs to generate few-shot examples. Self-improving prompts.

**Wonder Implementation:**

```
Workflow: harvest_examples
  1. Query run history (filter: high scores, recent)
  2. Extract input/output pairs for target node
  3. Select diverse examples (LLM or embedding-based)
  4. Append to target PromptSpec as few-shot demonstrations
```

**Prerequisite:** Runs must have queryable scores—either via `emit_metric` or evaluation workflow integration.

---

### Polling Signals

**Source:** Temporal signals, adapted for git-native architecture.

**Concept:** Cross-workflow communication without platform changes.

**Wonder Implementation:** Use artifacts repo as a mailbox.

```
Sender:
  Write signal file to artifacts/signals/{target_run_id}.json
  Commit

Receiver:
  Poll with git pull until signal file appears
  Read and parse
```

Not true push, but handles many cross-workflow coordination cases.

---

## Already Exists

### Cross-Run Memory

**Source:** LangGraph's Store interface.

**Reality:** Artifacts repo provides this with additional benefits:

- Versioned (git history)
- Searchable (Vectorize)
- Schema-validated (frontmatter schemas)

**Usage:** Store memory as JSON files in `artifacts/memory/`. Query semantically with `vector_search` action.

---

### Semantic Search Over History

**Source:** DSPy's retrieval augmentation.

**Reality:** Already available via Vectorize indexing of artifacts. Query past decisions, research documents, or any indexed content.

---

## Minor Platform Work

### Fork from Checkpoint

**Source:** LangGraph's checkpoint forking.

**Value:** Explore alternative trajectories. "What if we had chosen differently at step 3?"

**Implementation:** API endpoint that creates a new run from:

- A snapshot (context + tokens)
- A git branch point (commit SHA)

Both primitives exist. This is just a new entry point that combines them.

---

### On-Conflict Routing

**Source:** Temporal's structured error handling.

**Value:** Merge conflicts become workflow events, not opaque failures. Enables LLM-assisted resolution or human escalation.

**Implementation:**

1. Merge action returns conflict details instead of throwing
2. Transition conditions can match on `merge_result.status = 'conflict'`
3. Route to resolution node (human or LLM) with conflict context

---

### Async Signals

**Source:** Temporal signals.

**Value:** External systems push data into running workflows. Enables webhooks, streaming updates, cancellation requests.

**Implementation:** New DO method that writes to `context.signals` without advancing tokens. Signals are passive data—nodes read them via input mapping, but signals don't trigger transitions directly.

```
External call: POST /runs/{id}/signals { key: "webhook", payload: {...} }

Workflow node reads: context.signals.webhook
```

---

### Queries

**Source:** Temporal queries.

**Value:** Read-only state inspection for monitoring, debugging, dashboards.

**Implementation:** API endpoint that reads current context and token state from the DO. Pure read—no mutation, no events.

---

## Medium Platform Work

### Heartbeats

**Source:** Temporal activity heartbeats.

**Value:** Detect stuck actions before timeout. Progress reporting for long LLM calls. Cost tracking mid-execution.

**Implementation:** Executor sends periodic heartbeat messages during action execution. DO tracks last heartbeat per token. Alarm detects stale heartbeats and emits timeout events.

**When to build:** When long-running LLM calls become a reliability concern.

---

### Continue-As-New

**Source:** Temporal continue-as-new.

**Value:** Prevent unbounded event history. Workflows with 100k+ events become slow to replay.

**Implementation:** Special transition that:

1. Snapshots current state
2. Archives events to cold storage (R2)
3. Spawns new run from snapshot
4. Links runs for history reconstruction

**When to build:** When event counts regularly exceed 50k.

---

## Priority

**Build now (library patterns):**

- Assertions task template
- Evaluation harness workflow
- Document existing patterns (memory, search, saga)

**Build when needed (minor platform):**

- Async signals → first webhook integration
- On-conflict routing → first merge-heavy workflow
- Fork from checkpoint → first exploration use case

**Defer (medium platform):**

- Heartbeats → when LLM reliability becomes an issue
- Continue-as-new → when event counts hit scaling limits
