# Project Resources

## Overview

A Wonder project organizes all resources needed for AI-assisted development: code repositories, artifacts, and workflow runs. This document describes how these resources relate, how concurrent access is managed, and how the unified storage model surfaces through distinct UX concepts.

## Resource Types

Every project contains:

| Resource       | Description                            | Cardinality                |
| -------------- | -------------------------------------- | -------------------------- |
| Code Repos     | Source code, versioned via git         | One or more                |
| Artifacts Repo | Documents, research, decisions, images | Exactly one (auto-created) |
| Workflows      | Bound graph definitions with triggers  | Many                       |
| Runs           | Executing workflow instances           | Many                       |

Code repos and the artifacts repo share the same underlying storage (R2 + D1), same versioning model (git), and same branching semantics. They're separated for UX clarity, not technical necessity.

## Storage Model

All repos—code and artifacts—use Cloudflare-native git:

```
R2
└── git-objects/{repo_id}/{sha}     — blobs, trees, commits

D1
├── repositories                     — repo metadata
├── refs                             — branch/tag → SHA
└── commits                          — indexed for queries
```

## Storage Architecture

Repos and artifacts have two layers:

**Metadata (Resources service, D1):**

- Repo: id, project_id, name, default_branch, created_at
- Artifact schema definitions: path patterns, validation rules, frontmatter requirements

**Content (Source service, R2 + D1):**

- Git objects (blobs, trees, commits) in R2
- Refs (branches, tags) in D1

Resources knows _that_ a repo exists and its configuration. Source knows _what's in it_.

This mirrors other primitives: WorkflowDef metadata lives in Resources, runtime context lives in Coordinator DO. The pattern is consistent—metadata in D1 via Resources, operational state managed by specialized services.

One system. Artifacts aren't special—they're files in a repo with conventions.

## Project Structure

```
Project (my-backend)
├── Repos
│   ├── api-service                  # code repo
│   ├── shared-lib                   # code repo
│   └── worker-jobs                  # code repo
├── Artifacts                        # artifacts repo (auto-created)
│   ├── decisions/
│   │   └── adr-001-auth.md
│   ├── research/
│   │   └── competitor-analysis.md
│   └── reports/
│       └── q3-review.json
└── Workflows
    ├── implement-feature
    ├── code-review
    └── research-pipeline
```

### Code Repos

Projects can have multiple code repos. Common patterns:

- **Monorepo**: Single repo, multiple services/packages
- **Multi-repo**: Separate repos for distinct services, shared libraries, deploy configs

Workflows declare which repo(s) they operate on.

### Artifacts Repo

Every project has one artifacts repo, created automatically. It holds non-code outputs:

- Architecture Decision Records (ADRs)
- Research documents
- Generated reports
- Diagrams and images
- Structured data (JSON, YAML)

Artifacts are organized by directory convention:

```
artifacts/
├── decisions/      # ADRs, technical decisions
├── research/       # Investigation outputs
├── reports/        # Generated reports, analyses
├── assets/         # Images, diagrams
└── specs/          # Specifications, schemas
```

### Cross-References

Artifacts can reference code commits:

```yaml
# artifacts/decisions/adr-001-auth.md
---
title: Use JWT for API Authentication
status: accepted
date: 2024-01-15
related:
  - repo: api-service
    sha: a1b2c3d4
    description: Implementation commit
---
## Context
...
```

Code and artifacts are versioned independently but can be linked by SHA for traceability.

## Access Model

Containers and repos have different access semantics.

### Container Access: Linear Ownership

Containers are exclusive. One workflow owns a container at a time. Ownership transfers explicitly and returns when the sub-workflow completes.

See [Containers](./containers.md) for details.

### Repo Access: Branch Isolation

Repos use git's natural concurrency model. Multiple workflows can operate on the same repo simultaneously—each on its own branch.

```
main
├── wonder/run-01HABC...        # workflow run A
├── wonder/run-01HDEF...        # workflow run B (concurrent)
└── wonder/run-01HGHI...        # workflow run C (concurrent)
```

**Rules:**

1. **Read from any branch**: Workflows can read any branch at any time
2. **Write to own branch**: Each workflow run gets an isolated branch
3. **Merge requires lock**: Merging to a target branch requires exclusive access to that ref

### Branch Lifecycle

```
Workflow starts
  → Create branch: wonder/run-{run_id} from {base_branch}
  → All commits go to this branch

Workflow completes (success)
  → Optionally merge to target branch
  → Branch retained for history (or cleaned up by policy)

Workflow fails/cancelled
  → Branch retained for debugging
  → Cleaned up after retention period
```

### Merge Semantics

Merging uses optimistic concurrency:

```typescript
// Attempt merge via CAS on ref
const result = await updateRef({
  repo_id,
  ref: 'refs/heads/main',
  expected_sha: base_sha, // what we branched from
  new_sha: merge_commit_sha,
});

if (!result.success) {
  // main moved; need rebase or conflict resolution
}
```

If the target branch moved since the workflow started, options are:

| Strategy | Behavior                                     |
| -------- | -------------------------------------------- |
| `rebase` | Auto-rebase onto new target, retry merge     |
| `fail`   | Transition to error path, human intervention |
| `force`  | Overwrite (dangerous, rarely appropriate)    |

