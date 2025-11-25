### 1. Monorepo Structure

```
wonder/
├── packages/
│   └── types/                      # @wonder/types
│       ├── src/
│       │   ├── primitives/         # Interfaces for ADR-002 primitives
│       │   ├── errors.ts           # Domain error classes
│       │   └── index.ts
│       └── package.json
├── services/
│   ├── api/                        # Business logic service
│   │   ├── src/
│   │   │   ├── domains/            # Business logic (10 bounded contexts)
│   │   │   ├── infrastructure/     # External systems & platform services
│   │   │   ├── adapters/           # Protocol adapters (HTTP, RPC)
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

**Three-way separation**:

```
services/api/src/
├── domains/              # Business logic (ADR-002 bounded contexts)
│   ├── graph/            # WorkflowDef, NodeDef, TransitionDef
│   ├── execution/        # WorkflowInstance, WorkItem, Token, Engine
│   ├── schema/           # Schema, ArtifactType, FieldDefinition
│   ├── ai/               # PromptSpec, ModelProfile, ResearchQuery
│   ├── actors/           # Actor, AgentRole, Session
│   ├── effects/          # ActionDef, Tool, ToolInvocation
│   ├── events/           # Event, ExecutionLog, Trigger
│   ├── observability/    # Observation, Dashboard, Widget
│   ├── conversation/     # Turn, ChatMessage
│   └── composition/      # Template, SubworkflowInvocation, Schedule
├── infrastructure/       # External systems & platform services
│   ├── db/               # D1 (Drizzle schema, migrations, client)
│   ├── vectorize/        # Vectorize client
│   ├── kv/               # Workers KV client
│   ├── storage/          # R2 client
│   ├── queues/           # Cloudflare Queues (future)
│   └── clients/          # External APIs (MCP, GitHub, Anthropic)
└── adapters/             # Protocol adapters (thin wrappers)
    ├── http/             # REST API (Hono routes)
    └── rpc/              # Workers RPC endpoints
```

**File pattern** (within each domain):

```
domains/graph/
├── definitions.ts      # Entities & value objects
├── configs.ts          # Configuration objects
├── repository.ts       # Data access layer
└── service.ts          # Business operations (protocol-agnostic)
```
