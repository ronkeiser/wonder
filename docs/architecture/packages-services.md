# Packages and Services

## Overview

Every component in Wonder is either a **package** or a **service**:

- **Packages**: Shared libraries imported by services or other packages
- **Services**: Cloudflare Workers deployed independently

## Architecture Rules

1. **Services are deployed as Cloudflare Workers** with their own `wrangler.jsonc` configuration
2. **Services communicate via Workers RPC** (not direct imports for runtime calls)
3. **Services may import types and schemas from packages or other services** (compile-time dependencies on data shapes are acceptable)
4. **Packages have no runtime dependencies on services** (pure library code)

## Packages

### @wonder/context

**Purpose:** Schema-driven SQL toolkit for SQLite/D1

**Capabilities:**

- Runtime JSON Schema validation (no compilation, Workers-compatible)
- DDL generation (CREATE TABLE statements from schemas)
- DML generation (INSERT/UPDATE/DELETE with parameterization)
- Custom type system with validation + SQL mapping
- Used by Coordinator DO for context validation and storage

**Dependencies:** None (pure TypeScript)

**Used by:** Coordinator, Resources (for schema-driven storage)

---

### @wonder/sdk

**Purpose:** Type-safe TypeScript SDK for Wonder platform

**Capabilities:**

- Auto-generated resource client from OpenAPI spec
- Builder helpers for workflows, nodes, transitions, schemas
- Type-safe API calls with full TypeScript inference
- Used by external applications and tests

**Dependencies:** openapi-fetch, openapi-typescript

**Used by:** External applications, @wonder/test, CLI tools

---

### @wonder/templates

**Purpose:** Handlebars-compatible template engine for workflows

**Capabilities:**

- Pure AST interpreter (no eval, Workers-compatible)
- Handlebars V1 feature parity (helpers, partials, block expressions)
- Prototype pollution protection
- Used for prompt templates, context expressions, dynamic values

**Dependencies:** None (pure TypeScript)

**Used by:** Executor (prompt rendering), Coordinator (expression evaluation)

---

### @wonder/test

**Purpose:** End-to-end test suite

**Capabilities:**

- Full-stack integration tests (SDK → HTTP → Services → DB)
- Workflow lifecycle testing
- Real service deployment validation

**Dependencies:** @wonder/sdk, vitest

**Used by:** CI/CD pipeline

---

## Services

### cache

**Purpose:** Deterministic-input caching

**Responsibilities:**

- Lockfile-keyed dependency caching (node_modules tarballs)
- Generic hash → tarball storage for any deterministic derivation
- R2 storage for cache artifacts

**Storage:** R2 (tarballs)

**RPC Methods:** `get(hash)`, `put(hash, tarball)`, `exists(hash)`

**Called by:** Containers (during provisioning)

---

### containers

**Purpose:** Container lifecycle management

**Responsibilities:**

- ContainerDO per repo (container identity = repo identity)
- Ownership tracking (claim, release, transfer)
- Shell command execution with ownership validation
- Hibernation (record SHA) and resume (restore from SHA)
- Integration with Cloudflare Containers platform

**Storage:** DO SQLite (ownership state, current SHA)

**RPC Methods:** `claim()`, `release()`, `transfer()`, `exec()`

**Called by:** Coordinator (ownership operations), Executor (shell_exec tasks)

---

### coordinator

**Purpose:** Durable Object-based workflow orchestration

**Responsibilities:**

- Workflow lifecycle (start, pause, resume, complete)
- Token state management (fan-out, fan-in, synchronization)
- Context storage in DO SQLite
- Task dispatch to executor
- Result processing and transition evaluation
- Container ownership operations (claim/release/transfer via containers service)

**Storage:** DO SQLite (per-run state), D1 (run metadata)

**RPC Methods:** `start()`, `resume()`, `handleTaskResult()`, `getState()`

**Called by:** HTTP service (workflow operations), Executor (result delivery)

---

### events

**Purpose:** Workflow event logging and streaming

**Responsibilities:**

- Event persistence to D1
- Event querying with filters (run, workspace, project)
- Real-time event streaming via WebSocket (Streamer DO)
- Event emitter client for services

**Storage:** D1 (events table)

**RPC Methods:** `emit()`, `getEvents()`

**Called by:** All services (emit events), HTTP service (query/stream), Web UI (WebSocket)

---

### executor

**Purpose:** Stateless task execution

**Responsibilities:**

- Consume tasks from queue (batch consumer)
- Execute task steps sequentially (in-memory state)
- Handle step-level conditionals and on_failure logic
- Task-level retry (restart from step 0)
- Call containers service for shell actions
- Action execution (LLM calls, HTTP, MCP tools, etc.)
- Result delivery to coordinator

**Storage:** None (stateless, in-memory task state)

**RPC Methods:** None (queue consumer only)

**Called by:** Coordinator (via queue dispatch)

---

### http

**Purpose:** REST API gateway and WebSocket bridge

**Responsibilities:**

- HTTP-to-RPC translation (REST → service methods)
- OpenAPI documentation generation
- CORS handling
- Request routing to appropriate services
- No business logic (thin adapter)

**Storage:** None (stateless gateway)

**RPC Methods:** None (calls other services via RPC)

**Called by:** External clients (SDK, CLI, Web UI, APIs)

---

### logs

**Purpose:** Service logging and observability