Configured per workflow:

```typescript
WorkflowDef {
  resources: {
    dev_env: {
      type: 'container',
      repo: 'api-service',
      branch: 'main',
      merge_strategy: 'rebase'
    }
  }
}
```

## Workflow Resource Declaration

Workflows declare what they need:

```typescript
WorkflowDef {
  id: 'implement_feature_v1',

  resources: {
    dev_env: {
      type: 'container',
      image: 'node:20',
      repo: 'api-service',         // code repo
      branch: 'main',              // base branch
      merge_on_success: true,
      merge_strategy: 'rebase'
    }
  },

  artifacts: {
    repo: 'artifacts',             // defaults to project artifacts repo
    paths: ['decisions/', 'research/']  // paths this workflow may write
  }
}
```

### Container + Repo Relationship

A container declaration includes a repo binding:

- `repo`: Which repo to clone/checkout
- `branch`: Base branch to create working branch from
- `merge_on_success`: Whether to merge working branch on completion
- `merge_strategy`: How to handle conflicts

The container operates on the working branch. Commits go there. Merge happens at workflow completion if configured.

### Multi-Repo Workflows

Workflows can access multiple repos:

```typescript
WorkflowDef {
  resources: {
    api_env: {
      type: 'container',
      repo: 'api-service',
      branch: 'main'
    },
    lib_env: {
      type: 'container',
      repo: 'shared-lib',
      branch: 'main'
    }
  }
}
```

Each container gets its own working branch in its respective repo. Ownership rules apply per-container.

## Artifacts Workflow

Artifacts are committed like code. A workflow that produces an artifact:

```
Node: research (llm_call)
  → output: { findings, recommendations }

Node: write_artifact (shell_exec)
  → command: |
      cat > /workspace/research/market-analysis.md << 'EOF'
      ---
      title: Market Analysis
      date: 2024-01-15
      workflow_run: ${run_id}
      ---

      ## Findings
      ${findings}

      ## Recommendations
      ${recommendations}
      EOF

Node: commit (shell_exec)
  → command: git add -A && git commit -m "research: market analysis"
```

The artifact is now versioned, diffable, searchable.

### Artifact Schemas

Enforce structure via schemas:

```typescript
// Project configuration
{
  artifact_schemas: {
    "decisions/*.md": {
      frontmatter: {
        title: { type: "string", required: true },
        status: { enum: ["proposed", "accepted", "deprecated"], required: true },
        date: { type: "date", required: true }
      }
    },
    "reports/*.json": {
      schema: { $ref: "schemas/report.json" }
    }
  }
}
```

Validation runs on commit. Invalid artifacts fail the commit.

### Artifact Indexing

Artifacts are indexed for discovery:

| Index     | Purpose                                  |
| --------- | ---------------------------------------- |
| D1        | Metadata queries (by type, date, status) |
| Vectorize | Semantic search over content             |

Indexing happens post-commit via event handler:

```
Event: container_commit
  → Filter: paths match artifacts/**
  → Action: Extract metadata, update D1 index
  → Action: Generate embeddings, update Vectorize
```

## Concurrent Workflows Example

Two workflows operating on the same project simultaneously:

```
Workflow A: implement-auth
  → Creates branch: wonder/run-01HABC from main
  → Container A: clones api-service @ wonder/run-01HABC
  → Commits: implement JWT auth
  → Human gate: review
  → Merges to main ✓

Workflow B: implement-logging (started concurrently)
  → Creates branch: wonder/run-01HDEF from main
  → Container B: clones api-service @ wonder/run-01HDEF
  → Commits: add structured logging
  → Human gate: review
  → Attempts merge to main
  → main moved (A merged first)
  → Rebase onto new main
  → Merge ✓
```

No locks during execution. Conflict resolution at merge time. Git handles the complexity.

## UX Separation

Unified storage, distinct interfaces:

### Code View

- File tree navigator
- Syntax-highlighted source
- Diff viewer
- Branch switcher
- Deployment status

### Artifacts View

- Document browser by type
- Rich rendering (markdown preview, image display)
- Semantic search
- Timeline view (recent artifacts)
- Cross-reference links

### Run View

- Workflow execution tree
- Node inspector
- Live branch state
- Commit log for this run
- Artifact outputs

The underlying data is commits in repos. The UX interprets it through different lenses.

## Summary

| Concept             | Model                                                  |
| ------------------- | ------------------------------------------------------ |
| Storage             | Unified Cloudflare-native git (R2 + D1)                |
| Code repos          | One or more per project, branch-isolated access        |
| Artifacts repo      | One per project, same git semantics                    |
| Container ownership | Linear, exclusive, explicit transfer                   |
| Repo access         | Branch-based, concurrent reads, isolated writes        |
| Merge               | Optimistic concurrency, configurable conflict strategy |
| Discovery           | D1 for metadata, Vectorize for semantic search         |
| UX                  | Separate views for code vs artifacts, unified history  |

The result: multiple workflows can operate on a project concurrently, each in isolation, with git handling the complexity of concurrent evolution. Code and artifacts share the same versioning model but surface through distinct, purpose-built interfaces.
