# Architecture Documentation Rewrite Plan

## New Structure (Variation E: Hybrid)

```
/docs/architecture/
├── README.md                    # What is Wonder, top goals, navigation guide
│
├── core/                        # Foundation concepts
│   ├── actor-model.md
│   ├── decision-pattern.md
│   ├── data-model.md
│   └── hierarchy.md
│
├── execution/                   # How workflows execute
│   ├── graph-model.md
│   ├── token-lifecycle.md
│   ├── branching.md
│   ├── context.md
│   └── completion.md
│
├── coordinator/                 # The orchestrator
│   ├── overview.md
│   ├── implementation.md
│   ├── decisions.md
│   ├── operations.md
│   └── application.md
│
├── actions/                     # What nodes can do
│   ├── overview.md
│   ├── llm-calls.md
│   ├── mcp-tools.md
│   ├── http-requests.md
│   ├── human-input.md
│   ├── subworkflows.md
│   └── transformations.md
│
├── control/                     # Limits & constraints
│   ├── limits.md
│   ├── timeouts.md
│   ├── cancellation.md
│   ├── cost-management.md
│   └── error-handling.md
│
├── artifacts/                   # Artifact management
│   ├── lifecycle.md
│   ├── storage.md
│   └── search.md
│
├── observability/               # Debugging & monitoring
│   ├── logs-events-decisions.md
│   ├── logging.md
│   ├── events.md
│   ├── metrics.md
│   └── debugging.md
│
├── security/                    # Protection & isolation
│   ├── authentication.md
│   ├── secrets.md
│   ├── isolation.md
│   └── audit.md
│
├── lifecycle/                   # Change management
│   ├── versioning.md
│   ├── deployment.md
│   └── disaster-recovery.md
│
├── platform/                    # Cloudflare specifics
│   ├── cloudflare.md
│   ├── services.md
│   ├── storage.md
│   └── websockets.md
│
├── development/                 # Building & testing
│   ├── patterns.md
│   ├── testing.md
│   ├── e2e.md
│   ├── sdk.md
│   └── templates.md
│
└── reference/                   # Quick lookups
    ├── primitives.ts
    └── performance.md
```
