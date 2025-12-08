# Requirements

<!-- Style: KEEP THIS DOC LEAN. Exhibit extreme token economy. No sub-bullets. -->

## Purpose

- Wonder is personal infrastructure for AI-assisted research and software development
- No-code workflow authoring; CEL expressions only as escape hatch for edge cases

## Platform

- Built on Cloudflare: Workers, Durable Objects, D1, Vectorize, R2, Analytics Engine
- Service communication via RPC (service bindings)
- UI built with SvelteKit
- Testing via Vitest with miniflare (local Cloudflare runtime)

## Providers & MCP

- LLM provider adapters abstract over OpenAI, Anthropic, etc.
- MCP servers configured at workspace level, activated per workflow

## Workflows

- Workflows are directed graphs of nodes connected by transitions
- Nodes execute actions: llm_call, mcp_tool, http_request, human_input, update_context, write_artifact, workflow_call, vector_search
- Transitions control all routing logic: conditions, parallelism, synchronization
- Priority tiers on transitions: same priority = parallel dispatch, different priority = sequential fallback
- Tokens track execution position; fan-out creates tokens, fan-in merges them
- Workflows composable: workflow_call invokes sub-workflows
- Triggers: UI, API, or schedule (schedule less common)
- Workflows auto-version on change between runs (max 1 increment per run)

## Parallelism

- Transitions specify spawn_count (static) or foreach (dynamic over collection)
- Fan-out spawns sibling tokens with shared fan_out_transition_id
- Tokens track lineage: parent_token_id, path_id, branch_index, branch_total
- Synchronization on transitions: wait_for (any|all|m_of_n) + joins_transition ref
- Merge strategies: append, merge, keyed, last_wins
- Branch isolation: each token writes to separate SQL tables (branch*output*{token_id})
- Deep nesting supported (5-6+ layers of fan-out/sub-workflows)

## Execution & State

- Each workflow run coordinated by single Durable Object (Actor Model)
- Context stored as schema-driven SQL tables in DO SQLite (input, state, output, artifacts)
- Branch isolation: fan-out tokens write to separate branch*output*{token_id} tables
- Merge at fan-in: read sibling branch tables, apply merge strategy, write to main context
- Decision logic is pure (returns Decision[] data); dispatch converts to operations (SQL/RPC)
- Sub-workflows execute with isolated context; explicit input/output mapping only
- State updates atomic and transactional
- Full event log for replay and time-travel debugging via dedicated event service (DO + RPC)
- Events persisted to D1 for querying; metrics to Analytics Engine
- Events retained 30 days, then archived to R2

## Data

- LLM nodes define output schema; enables structured output + autocomplete
- State schema auto-inferred from graph; user can override/lock fields
- Local state is ephemeral working data; artifacts are persisted outputs
- Artifacts are typed, versioned, project-scoped, searchable via Vectorize
- Artifacts persist until explicit user delete
- All entity IDs use ULID format (sortable, timestamp-prefixed, 26 chars)
- `@wonder/context` handles all validation, DDL/DML generation (no duplication)

## Templates

- PromptSpec stores Handlebars templates for LLM prompts
- `@wonder/templates` provides Handlebars syntax via AST interpretation (no eval, CF Workers compatible)
- Templates render workflow context (input/state) into natural language prompts
- Compiled templates cached by (prompt_spec_id, version)
- Executor handles: load PromptSpec → compile → render with input_mapping → send to LLM

## Error Handling

- Infrastructure errors (retries, timeouts) invisible; auto-handled per retry config
- Business errors route via transitions; workflows handle meaningful failures
- Retry config: max_attempts, backoff_ms, timeout_ms per action/node

## Human Interaction

- Human input nodes pause execution for review/approval/input
- Timeout warnings and intervention tooling for stuck workflows

## Observability

- Full run tree observable via path_id + parent_run_id
- Token state machine: pending → dispatched → executing → completed/failed/timed_out/cancelled
- Decision logic outputs logged as data (inspect what coordinator decided before execution)
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
- Branch table management: CREATE/DROP hundreds of branch*output*{token_id} tables per run
- Event throughput: 50k+ events per run with compaction/batching
- Error propagation: failures bubbling through 5-6 nested layers
- Synchronization: race-safe fan-in via SQL unique constraints (tryCreateFanIn, tryActivate)
- Stuck workflow detection: human input timeouts surfaced and recoverable
