# Coordinator Rewrite Plan: Introspection-First

## Philosophy

**Introspection isn't for debugging - it's the test interface.**

- Unit tests assert: "this decision function emitted these events"
- SDK tests assert: "calling this coordinator method resulted in these events"
- E2E tests assert: "this workflow run produced this event sequence"

Without introspection, E2E tests are black boxes: "workflow completed ✓". With introspection: "workflow spawned 10 tokens ✓, each wrote to isolated table ✓, merge combined all results ✓, tables cleaned up ✓".

**This is the testing foundation.** Everything else is just features being tested through the introspection lens.

---

## Phase 1: Introspection Infrastructure

**Goal:** Visibility into every operation before building anything else

1. **IntrospectionEvent types** - All event variants (decision._, operation._, dispatch._, sql._)
2. **IntrospectionEmitter** - Collects events in memory, flush to Events Service
3. **Events Service integration** - Write to introspection_events table
4. **SDK introspection methods** - Query events by workflow_run_id, filter, wait
5. **Basic test:** Emit mock events, query them back, verify ordering

**Why first:** Every subsequent feature emits introspection events. Building features WITHOUT visibility is building blind.

**Testing:**

- Unit: IntrospectionEmitter collects and formats events correctly
- SDK: Query events from Events Service, filter by type/category
- E2E: Emit test events, verify they appear in correct order with all fields

---

## Phase 2: Minimal E2E with Full Observability

**Goal:** Single-node workflow with complete introspection trace

6. **Coordinator DO stub** - Initialize, instrument SQL with emitter
7. **Token operations** - create/get/updateStatus emit `operation.tokens.*` events
8. **Context operations** - initialize/set/get emit `operation.context.*` events
9. **Start workflow** - Emit `decision.routing.start`, create token, mark dispatched
10. **E2E Test #1:** Start workflow → **assert introspection shows exact event sequence** → workflow completes

**Why this order:** First E2E test validates the introspection system itself. If events are missing/wrong, we know immediately.

**Testing:**

- Unit: Token/context operations return correct data and events
- SDK: Simulate coordinator operations, verify event sequences
- E2E: Start minimal workflow, assert complete event trace (start → token created → dispatched → completed)

---

## Phase 3: Decision Pattern with Introspection

**Goal:** Pure decision logic that returns events alongside decisions

11. **Decision types** - All decision variants (CREATE_TOKEN, UPDATE_TOKEN_STATUS, etc.)
12. **Routing decision logic** - Returns `{ decisions, events }` - emits decision.routing.\* events
13. **Dispatch layer** - Applies decisions, emits dispatch.\* events
14. **E2E Test #2:** Multi-transition workflow → **assert decision.routing.evaluate_transition for each transition** → verify correct path taken

**Why this order:** Decision layer is now testable via introspection events. Unit tests assert event output, E2E tests query events from DO.

**Testing:**

- Unit: Decision functions with mock workflow/context → assert correct decisions + events
- SDK: Call routing.decide with real workflow def → verify event sequences
- E2E: Workflow with 3 transitions → assert evaluation events for all, correct path chosen

---

## Phase 4: Parallelism with Branch Introspection

**Goal:** Fan-out with full visibility into branch lifecycle

15. **Spawn logic** - Emits decision.routing.transition_matched with spawn_count
16. **Branch table operations** - Emit operation.context.branch_table.create/drop
17. **Output to branches** - Emit operation.context.write with token_id context
18. **E2E Test #3:** Fan-out 10 tokens → **assert 10 branch_table.create events** → **assert 10 branch_table.drop after merge** → verify no leaked tables

**Why this order:** Branch isolation is critical. Introspection proves tables are created and cleaned up correctly.

**Testing:**

- Unit: Spawn logic generates correct number of CREATE_TOKEN decisions + events
- SDK: Simulate fan-out → verify branch table events
- E2E: Fan-out to 10 tokens → assert 10 create events, 10 drop events, no leaked tables via introspection

---

## Phase 5: Synchronization with Introspection

**Goal:** Fan-in with complete visibility into merge logic

19. **Synchronization decision logic** - Emits decision.sync.\* events (start, check_condition, wait/activate)
20. **Merge operations** - Emit operation.context.merge.start/complete with row counts
21. **E2E Test #4:** Fan-in → **assert decision.sync.check_condition shows sibling counts** → **assert merge.complete with expected row count** → verify merged data

