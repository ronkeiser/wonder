# Architecture Documentation Index

## Core Concepts

- **[execution-model.md](execution-model.md)** - Five-layer execution model (WorkflowDef→Node→Task→Step→ActionDef) with durable workflows and in-memory tasks for performance optimization.
- **[packages-services.md](packages-services.md)** - Service architecture defining RPC-based communication between Cloudflare Workers services and shared library packages.
- **[primitives.md](primitives.md)** - Core data types organized by storage layer (D1, DO SQLite, R2, Vectorize) and managing service.

## Execution Infrastructure

- **[coordinator.md](coordinator.md)** - Durable Object-based workflow orchestration using Actor Model with decision pattern for testable, pure decision logic.
- **[executor.md](executor.md)** - Stateless task execution service that runs sequential steps with in-memory state and handles retries.
- **[context.md](context.md)** - Schema-driven SQL storage for workflow runtime state (input, state, output, artifacts) using JSONSchema validation.

## Branching & Parallelism

- **[branching.md](branching.md)** - Transition-centric control flow using priority tiers, token lineage, and path matching for fan-out/fan-in synchronization.
- **[branch-storage.md](branch-storage.md)** - Token-scoped SQL tables for isolated parallel execution with merge strategies at fan-in points.

## Resources & State

- **[containers.md](containers.md)** - Linear ownership model for container lifecycle management with git-based hibernation and shell execution validation.
- **[project-resources.md](project-resources.md)** - Project structure with code repos, artifacts repo, workflows, and branch-based isolation for concurrent workflow runs.
- **[source-hosting.md](source-hosting.md)** - Cloudflare-native git implementation using R2 for objects and D1 for refs, eliminating GitHub dependency.

## Libraries & Patterns

- **[agent-environment.md](agent-environment.md)** - Platform provides container primitives while libraries encode project-type intelligence (TypeScript, Python, etc.) as composable workflows.
- **[templates.md](templates.md)** - Handlebars-compatible AST interpreter for rendering workflow context into LLM prompts without eval().
- **[borrowed-ideas.md](borrowed-ideas.md)** - Implementation guide for concepts from Temporal, DSPy, and LangGraph mapped to Wonder patterns.

## Observability

- **[logs-events-decisions.md](logs-events-decisions.md)** - Three-layer architecture distinguishing pure decision logic, actor execution, and event outcomes for testability.
- **[trace-events.md](trace-events.md)** - Line-by-line coordinator execution visibility through structured trace events stored separately from workflow events.
- **[debugging.md](debugging.md)** - Quick reference for querying workflow events, trace events, and logs via HTTP endpoints with curl examples for common debugging patterns.

## Development

- **[cloudflare.md](cloudflare.md)** - Modern Cloudflare practices for 2025: wrangler types, Workers RPC, and correct platform usage patterns.
- **[testing.md](testing.md)** - Three-layer testing strategy using decision pattern for unit tests, SDK introspection tests, and end-to-end tests.

## User Experience

- **[archive/ux/workflow-editor.md](archive/ux/workflow-editor.md)** - Visual workflow editor design with task-centric nodes, transition-based parallelism control, and state schema inference.
