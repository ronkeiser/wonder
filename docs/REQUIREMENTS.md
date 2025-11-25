# Requirements

## Purpose

- Wonder is personal infrastructure for AI-assisted research and software development
- No-code workflow authoring; CEL expressions only as escape hatch for edge cases

## Platform

- Built on Cloudflare: Workers, Durable Objects, Queues, D1, Vectorize, R2
- UI built with SvelteKit

## Providers & MCP

- LLM provider adapters abstract over OpenAI, Anthropic, etc.
- MCP servers configured at workspace level, activated per workflow

## Workflows

- Workflows are directed graphs of nodes connected by transitions
- Nodes execute actions: llm_call, mcp_tool, http_request, human_input, update_context, write_artifact, workflow_call, vector_search
- Transitions route execution; conditions built via structured UI (CEL fallback)
- Workflows composable: workflow_call invokes sub-workflows
- Triggers: UI, API, or schedule (schedule less common)
- Workflows auto-version on change between runs (max 1 increment per run)

## Parallelism

- Nodes have fan_out (first_match|all) + fan_in (any|all|m_of_n)
- Fan-out spawns parallel tokens; fan-in waits and merges
- Merge strategies: append, merge, keyed, last_wins
- Deep nesting supported (5-6+ layers of fan-out/sub-workflows)

## Context & State

- Each run has Context: input (immutable), state (mutable), output, artifacts
- Local state is ephemeral working data; artifacts are persisted outputs
- Sub-workflows get fresh isolated context; explicit input/output mapping only
- Sub-workflows are pure functions: no parent state access, no side effects

## Data

- LLM nodes define output schema; enables structured output + autocomplete
- State schema auto-inferred from graph; user can override/lock fields
- Artifacts are typed, versioned, project-scoped, searchable via Vectorize
- Artifacts persist until explicit user delete

## Execution

- One DO per run coordinates token state and fan-in synchronization; may need sub-workflow DOs at scale
- Workers execute tasks (LLM calls, HTTP, etc.) via Queues
- Event sourcing: every state change emits event for replay/debug
- Events in D1 30 days, then moved to R2 by scheduled worker
- Event volume can reach 50k+ per run; requires compaction/batching

## Error Handling

- Infrastructure errors (retries, timeouts) invisible; auto-handled per retry config
- Business errors route via transitions; workflows handle meaningful failures
- Retry config: max_attempts, backoff_ms, timeout_ms per action/node

## Human Interaction

- Human input nodes pause execution for review/approval/input
- Timeout warnings and intervention tooling for stuck workflows

## Observability

- Full run tree observable via path_id + parent_run_id
- Live UI: tree view, node inspector, metrics (tokens, LLM calls, spend)
- Event log enables replay and time-travel debugging

## Agent Interaction

- Agents interact with Wonder via MCP server
- MCP tools: query (search/get/list), mutate (create/update/trigger), introspect (validate)
- Complex MCP operations implemented as workflows in hidden platform_operations project
- Platform workflows use same infra as user workflows (dogfooding)
- Vectorize indexes workflow/action descriptions + prompt templates for semantic search

## Organization

- Hierarchy: Account → Workspace → Project → Workflow → Sub-workflow
- Auth: magic link or Google SSO (email-based); single-user ownership, no authorization
- Libraries hold reusable workflow definitions (routines)
- Workflows reference library definitions by ID, optionally pinned to version

## UI

- Visual workflow editor: drag nodes, connect transitions, configure via panels
- State schema panel shows inferred shape with source attribution
- Prompt template editor with Handlebars + autocomplete from schema
- Run view: live tree, node inspector, metrics bar

## Secrets

- User secrets (provider keys, MCP tokens) in D1 encrypted; managed via UI

## Scaling Validation

- DO coordination: single DO handling 1k+ concurrent tokens
- Event throughput: 50k+ events per run with compaction/batching
- Error propagation: failures bubbling through 5-6 nested layers
- Stuck workflow detection: human input timeouts surfaced and recoverable
