### 1. Monorepo Structure

```
wonder/
├── packages/
│   └── logger/                     # @wonder/logger
│       ├── src/
│       │   ├── logger.ts           # Logger implementation
│       │   ├── schema.ts           # D1 schema for logs table
│       │   └── index.ts
│       └── package.json
├── services/
│   ├── api/                        # Business logic service
│   │   ├── src/
│   │   │   ├── domains/            # Business logic (10 bounded contexts)
│   │   │   ├── infrastructure/     # External systems & platform services
│   │   │   ├── adapters/           # Protocol adapters (HTTP, RPC)
│   │   │   ├── errors.ts           # Custom error classes
│   │   │   └── index.ts            # Service assembly
│   │   ├── test/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── e2e/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.toml
│   └── web/                        # UI service
│       ├── src/
│       │   ├── routes/             # SvelteKit routes
│       │   ├── lib/                # Shared utilities
│       │   └── app.html
│       ├── package.json
│       ├── tsconfig.json
│       └── wrangler.toml
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

### 2. Service Boundaries

**API (`services/api`) responsibilities**:

- Database access (D1 via Drizzle ORM)
- Workflow engine execution
- Business logic (domain classes, validation)
- MCP server implementation
- Authentication verification
- External integrations (webhooks)

**Web (`services/web`) responsibilities**:

- UI rendering (SSR + client)
- Static assets
- Session management
- Authentication flow (login UI)
- API client (via RPC)

**Hard boundaries (CANNOT cross)**:

- ❌ Web cannot access D1 directly
- ❌ Web cannot import api code directly (use RPC binding)
- ❌ Web cannot implement business logic
- ❌ API cannot render HTML/UI

### 3. API Internal Structure

**Resources + Execution Infrastructure**:

```
services/api/src/
├── resources/            # RPC resources + data access (REST entities)
│   ├── workspaces/
│   │   ├── resource.ts       # RPC class: CRUD operations
│   │   └── repository.ts     # D1 access for workspaces
│   ├── projects/
│   │   ├── resource.ts
│   │   └── repository.ts
│   ├── workflow-defs/
│   │   ├── resource.ts       # RPC class: create/version workflow definitions
│   │   ├── repository.ts     # WorkflowDef, Node, Transition data access
│   │   └── transforms.ts     # Data transformations (owner, fan_in, etc.)
│   ├── workflows/
│   │   ├── resource.ts       # RPC class: bind workflows, start runs
│   │   └── repository.ts
│   ├── actions/
│   │   ├── resource.ts
│   │   └── repository.ts
│   ├── prompt-specs/
│   │   ├── resource.ts
│   │   └── repository.ts
│   ├── model-profiles/
│   │   ├── resource.ts
│   │   └── repository.ts
│   └── workflow-runs/
│       ├── resource.ts       # RPC class: query runs, get status
│       └── repository.ts     # D1 persistence for completed runs
├── coordinator/          # Durable Object (workflow orchestration)
│   ├── index.ts              # WorkflowCoordinator DO class
│   ├── lifecycle.ts          # Workflow lifecycle management
│   ├── context.ts            # Context manager (DO SQLite)
│   ├── tokens.ts             # Token manager (DO SQLite)
│   ├── tasks.ts              # Task dispatcher (enqueues to worker)
│   └── results.ts            # Task result processor
├── events/               # Event sourcing (cross-cutting)
│   ├── buffer.ts             # Event buffer (DO SQLite)
│   └── stream.ts             # WebSocket event streaming
├── execution/            # Task execution (queue consumer)
│   ├── worker.ts             # Queue consumer entrypoint
│   ├── executor.ts           # Action execution logic
│   └── definitions.ts        # Shared types (Context, Token, WorkflowTask, etc.)
└── infrastructure/       # External systems & platform services
    ├── db/
    │   └── schema.ts         # Drizzle schema (D1)
    ├── context.ts            # ServiceContext type
    └── clients/              # External APIs (Anthropic, OpenAI, etc.)
```

**Architecture principles:**

1. **Resources = Application services + Data access**

   - RPC resources handle orchestration across repositories
   - Repositories provide clean data access layer
   - Co-located for cohesion (resource owns its data access)
   - Testable: unit test repositories, integration test resources

2. **Coordinator = Workflow state management**

   - Durable Object with SQLite storage
   - Manages workflow lifecycle, tokens, context
   - Calls resource repositories for workflow definitions and metadata
   - Not a resource (doesn't map to REST entity)

3. **Execution = Task processing**

   - Queue consumer for workflow tasks
   - Calls LLM providers, executes actions
   - Reports results back to coordinator
   - Calls resource repositories for action/prompt specs

4. **Events = Observability**
   - Event sourcing for workflow execution
   - WebSocket streaming for live updates
   - Cross-cutting concern used by coordinator

**Data flow:**

```
HTTP → resources/workflows (RPC) → D1

coordinator → resources/workflow-defs/repository → D1
           → resources/actions/repository → D1
           → events/buffer → DO SQLite

execution/worker → resources/model-profiles/repository → D1
                → coordinator (via DO stub) → DO SQLite
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
