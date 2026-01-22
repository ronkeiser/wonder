# Wflow Status and Roadmap

This document tracks the current state of wflow tooling and the standard library, along with immediate priorities.

## Current State

### Standard Library (`packages/standard`)

The standard library is minimal — 9 files in `libraries/core/`:

| File                                 | Status     | Notes                                       |
| ------------------------------------ | ---------- | ------------------------------------------- |
| `assistant.persona`                  | Functional | Placeholder system prompt, empty tools list |
| `claude-sonnet.model`                | Complete   | Claude 3.5 Sonnet configuration             |
| `context-assembly-passthrough.wflow` | Functional | Single-node workflow                        |
| `context-assembly-passthrough.task`  | Functional | Assembles messages from recent turns        |
| `memory-extraction-noop.wflow`       | Stub       | No-op, returns empty object                 |
| `memory-extraction-noop.task`        | Stub       | Does nothing                                |
| `build-llm-request.action`           | Stub       | Empty context action                        |
| `noop.action`                        | Stub       | Empty context action                        |

**Passthrough pattern**: The standard library uses a "passthrough" architecture where actions have empty implementations and the real work happens in output mappings via JavaScript expressions. This is intentional — it keeps the definitions simple while the platform handles execution.

**What's missing**:

- Tools (empty list in persona)
- Real memory extraction (currently no-op)
- Alternative models
- Complete system prompt

### Wflow CLI (`packages/wflow/cli`)

| Command        | Status      | Notes                                   |
| -------------- | ----------- | --------------------------------------- |
| `wflow check`  | Implemented | Local validation, cross-file references |
| `wflow test`   | Implemented | Runs .test files against API            |
| `wflow deploy` | Implemented | Topological ordering, hash comparison   |
| `wflow diff`   | Implemented | Compares local vs server                |
| `wflow pull`   | Partial     | Basic structure exists                  |

### Wflow Core (`packages/wflow/core`)

| Component           | Status   | Notes                                 |
| ------------------- | -------- | ------------------------------------- |
| Parser              | Complete | All file types, snake_case conversion |
| Graph analyzer      | Complete | Cycle detection, topological sort     |
| Data flow analyzer  | Complete | Tracks available paths at each node   |
| Schema validator    | Complete | Property validation                   |
| Workspace loader    | Complete | Reference resolution, hashing         |
| Workspace validator | Complete | Cross-file validation                 |

### Wflow LSP (`packages/wflow/lsp`)

| Feature          | Status      |
| ---------------- | ----------- |
| Diagnostics      | Implemented |
| Completions      | Implemented |
| Hover            | Implemented |
| Go to definition | Implemented |
| Semantic tokens  | Implemented |

## Known Gaps

### Documentation vs Implementation

1. **`.agent` files**: Documented but parser may not handle them yet
2. **Reference scoping**: Implementation uses `library/name`, `$library/name`, `@project/name` — need to verify all scopes work correctly
3. **Standard library deployment**: Need to verify the global deployment mechanism works

### Testing Coverage

- No comprehensive test suite for wflow CLI commands
- Parser tests exist but may not cover all edge cases
- End-to-end deployment flow not fully tested

### Standard Library Completeness

- Context assembly works but is basic (passthrough)
- Memory extraction is a no-op
- No tools defined
- Only one model profile

## Immediate Priorities

### Phase A: Validate Wflow

The wflow CLI should parse, validate, and deploy definitions as documented. The standard library in `packages/standard` serves as the test case — it contains real definitions that need to work end-to-end.

### Phase B: Agent Onboarding

Create an onboarding process that brings agents to the point where they understand Wonder's execution model and can author wflow definitions. The key concepts: workflows orchestrate (graphs, parallelism, durable state), tasks execute reliably (linear sequences, atomic retries), personas are stateless templates, agents are stateful instances that accumulate memory.

### Phase C: Experiment with Agent Workflows

Context assembly determines what an agent sees when it starts reasoning. Memory extraction determines what an agent remembers across conversations. The current implementations are minimal placeholders. This phase is about exploring what actually helps agents perform better.
