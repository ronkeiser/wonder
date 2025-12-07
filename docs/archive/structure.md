### 1. Monorepo Structure

```
wonder/
├── packages/
│   ├── logger/                     # @wonder/logger
│   │   ├── src/
│   │   │   ├── logger.ts           # Logger implementation
│   │   │   ├── schema.ts           # D1 schema for logs table
│   │   │   └── index.ts
│   │   └── package.json
│   └── schema/                     # @wonder/schema
│       └── src/                    # Shared types, validation, DDL/DML
├── services/
│   ├── http/                       # HTTP routing service
│   │   ├── src/
│   │   │   ├── routes/             # OpenAPI routes
│   │   │   └── index.ts            # Hono app assembly
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.jsonc
│   ├── resources/                  # CRUD + data access service
│   │   ├── src/
│   │   │   ├── resources/          # RPC classes (workspaces, projects, etc.)
│   │   │   ├── infrastructure/     # DB schema, repositories
│   │   │   ├── handlers/           # HTTP handler (minimal)
│   │   │   └── index.ts            # WorkerEntrypoint with RPC methods
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.jsonc
│   ├── coordinator/                # Workflow orchestration DO
│   │   ├── src/
│   │   │   ├── coordinator.ts      # Durable Object class
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.jsonc
│   ├── executor/                   # Task execution service
│   │   ├── src/
│   │   │   └── index.ts            # WorkerEntrypoint with executeTask RPC
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.jsonc
│   ├── events/                     # Event sourcing DO service
│   │   ├── src/
│   │   │   └── index.ts            # Event persistence + streaming
│   │   └── wrangler.jsonc
│   └── web/                        # UI service
│       ├── src/
│       │   ├── routes/             # SvelteKit routes
│       │   ├── lib/                # Shared utilities
│       │   └── app.html
│       ├── package.json
│       ├── tsconfig.json
│       └── wrangler.jsonc
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

### 2. Service Boundaries

**HTTP (`services/http`) responsibilities**:

- HTTP routing and request validation (OpenAPI)
- Route requests to appropriate services via RPC
- WebSocket proxying to coordinator
- No business logic

**Resources (`services/resources`) responsibilities**:

- CRUD operations on entities (workspaces, projects, workflow definitions, etc.)
- Database access (D1 via repositories)
- Data validation and schema enforcement
- RPC interface for other services

**Coordinator (`services/coordinator`) responsibilities**:

- Workflow run orchestration (DO per run)
- Token state management and fan-out/fan-in
- Context storage in DO SQLite
- Task dispatch to executor via RPC
- WebSocket event streaming

**Executor (`services/executor`) responsibilities**:

- Action execution (LLM calls, HTTP requests, MCP tools)
- Provider integrations (Anthropic, OpenAI, etc.)
- Task result generation
- RPC interface for coordinator

**Events (`services/events`) responsibilities**:

- Event persistence to D1
- Metrics to Analytics Engine
- Event streaming and replay
- RPC interface for event writes

**Web (`services/web`) responsibilities**:

- UI rendering (SSR + client)
- Static assets
- Session management
- Authentication flow (login UI)
- API client (via HTTP service)

**Hard boundaries (CANNOT cross)**:

- ❌ Services cannot import code from other services (use RPC bindings)
- ❌ Web cannot access D1 directly
- ❌ HTTP service cannot implement business logic
- ❌ Only resources service accesses D1 for entities
- ❌ Only coordinator and events services use Durable Objects

### 3. Service Internal Structure

**Resources Service** (`services/resources`):

```
src/
├── resources/              # RPC resources (application services)
│   ├── workspaces.ts           # WorkerEntrypoint RPC methods
│   ├── projects.ts
│   ├── workflow-defs.ts
│   ├── workflows.ts
│   ├── actions.ts
│   ├── prompt-specs.ts
│   └── model-profiles.ts
├── infrastructure/
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema (D1)
│   │   └── repositories.ts     # Data access layer
│   └── context.ts              # ServiceContext type
├── handlers/
│   └── fetch.ts                # Minimal HTTP handler (health check)
├── errors.ts
└── index.ts                    # WorkerEntrypoint assembly
```

**Coordinator Service** (`services/coordinator`):

```
src/
├── coordinator.ts          # WorkflowCoordinator DO class
│   ├── fetch()                 # HTTP + WebSocket handler
│   ├── processTaskAsync()      # RPC call to executor
│   └── broadcast()             # WebSocket event streaming
└── index.ts                # Export DO class
```

**Executor Service** (`services/executor`):

```
src/
└── index.ts                # WorkerEntrypoint with executeTask() RPC
    ├── executeTask()           # Main RPC method
    ├── executeAction()         # Action dispatch logic
    └── fetch()                 # Health check endpoint
```

**Events Service** (`services/events`):

```
src/
└── index.ts                # Event DO + RPC methods
    ├── writeEvent()            # Persist to D1
    ├── writeMetric()           # Send to Analytics Engine
    └── getEvents()             # Query for replay
```

**HTTP Service** (`services/http`):

```
src/
├── routes/                 # OpenAPI route handlers
│   ├── workspaces.ts           # Proxy to resources RPC
│   ├── projects.ts
│   ├── workflows.ts
│   └── coordinator.ts          # WebSocket proxying
└── index.ts                # Hono app assembly
```

**Architecture principles:**

1. **Service separation by responsibility**

   - Each service is independently deployable
   - Communication via RPC service bindings
   - No code sharing between services (use RPC)
   - Clear ownership boundaries

2. **Resources = Data access only**

   - CRUD operations on entities
   - Repository pattern for D1 access
   - Schema validation and enforcement
   - Exposes RPC methods for other services

3. **Coordinator = Workflow orchestration**

   - Durable Object per workflow run
   - Manages tokens, context, fan-out/fan-in
   - Calls executor via RPC for task execution
   - Calls resources via RPC for definitions
   - Calls events via RPC for persistence

4. **Executor = Action execution**

   - Stateless task processing
   - Provider integrations (LLMs, APIs)
   - Returns results synchronously via RPC
   - No direct data persistence

5. **Events = Observability infrastructure**

   - Event persistence (D1 + Analytics Engine)
   - Event replay and time-travel debugging
   - Metrics collection and aggregation
   - Exposes RPC methods for writes/queries

6. **HTTP = Thin routing layer**
   - OpenAPI request validation
   - Route to services via RPC
   - WebSocket proxying only
   - No business logic

**Data flow:**

```
HTTP Request
  ↓
HTTP Service (routing)
  ↓ (RPC)
Resources Service → D1 (read/write entities)

Workflow Start
  ↓
HTTP Service
  ↓ (WebSocket proxy)
Coordinator DO
  ↓ (RPC)
Resources Service (get workflow definition) → D1
  ↓ (RPC)
Executor Service (execute task)
  ↓ (returns result)
Coordinator DO
  ↓ (RPC)
Events Service → D1 (events) + Analytics Engine (metrics)
  ↓ (WebSocket)
HTTP Service → Client (live updates)
```

**File pattern** (within each resource):

```
resources/workflows/
├── resource.ts         # RPC class (application service)
│   - create(data)      # Orchestrates validation + repo calls
│   - start(id, input)  # Coordinates with coordinator
│   - get(id)           # Simple repo delegation
│   - list(filters)     # Query orchestration
└── repository.ts       # Data access layer
    - createWorkflow()  # Pure D1 operations
    - getWorkflow()     # No business logic
    - listWorkflows()   # SQL queries only
```
