# Workflow Engine References

This document catalogs workflow orchestration systems and formal models that inform Wonder's branching architecture.

## Architectural Context: Why These References Matter (and Don't)

**Wonder's architecture is fundamentally different from distributed workflow engines:**

- **Single Durable Object per workflow run** - single-writer, immediate consistency
- **SQLite in DO for token state** - atomic operations via constraints
- **Async RPC to stateless executor workers** - no distributed coordination needed

**Most workflow engines:**

- Distributed state (Zeebe: partitioned Raft, Temporal: distributed history service)
- Centralized schedulers polling databases (Airflow: PostgreSQL, Prefect: API)
- Complex distributed consensus for atomicity

**What's relevant from these systems:**

✅ **Gateway semantics** - The _logic_ of synchronization (BPMN, Petri nets, Workflow Patterns)
✅ **State machine design** - Token lifecycle, valid state transitions
✅ **Error handling patterns** - What happens when M of N branches fail (application logic)
✅ **Data flow patterns** - Merge strategies, result collection, addressing

❌ **Atomic coordination patterns** - They solve distributed consensus; you get atomicity for free
❌ **Implementation details** - Distributed locking, CAS across machines, Raft/Paxos

**Better architectural references for Wonder:**

- Actor model systems (Akka actors, Orleans grains) - single-writer entities
- Durable Objects patterns (Cloudflare examples) - DO as coordinator
- SQLite as state machine (litefs, fly.io patterns)

**Use these references for _semantics_ (what should happen), not _implementation_ (how to make it atomic).**

---

## Production Workflow Engines

### Zeebe (Camunda Cloud)

**Repository:** https://github.com/camunda/zeebe

**Relevance:** Token-based execution model with parallel gateway synchronization

**Key Concepts:**

- BPMN 2.0 compliant workflow engine
- Uses tokens internally to track execution through process instances
- Parallel gateways implement explicit fan-out/fan-in with synchronization
- Production-proven for high-throughput workflows (100k+ process instances)

**Useful Patterns:**

- Parallel gateway semantics (AND, OR, M-of-N joins)
- Token lifecycle and state transitions
- Compensation and error boundary events
- Timeout handling at gateway level

**Documentation:**

- Architecture: https://docs.camunda.io/docs/components/zeebe/technical-concepts/architecture/
- Gateway behavior: https://docs.camunda.io/docs/components/modeler/bpmn/gateways/

---

### Temporal

**Repository:** https://github.com/temporalio/temporal

**Relevance:** Event sourcing-based orchestration with deterministic replay

**Key Concepts:**

