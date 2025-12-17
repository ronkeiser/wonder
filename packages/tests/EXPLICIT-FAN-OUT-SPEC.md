# Explicit Fan-Out Synchronization Specification

## Overview

Test [06-explicit-fan-out.test.ts](src/tests/foundation/06-explicit-fan-out.test.ts) defines the **IDEAL behavior** for explicit fan-out with synchronization in the Wonder workflow coordinator.

**Current Status**: ⚠️ Test is failing - defines required enhancement to coordinator implementation.

## Problem Statement

The coordinator currently supports fan-out/fan-in with synchronization **only** for the `spawn_count` pattern:

```typescript
// THIS WORKS (Test 04)
transition({
  from_node_ref: 'source',
  to_node_ref: 'target',
  spawn_count: 3, // Single transition spawns 3 tokens
  synchronization: {
    strategy: 'all',
    sibling_group: 'fanout_1', // All 3 tokens share this group
    merge: {
      /* ... */
    },
  },
});
```

But does NOT support explicit fan-out with the same synchronization:

```typescript
// THIS SHOULD WORK (Test 06) - Currently fails
(transition({
  from_node_ref: 'source',
  to_node_ref: 'target_a',
  synchronization: {
    strategy: 'all',
    sibling_group: 'phase1_fanin', // Named group
    merge: {
      /* ... */
    },
  },
}),
  transition({
    from_node_ref: 'source',
    to_node_ref: 'target_b',
    synchronization: {
      strategy: 'all',
      sibling_group: 'phase1_fanin', // Same group = siblings!
      merge: {
        /* ... */
      },
    },
  }),
  transition({
    from_node_ref: 'source',
    to_node_ref: 'target_c',
    synchronization: {
      strategy: 'all',
      sibling_group: 'phase1_fanin', // Same group = siblings!
      merge: {
        /* ... */
      },
    },
  }));
```

## Root Cause

The coordinator's synchronization logic currently relies on `token.fan_out_transition_id`:

- **spawn_count pattern**: Single transition creates multiple tokens, all share the same `fan_out_transition_id`
- **Explicit fan-out**: Multiple transitions each create one token, each with different `fan_out_transition_id`

The `sibling_group` identifier is tied to the transition ID, not configurable independently.

## Required Enhancement

The coordinator MUST support **named sibling groups** that work independently of transition IDs:

1. **Sibling Group Declaration**: Multiple transitions can declare membership in a synchronization group via `sibling_group` name
2. **Cross-Transition Coordination**: Tokens spawned by different transitions can be recognized as siblings
3. **Same Semantics**: All synchronization and merge behavior works identically to spawn_count
4. **Pattern Equivalence**: Both fan-out patterns (spawn_count and explicit) have full feature parity

## Implementation Location

Key coordinator code that needs enhancement:

- **Synchronization Logic**: Check `packages/coordinator/src/handlers/synchronization.ts` (or equivalent)
- **Token Tracking**: Look for code that identifies sibling tokens using `fan_out_transition_id`
- **Fan-in Coordination**: Logic that waits for all siblings before spawning continuation

The enhancement should:

- Allow `sibling_group` to be a named identifier independent of transition ID
- Group tokens by their sibling_group name, not just their fan_out_transition_id
- Maintain backward compatibility with existing spawn_count behavior

## Test Structure

Test 06 mirrors Test 04 exactly:

| Aspect            | Test 04 (spawn_count)                                               | Test 06 (explicit)                             |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| Fan-out mechanism | `spawn_count: 3`                                                    | 3 separate transitions                         |
| Target nodes      | Same node (3 tokens)                                                | Different nodes (phase1_a, phase1_b, phase1_c) |
| Synchronization   | `sibling_group: 'fanout_1'`                                         | `sibling_group: 'phase1_fanin'`                |
| Merge strategy    | `append`                                                            | `append`                                       |
| Expected behavior | ✓ Works                                                             | ❌ Should work (currently fails)               |
| Token structure   | 15 tokens (6 branch + 6 fan-in arrivals + 2 continuations + 1 root) | 15 tokens (same structure)                     |
| State writes      | Merged state paths                                                  | Merged state paths                             |

## Expected Behavior

When test 06 passes, the following workflow execution should succeed:

1. **Fan-out #1**: `init` spawns 3 tokens to `phase1_a`, `phase1_b`, `phase1_c`
2. **Synchronization #1**: All 3 phase1 tokens arrive at fan-in
   - Tokens wait at synchronization point
   - Each writes to branch-specific state path: `state.phase1.value_a`, `state.phase1.value_b`, `state.phase1.value_c`
   - Merge strategy (append) writes to shared target: `state.phase1.results` (array of 3 strings)
   - Single continuation token spawns to `bridge` node
3. **Bridge**: Reads from merged `state.phase1.results`
4. **Fan-out #2**: `bridge` spawns 3 tokens to `phase2_a`, `phase2_b`, `phase2_c`
5. **Synchronization #2**: All 3 phase2 tokens arrive at fan-in
   - Merge strategy (collect) writes to: `state.phase2.accumulated` (array of 3 arrays)
   - Single continuation token spawns to `summarize` node
6. **Summarize**: Reads all merged state, workflow completes

## Current Error

```
POST /workflow-defs failed
Internal Server Error
```

This error occurs during workflow definition **creation**, indicating the coordinator doesn't accept the synchronization configuration with named sibling groups on explicit transitions.

## Success Criteria

Test 06 passes when:

- ✓ Workflow definition creates successfully
- ✓ Workflow executes with 15 total tokens (same as test 04)
- ✓ Fan-in arrivals occur (6 total: 3 for phase1, 3 for phase2)
- ✓ Continuations spawn (2 total: bridge, summarize)
- ✓ Merge strategies write to shared state paths
- ✓ Values flow through pipeline correctly
- ✓ All verification assertions pass

## Benefits

Once implemented, workflow authors get:

- **Flexibility**: Choose between spawn_count and explicit fan-out based on needs
- **Expressiveness**: Explicit nodes can have different implementations
- **Clarity**: Named nodes (phase1_a, phase1_b) vs indexed tokens
- **Parity**: Both patterns support same synchronization/merge features

## References

- Test 04 (working): [04-nested-state-structure.test.ts](src/tests/foundation/04-nested-state-structure.test.ts)
- Test 06 (specification): [06-explicit-fan-out.test.ts](src/tests/foundation/06-explicit-fan-out.test.ts)
- Coordinator implementation: `packages/coordinator/src/` (exact location TBD)

---

**Next Steps**:

1. Identify coordinator code handling sibling_group and fan_out_transition_id
2. Enhance to support named sibling groups independent of transition ID
3. Ensure backward compatibility with spawn_count pattern
4. Run test 06 to verify implementation
