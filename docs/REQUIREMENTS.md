# Requirements

<!-- Style: KEEP THIS DOC LEAN. Exhibit extreme token economy. No sub-bullets. -->

## Purpose

- Wonder is personal infrastructure for AI-assisted research and software development
- No-code workflow authoring; CEL expressions only as escape hatch for edge cases

## Platform

- Built on Cloudflare: Workers, Durable Objects, D1, Vectorize, R2, Analytics Engine, Containers
- Service communication via RPC (service bindings)
- UI built with SvelteKit
- Testing via Vitest with miniflare (local Cloudflare runtime)

## Providers & MCP

- LLM provider adapters abstract over OpenAI, Anthropic, etc.
- MCP servers configured at workspace level, activated per workflow

## Execution Model

- Five layers: WorkflowDef → Node → TaskDef → Step → ActionDef
- Every node executes exactly one task; every step executes exactly one action
- Workflows: graphs, parallelism, durable state (DO SQLite), coordinated by Durable Object
- Tasks: linear sequences, in-memory state, single worker execution, atomic retries
- Actions: atomic operations (llm, mcp, http, tool, shell, workflow, context, vector, metric, human)

## Workflows

- Workflows are directed graphs of nodes connected by transitions
- Transitions control all routing logic: conditions, parallelism, synchronization
- Priority tiers on transitions: same priority = parallel dispatch, different priority = sequential fallback
- Tokens track execution position; fan-out creates tokens, fan-in merges them
- Workflows composable: workflow action invokes sub-workflows with context isolation
- Triggers: UI, API, or schedule (schedule less common)
- Workflows auto-version on change between runs (max 1 increment per run)

## Tasks

- Linear sequence of steps executed by single worker
- State is in-memory, not persisted
- No parallelism, no sub-tasks, no human gates
- Simple branching: if/else conditions, on_failure (abort | retry | continue)
- Retry scope: entire task restarts from step 0
- Tasks bundle operations with verification (write + read-back + assert)
- Reduces coordinator overhead: one round-trip per task vs per action

## Parallelism

- Transitions specify spawn_count (static) or foreach (dynamic over collection)
- Fan-out spawns sibling tokens with shared fan_out_transition_id
- Tokens track lineage: parent_token_id, path_id, branch_index, branch_total
- Synchronization on transitions: wait_for (any|all|m_of_n) + joins_transition ref
- Merge strategies: append, merge, keyed, last_wins
- Branch isolation: each token writes to separate SQL tables (branch*output*{token_id})
- Deep nesting supported (5-6+ layers of fan-out/sub-workflows)

## Execution & State

- Each workflow run coordinated by single Coordinator DO (Actor Model)
- Context stored as schema-driven SQL tables in DO SQLite (input, state, output, artifacts)
- Branch isolation: fan-out tokens write to separate branch*output*{token_id} tables
- Merge at fan-in: read sibling branch tables, apply merge strategy, write to main context
- Decision logic is pure (returns Decision[] data); dispatch converts to operations (SQL/RPC)
- Sub-workflows execute with isolated context; explicit input/output mapping only
- State updates atomic and transactional
- Full event log for replay and time-travel debugging via dedicated event service (DO + RPC)
- Events persisted to D1 for querying; metrics to Analytics Engine
- Events retained 30 days, then archived to R2

## Containers

- One ContainerDO per resource declaration per run
- Linear ownership: single owner, explicit transfer via pass_resources, no parallel access
- Ownership tracked via owner_run_id; claim/release/transfer operations
- Shell access: Workers call containerStub.exec(run_id, command, timeout)
- ContainerDO validates ownership, forwards to container's shell server
- Git-based hibernation: record SHA, destroy container, resume from SHA
- Workflows must commit before human gates (enforced by design)

## Source Hosting

- Cloudflare-native git: no GitHub dependency
- Git objects (blobs, trees, commits) stored in R2, keyed by SHA
- Refs (branches, tags) stored in D1
- isomorphic-git with custom R2/D1 backend
- Sub-second container provisioning (no network clone)
- pnpm store shared in R2; installs are symlinks, not downloads
- Lockfile hash keys node_modules cache in R2

## Project Resources