- Workflows rebuild state from event log (similar to Wonder's event sourcing)
- Child workflows execute in isolation with explicit input/output mapping
- Durable execution via deterministic replay
- TypeScript SDK available with strong typing

**Useful Patterns:**

- Child workflow isolation and context boundaries
- Parallel execution via `Promise.all()` and result aggregation
- Retry policies and timeout strategies
- Event history for time-travel debugging

**Documentation:**

- Concepts: https://docs.temporal.io/concepts
- TypeScript SDK: https://docs.temporal.io/typescript

---

### AWS Step Functions

**Repository:** Proprietary (AWS service)

**Relevance:** JSONPath-based data flow and state machine patterns

**Key Concepts:**

- State machines with explicit state types (Task, Parallel, Map, Choice)
- Map state for dynamic fan-out over collections
- JSONPath expressions for input/output transformation (similar to Wonder)
- Explicit error handling and retry configuration

**Useful Patterns:**

- Result aggregation from parallel branches
- Error handling patterns (Catch, Retry)
- Timeout configuration per state
- Condition evaluation on state transitions

**Documentation:**

- Amazon States Language: https://states-language.net/spec.html
- Map state: https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-map-state.html

---

### Apache Airflow

**Repository:** https://github.com/apache/airflow

**Relevance:** DAG-based task orchestration with data passing

**Key Concepts:**

- Directed Acyclic Graph (DAG) of tasks with dependencies
- XCom (cross-communication) for passing data between tasks
- Dynamic task mapping for fan-out patterns
- TaskGroup for logical grouping of parallel tasks

**Useful Patterns:**

- Merge strategies for collecting results from parallel tasks
- State management and task lifecycle
- Avoiding race conditions in concurrent execution
- Dynamic parallelism based on runtime data

**Documentation:**

- Concepts: https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/index.html
- Dynamic Task Mapping: https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html

---

### Prefect

**Repository:** https://github.com/PrefectHQ/prefect

**Relevance:** Task-based orchestration with futures pattern

**Key Concepts:**

- Tasks with explicit data flow using futures
- `.map()` for fan-out, `.reduce()` for aggregation
- Result collection from parallel execution
- Dynamic parallelism based on input collections

**Useful Patterns:**

- Futures pattern for handling parallel task results
- Dynamic parallelism (spawn count determined at runtime)
- Result persistence and caching
- Subflow composition

**Documentation:**

- Concepts: https://docs.prefect.io/latest/concepts/
- Tasks: https://docs.prefect.io/latest/concepts/tasks/

---

## Formal Models

### Petri Nets

**Closest conceptual match to Wonder's token-based routing**

**Key Concepts:**

- Tokens flow through places (states) via transitions (routing)
- Synchronization via join nodes (multiple tokens required to proceed)
- Hierarchical Petri nets support nested execution
- Formal analysis tools for deadlock detection and correctness proofs

**Useful Patterns:**

- Token lineage tracking through hierarchical nets
- Join semantics (AND, OR, M-of-N)
- Conflict resolution when multiple transitions are enabled
- State space analysis for validation

**Reference Implementations:**

- PIPE (Platform Independent Petri net Editor): http://pipe2.sourceforge.net/
- CPN Tools (Colored Petri Nets): https://cpntools.org/
- TAPAAL (Timed-Arc Petri Nets): https://www.tapaal.net/

**Academic References:**

- van der Aalst, W.M.P. (2016). "Process Mining: Data Science in Action"
- Murata, T. (1989). "Petri Nets: Properties, Analysis and Applications" (foundational paper)

---

### BPMN 2.0 (Business Process Model and Notation)

**Industry standard for workflow modeling**

**Key Concepts:**

- Gateway types: Exclusive, Parallel, Inclusive, Event-based, Complex
- Explicit fork/join patterns with synchronization semantics
- Event-driven routing (message, timer, signal, error)
- Compensation and transaction boundaries

**Useful Patterns:**

- Parallel Gateway (AND-split, AND-join)
- Inclusive Gateway (OR-split, OR-join with partial synchronization)
- Complex Gateway (custom join conditions like M-of-N)
- Event-based Gateway (first event wins, cancel others)

**Specification:**

- BPMN 2.0 Specification: https://www.omg.org/spec/BPMN/2.0/

**Reference:**

- "BPMN Method and Style" by Bruce Silver (practical guide)

---

### Workflow Patterns (van der Aalst)

**Catalog of 43 control flow patterns for workflow systems**

**Relevance:** Formal taxonomy of branching, synchronization, and routing patterns

**Key Patterns Relevant to Wonder:**

1. **Parallel Split (AND-split)** - Fan-out with spawn_count

## Critical Semantic Patterns to Validate

Validate the _logic_ of Wonder's implementation against formal models. Ignore implementation details from distributed systems.

### 1. Atomic Fan-in Token Creation

**Wonder's approach:** Unique constraint on `(workflow_run_id, path_id)` with INSERT OR IGNORE pattern

**Why Wonder's approach is simpler:**

- Single-writer DO = atomicity without distributed consensus
- SQLite UNIQUE constraint = race-free token creation
- No need for Zeebe's Raft consensus or Temporal's deterministic replay

**Validate semantics only:** Ensure one merge token per sibling group, regardless of arrival order

- Russell, N., ter Hofstede, A.H.M., van der Aalst, W.M.P., Mulyar, N. (2006). "Workflow Control-Flow Patterns: A Revised View"
- Workflow Patterns Initiative: http://www.workflowpatterns.com/

---

## Mapping Wonder Patterns to References

| Wonder Pattern                         | Petri Net              | BPMN 2.0                     | Workflow Pattern        | Implementation Reference      |
| -------------------------------------- | ---------------------- | ---------------------------- | ----------------------- | ----------------------------- |
| `spawn_count: N`                       | Place with N tokens    | Parallel Gateway (AND-split) | #2: Parallel Split      | Zeebe parallel gateway        |
| `synchronization.wait_for: 'all'`      | AND-join               | Parallel Gateway (AND-join)  | #3: Synchronization     | Zeebe, Temporal Promise.all   |
| `synchronization.wait_for: 'any'`      | OR-join (first token)  | Event-based Gateway          | #28: Discriminator      | Step Functions race pattern   |
| `synchronization.wait_for: { m_of_n }` | Threshold join         | Complex Gateway              | #29: N-out-of-M Join    | Camunda inclusive gateway     |
| `foreach: { collection }`              | Dynamic places         | Multi-instance               | #34: Multiple Instances | Airflow dynamic task mapping  |
| `priority` tiers                       | Conflict resolution    | Exclusive Gateway            | #4: Exclusive Choice    | Zeebe XOR gateway             |
| Same priority = parallel               | Concurrent transitions | Inclusive Gateway            | #6: Multi-Choice        | BPMN OR-split                 |
| `path_id` hierarchy                    | Hierarchical nets      | Subprocess                   | -                       | Temporal child workflows      |
| Fan-in merge strategies                | Token attributes       | Data objects                 | -                       | Airflow XCom, Prefect results |

---

## Critical Implementation Patterns to Validate

Based on production systems, verify these aspects of Wonder's implementation:

### 1. Atomic Fan-in Token Creation

**Wonder's approach:** Unique constraint on `(workflow_run_id, path_id)` with INSERT OR IGNORE pattern

**Validate against:**

- Zeebe: Uses distributed state machine with single writer per process instance
- Temporal: Deterministic replay ensures only one merge handler

### 2. Synchronization Condition Checking

**Wonder's approach:** Check condition before AND after token creation (handles races)

**Validate semantics:**

- BPMN: Parallel Gateway activates when all incoming tokens arrive
- Petri Net: Transition fires when all input places have tokens
- Wonder's dual-check pattern correctly implements this with atomic operationsing tokens arrive)
- Temporal: Explicit `Promise.all()` blocks until all children complete
- Airflow: TriggerRule evaluated when task becomes eligible

### 3. Path ID Construction

**Wonder's approach:** `root.nodeRef.branchIndex` with `.fanin` suffix for merge points

**Validate semantics:**

- Hierarchical Petri nets: Token paths include nested place identifiers
- BPMN: Execution context maintains parent-child relationships
- Wonder's hierarchical path_id correctly tracks lineage for nested fan-out

### 4. Partial Failure Semantics

**Open question in Wonder:** What happens when M of N branches fail?

**Learn semantics from:**

- Airflow TriggerRule: all_success, all_failed, one_success, none_failed, all_done
- BPMN Error Boundary Events: Catch failures at specific activities or subprocesses
- Workflow Pattern #29 (N-out-of-M): Proceed after M successes, ignore failures

### 5. Timeout + Synchronization Interaction

**Open question in Wonder:** Should fan-in timeout with partial results?

**Learn semantics from:**

- BPMN Timer Boundary Events: Can interrupt waiting at gateways
- Step Functions TimeoutSeconds: Per-state timeout with explicit failure
- Workflow Pattern #19 (Cancel Activity): Timer can cancel waiting branches

**Policy options to consider:**

- `on_timeout: 'fail'` - Fail workflow if synchronization times out
- `on_timeout: 'proceed_with_available'` - Merge partial results and continue

## Recommended Reading Order

**For semantics (what should happen):**

1. **BPMN 2.0 Specification** (Chapter 10: Gateways) - Standard gateway semantics
2. **Workflow Patterns paper** - Formal catalog of control flow patterns
3. **Petri Net papers** - Formal validation techniques for correctness

**For error handling policies:** 4. **Airflow TriggerRule docs** - Practical failure handling options 5. **BPMN Error Events** - Standard error boundary patterns

## Key Takeaways

**What to learn from these systems:**

- Gateway semantics from BPMN (what wait_for: 'all' means formally)
- Failure handling policies from Airflow TriggerRule
- Merge strategies from any system with parallel execution
- Formal correctness from Petri nets and Workflow Patterns

**What NOT to copy:**

- Distributed coordination mechanisms (you have single-writer DO)
- Database polling patterns (you have immediate consistency)
- Complex atomicity mechanisms (you have SQLite constraints)

**Wonder's architectural advantage:**

- Single Durable Object = no distributed consensus needed
- SQLite constraints = race-free atomic operations
- Immediate consistency = simpler reasoning about state
- Your complexity is in _semantics_ (what to do), not _coordination_ (how to stay consistent)

**Design philosophy:**

- Wonder's transition-centric model (conditions on edges) aligns with Petri nets and BPMN
- Node-centric models (Airflow, Prefect) put logic in tasks; Wonder separates action execution from routing
- Event sourcing enables replay/debugging, not distributed consistency (unlike Temporal)
- JSONPath-based data flow similar to Step Functions' state transformation

**Do read for architectural patterns:**

- ✅ Actor model systems (Akka, Orleans) - Single-writer entity patterns
- ✅ Durable Objects examples (Cloudflare) - DO as coordinator
- ✅ SQLite as state machine (litefs patterns)

## Recommended Reading Order

1. **Start with BPMN 2.0 Specification** (Chapter 10: Gateways) - Defines standard gateway semantics
2. **Workflow Patterns paper** - Map Wonder's patterns to formal catalog
3. **Zeebe Architecture docs** - See production token-based implementation
4. **Temporal Concepts** - Understand child workflow isolation patterns
5. **Petri Net papers** - Formal validation techniques

---

## Notes

- Wonder's transition-centric model (conditions on edges) aligns with Petri nets and BPMN
- Node-centric models (Airflow, Prefect) put logic in tasks; Wonder separates action execution from routing
- Event sourcing approach matches Temporal's deterministic replay philosophy
- JSONPath-based data flow similar to Step Functions' state transformation