**Responsibilities:**

- Structured log persistence to D1
- Log querying with filters (service, level, trace_id, etc.)
- Real-time log streaming via WebSocket (Streamer DO)
- Logger client for services

**Storage:** D1 (logs table)

**RPC Methods:** `log()`, `getLogs()`

**Called by:** All services (emit logs), HTTP service (query/stream), Web UI (WebSocket)

---

### resources

**Purpose:** Resource CRUD and metadata management

**Responsibilities:**

- Workspace, project management
- Workflow definition CRUD (WorkflowDef, Node, Transition)
- Task definition CRUD (TaskDef, Step)
- Action, prompt spec, model profile management
- Repo metadata (name, project_id, default_branch)
- D1 storage for all resource metadata
- Schema validation via @wonder/context
- Version management for definitions

**Storage:** D1 (resources database)

**RPC Methods:** `workspaces()`, `projects()`, `repos()`, `workflowDefs()`, `taskDefs()`, `actions()`, etc.

**Called by:** HTTP service (REST API), Web service (UI operations), Coordinator (fetch definitions), Executor (fetch task/action specs)

---

### source

**Purpose:** Versioned content storage (code and artifacts)

**Responsibilities:**

- Git object storage (blobs, trees, commits) in R2
- Ref management (branches, tags) in D1
- Git remote helper protocol (fetch, push)
- Repo content operations for containers
- Artifacts repo management per project

**Storage:** R2 (git objects), D1 (refs)

**RPC Methods:** `getObject()`, `putObject()`, `getRefs()`, `updateRef()`, `fetch()`, `push()`

**Called by:** Containers (clone/push during provision/hibernation), HTTP (remote helper protocol)

---

### web

**Purpose:** Web UI application (full-stack Worker)

**Responsibilities:**

- Server-side: Serve frontend assets, handle API routes
- Server-side: RPC calls to Resources, Coordinator, etc.
- Client-side: Browser application for workflow visualization and monitoring
- Client-side: WebSocket connections to logs/events for streaming
- Code view: file tree, syntax highlighting, diff viewer, branch switcher
- Artifacts view: document browser, rich rendering, semantic search

**Storage:** None

**RPC Methods:** None (consumes other services via RPC server-side)

**Called by:** End users (browsers → web Worker → other services via RPC)

---

## Communication Patterns

### Service-to-Service (Workers RPC)

```typescript
// Coordinator claiming container ownership
const container = env.CONTAINERS.get(repoId);
await container.claim(runId, baseBranch);

// Executor calling Containers for shell actions
const container = env.CONTAINERS.get(repoId);
const result = await container.exec(runId, command, timeoutMs);

// Containers calling Source for clone
const source = env.SOURCE;
const objects = await source.fetch(repoId, ref);

// Containers calling Cache for dependencies
const cache = env.CACHE;
const tarball = await cache.get(lockfileHash);

// HTTP service calling Resources service
const resources = env.RESOURCES.workflowDefs();
const workflowDef = await resources.get(workflowDefId);

// Coordinator calling Executor (via queue)
await env.WORKFLOW_TASKS.send({
  token_id: 'tok_123',
  task_id: 'task_456',
  input: { ... }
});
```

### Service-to-Package (Import)

```typescript
// Coordinator importing @wonder/context
import { Validator } from '@wonder/context';
const validator = new Validator(schema);
const result = validator.validate(data);

// Executor importing @wonder/templates
import { compile } from '@wonder/templates';
const template = compile(promptTemplate);
const rendered = template(context);
```

### External-to-Service (HTTP/SDK)

```typescript
// External client using SDK
import { createClient } from '@wonder/sdk';
const client = createClient({ baseUrl: 'https://api.wonder.dev' });
await client.workflows.create({ ... });

// Git remote helper calling Source service
git push wonder main
// → git-remote-wonder binary
// → HTTP POST to Source service
// → Objects to R2, refs to D1
```

## Summary

| Component         | Type    | Deploy Target      | Storage          | Communication                                 |
| ----------------- | ------- | ------------------ | ---------------- | --------------------------------------------- |
| @wonder/context   | Package | npm (internal)     | None             | Import                                        |
| @wonder/sdk       | Package | npm (public)       | None             | Import                                        |
| @wonder/templates | Package | npm (internal)     | None             | Import                                        |
| @wonder/test      | Package | npm (internal)     | None             | Import                                        |
| cache             | Service | Cloudflare Workers | R2               | Workers RPC                                   |
| containers        | Service | Cloudflare Workers | DO SQLite        | Workers RPC                                   |
| coordinator       | Service | Cloudflare Workers | DO SQLite, D1    | Workers RPC                                   |
| events            | Service | Cloudflare Workers | D1               | Workers RPC                                   |
| executor          | Service | Cloudflare Workers | None (stateless) | Workers RPC                                   |
| http              | Service | Cloudflare Workers | None (gateway)   | Workers RPC                                   |
| logs              | Service | Cloudflare Workers | D1               | Workers RPC                                   |
| resources         | Service | Cloudflare Workers | D1               | Workers RPC                                   |
| source            | Service | Cloudflare Workers | R2, D1           | Workers RPC                                   |
| web               | Service | Cloudflare Workers | None             | Workers RPC (server), HTTP/WebSocket (client) |

Packages are libraries. Services are deployed workers. Services talk via RPC, never direct imports.