**Why this order:** Synchronization races are debugged via introspection. Events show exactly which tokens arrived when, what condition was checked, why merge happened/didn't happen.

**Testing:**

- Unit: Synchronization logic with various wait_for conditions (any/all/m_of_n) → assert correct events
- SDK: Simulate partial completion → verify wait events, then completion → verify activate events
- E2E: Fan-out → fan-in → assert sync.check_condition events show proper sibling tracking

---

## Phase 6: Dynamic Parallelism

**Goal:** foreach over collections with introspection

22. **Dynamic spawn logic** - Evaluate foreach, emit events with actual count
23. **E2E Test #5:** foreach over array → **assert spawn_count in events matches array length**

**Testing:**

- Unit: foreach evaluation with [0, 1, 100] item arrays → assert correct spawn counts in events
- SDK: Simulate foreach with context data → verify dynamic spawn events
- E2E: foreach over 7 items → assert 7 tokens created, introspection confirms count

---

## Phase 7: Sub-workflows

**Goal:** Nested workflows with parent/child event hierarchy

24. **Sub-workflow spawn** - Create child run, emit events with parent_run_id
25. **Context mapping** - input_mapping/output_mapping with operation.context events
26. **Completion propagation** - Child completion triggers parent token completion
27. **E2E Test #6:** 3-level nested workflows → **assert parent_run_id hierarchy in events**

**Testing:**

- Unit: Sub-workflow spawn decision → assert correct parent_run_id in events
- SDK: Simulate nested calls → verify event hierarchy
- E2E: Parent → child → grandchild → assert all events show correct parent_run_id chain

---

## Phase 8: Error Handling & Retries

**Goal:** Failures visible via introspection

28. **Retry policy** - Emit retry attempt events
29. **Error propagation** - Emit cancellation events
30. **E2E Test #7:** Inject failure → **assert retry events** → eventual success/cancellation

**Testing:**

- Unit: Retry logic → assert retry attempt events with backoff timing
- SDK: Simulate failures → verify retry/cancel events
- E2E: Node fails 2x then succeeds → assert 3 attempt events with proper timing

---

## Phase 9: Remaining Actions

**Goal:** Real work execution with introspection

31. **Executor integration** - RPC calls emit dispatch events
32. **Action types** - llm_call, mcp_tool, etc. all emit events
33. **E2E Tests #8-14:** One per action type → assert execution events

**Testing:**

- Unit: Action dispatch → assert correct RPC payload + events
- SDK: Mock executor responses → verify completion events
- E2E: Each action type → assert dispatch, execution, completion events

---

## Phase 10: Complex Patterns

**Goal:** Real-world workflows with complete introspection

34. **E2E Test #15:** ReAct loop → assert decision events show loop iterations
35. **E2E Test #16:** Tree-of-Thought → assert branch creation/evaluation via events
36. **E2E Test #17:** Consensus (5 judges) → assert fan-out/merge events, vote aggregation
37. **E2E Test #18:** Deep nesting → assert event hierarchy 5+ levels deep

**Testing:**

- E2E only: These are integration tests proving the complete system
- Heavily rely on introspection to verify internal behavior
- Events prove: correct routing, proper synchronization, clean resource management

---

## Testing Strategy Per Phase

**Every phase follows this pattern:**

1. **Unit tests first** - Pure functions return events alongside results
2. **SDK introspection tests** - Query events from real coordinator operations
3. **E2E test last** - Full stack with introspection assertions

**Gate criteria:** All three test layers must pass before moving to next phase.

**Key principle:** Introspection events are first-class test outputs. Tests assert on event sequences, not just final results.

---

## Success Metrics

By following this plan:

- **Every feature is testable** - Events provide visibility into internal behavior
- **Bugs caught early** - Missing/wrong events immediately visible in unit tests
- **E2E tests are precise** - Not just "workflow completed ✓" but "10 tokens spawned ✓, merged correctly ✓, tables cleaned ✓"
- **Production debugging trivial** - Introspection events from prod runs replay exact coordinator behavior
- **Confidence high** - 3 layers of testing + introspection = solid foundation

The coordinator rewrite becomes a series of small, fully-tested increments, each building on the introspection foundation.
