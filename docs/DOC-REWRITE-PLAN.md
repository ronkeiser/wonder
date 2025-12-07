# Documentation Rewrite Plan

## Problem

Current docs evolved organically:
- 19 files in `architecture/` with unclear relationships
- Scattered coordinator docs (coordinator.md, coordinator-implementation.md, execution.md)
- Top-level noise (COORDINATOR.md, THRASHING.md, CRITICAL.md)
- primitives.ts orphaned in markdown docs
- Core concepts (Actor Model, Decision Pattern) not documented as foundations
- No clear reading order or progressive disclosure

## Proposed Structure

```
docs/
├── README.md                          # Overview + navigation
│
├── foundations/                       # Read first - core concepts
│   ├── actor-model.md                # DOs = Actors, isolation, messages
│   ├── decision-pattern.md           # Pure decisions → actor messages
│   ├── primitives.md                 # Type system (primitives.ts → markdown)
│   └── data-model.md                 # (move from architecture/)
│
├── coordinator/                       # Coordinator service
│   ├── overview.md                   # High-level (from coordinator.md)
│   ├── decisions.md                  # Decision modules (routing, sync, completion)
│   ├── operations.md                 # SQL/RPC operations layer
│   ├── execution.md                  # Decision → actor message conversion
│   └── implementation-guide.md       # Deep dive (from coordinator-implementation.md)
│
├── workflows/                         # User-facing workflow concepts
│   ├── transitions.md                # Transition-centric control flow (from branching.md)
│   ├── tokens.md                     # Token lifecycle, path_id, states
│   ├── synchronization.md            # Fan-in patterns, merge strategies
│   └── nodes-and-actions.md          # (move from architecture/)
│
├── platform/                          # Cross-cutting infrastructure
│   ├── cloudflare.md                 # (move from architecture/)
│   ├── observability.md              # (logs-events-decisions.md)
│   ├── error-handling.md             # (move from architecture/)
│   └── testing.md                    # (move from architecture/)
│
├── services/                          # Other services
│   ├── executor.md                   # Task execution service
│   ├── resources.md                  # D1 schema, persistence
│   ├── events.md                     # Event service
│   └── logs.md                       # Logging service
│
└── archive/                           # Deprecated/historical
    ├── old-notes/                    # COORDINATOR.md, CRITICAL.md, THRASHING.md
    └── research/                     # (move research/ folder)
```

## Organization Principles

1. **Foundation first** - Actor Model + Decision Pattern are prerequisites for understanding system
2. **Service-oriented** - Each service gets dedicated folder (coordinator, executor, etc)
3. **Separate concerns** - User-facing workflow concepts (transitions, tokens) vs implementation (coordinator internals)
4. **Progressive disclosure** - foundations → coordinator → workflows → platform
5. **No orphans** - Every file has clear home, clear purpose

## Migration Strategy

1. Create new structure (empty folders)
2. Write foundation docs (actor-model.md, decision-pattern.md) - NEW
3. Refactor coordinator docs into coordinator/ folder
4. Extract workflow concepts into workflows/ folder
5. Consolidate platform docs
6. Convert primitives.ts → primitives.md
7. Move deprecated docs to archive/
8. Write docs/README.md with navigation

## Key Content Changes

- **actor-model.md** (NEW) - Explain DO = Actor, why it matters for Wonder
- **decision-pattern.md** (NEW) - Pure decisions vs actor messages, testability
- **transitions.md** - Merge branching.md concepts, clarify transition-centric model
- **tokens.md** - Extract token lifecycle from branching.md
- **synchronization.md** - Extract fan-in patterns from branching.md
- **decisions.md** - Document decision modules (routing, sync, completion) separately
- **operations.md** - Document SQL/RPC operations layer
- **execution.md** - How decisions become SQL/RPC messages (application/apply.ts logic)

## Reading Paths

**For new developers:**
foundations/ → coordinator/overview.md → workflows/ → platform/

**For coordinator work:**
foundations/ → coordinator/ (all files)

**For workflow authoring:**
foundations/primitives.md → workflows/ (all files)

**For debugging:**
platform/observability.md → coordinator/implementation-guide.md