- Projects contain: code repos (one or more), artifacts repo (exactly one, auto-created), workflows
- Code repos and artifacts repo share same git infrastructure
- Branch-based isolation: each workflow run gets wonder/run-{run_id} branch
- Multiple workflows can read any branch, write to own branch concurrently
- Merge requires exclusive lock on target ref; conflict strategies: rebase, fail, force
- Artifacts organized by directory convention (decisions/, research/, reports/, assets/)

## Agent Environment

- Platform provides container primitives; libraries provide project-type intelligence
- Libraries bundle: routines, workflows, prompts, conventions
- Examples: typescript-pnpm-monorepo, python-uv
- Libraries encode: edit strategies, test runners, verification loops
- Projects declare which library to use; can override or extend

## Data

- Task nodes define input/output mapping to workflow context
- LLM nodes define output schema; enables structured output + autocomplete
- State schema auto-inferred from graph; user can override/lock fields
- Artifacts are files in artifacts repo with conventions and schemas
- Artifact schemas validated on commit
- Artifacts indexed: D1 for metadata queries, Vectorize for semantic search
- All entity IDs use ULID format (sortable, timestamp-prefixed, 26 chars)
- @wonder/context handles all validation, DDL/DML generation (no duplication)

## Templates

- PromptSpec stores Handlebars templates for LLM prompts
- @wonder/templates provides Handlebars syntax via AST interpretation (no eval, CF Workers compatible)
- Templates render workflow context (input/state) into natural language prompts
- Compiled templates cached by (prompt_spec_id, version)
- Executor handles: load PromptSpec → compile → render with input_mapping → send to LLM

## Error Handling

- Infrastructure errors (retries, timeouts) invisible; auto-handled per retry config
- Business errors route via transitions; workflows handle meaningful failures
- Retry config: max_attempts, backoff_ms, timeout_ms per task
- Step-level on_failure: abort (task fails), retry (task restarts), continue (ignore)

## Human Interaction

- Human input nodes pause execution for review/approval/input
- Timeout warnings and intervention tooling for stuck workflows
- Workflows with containers and human gates must ensure git-clean before gate

## Observability

- Full run tree observable via path_id + parent_run_id
- Token state machine: pending → dispatched → executing → completed/failed/timed_out/cancelled
- Decision logic outputs logged as data (inspect what coordinator decided before execution)
- Live UI: tree view, node inspector, metrics (tokens, LLM calls, spend)
- Event log enables replay and time-travel debugging
- Commits correlate with workflow events (unified observability)

## Agent Interaction

- Agents interact with Wonder via MCP server
- MCP tools: query (search/get/list), mutate (create/update/trigger), introspect (validate)
- Complex MCP operations implemented as workflows in hidden platform_operations project
- Platform workflows use same infra as user workflows (dogfooding)
- Vectorize indexes workflow/action descriptions + prompt templates for semantic search

## Organization

- Hierarchy: Account → Workspace → Project → Workflow → Sub-workflow
- Auth: magic link or Google SSO (email-based); single-user ownership, no authorization
- Libraries hold reusable workflow, task, and action definitions
- Workflows reference library definitions by ID, optionally pinned to version

## UI

- Visual workflow editor: drag nodes, connect transitions, configure via panels
- State schema panel shows inferred shape with source attribution
- Prompt template editor with Handlebars + autocomplete from schema
- Run view: live tree, node inspector, metrics bar
- Code view: file tree, syntax highlighting, diff viewer, branch switcher
- Artifacts view: document browser, rich rendering, semantic search

## Secrets

- User secrets (provider keys, MCP tokens) in D1 encrypted; managed via UI
- Secrets injected as environment variables at container runtime

## Scaling Validation

- DO coordination: single DO handling 1k+ concurrent tokens
- Branch table management: CREATE/DROP hundreds of branch*output*{token_id} tables per run
- Event throughput: 50k+ events per run with compaction/batching
- Error propagation: failures bubbling through 5-6 nested layers
- Synchronization: race-safe fan-in via SQL unique constraints (tryCreateFanIn, tryActivate)
- Stuck workflow detection: human input timeouts surfaced and recoverable
- ContainerDO: ownership enforcement, transfer, hibernation/resume cycles
