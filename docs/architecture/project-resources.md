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

### Branch Isolation

Repos use git's natural concurrency model. Multiple workflows and agent conversations can operate on the same repo simultaneously—each on its own branch.

```
main
├── wonder/run-01HABC...        # workflow run A
├── wonder/run-01HDEF...        # workflow run B (concurrent)
├── wonder/conv-01HGHI...       # agent conversation
└── wonder/conv-01HJKL...       # another agent conversation
```

**Rules:**

1. **Read from any branch**: Workflows/agents can read any branch at any time
2. **Write to own branch**: Each workflow run or conversation gets an isolated branch
3. **Merge requires lock**: Merging to a target branch requires exclusive access to that ref

### Branch Lifecycle

```
Workflow/Conversation starts
  → Create branch: wonder/run-{run_id} or wonder/conv-{conv_id} from {base_branch}
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

## Workflow Repo Declaration

Workflows declare which repo they operate on:

```typescript
WorkflowDef {
  id: 'implement_feature_v1',

  repo: {
    id: '01HABC...',
    base_branch: 'main',
    merge_on_success: true,
    merge_strategy: 'rebase'
  },

  nodes: [...]
}
```

At workflow start:
1. Create working branch: `wonder/run-{run_id}` from base_branch
2. Store branch in workflow context (`context.branch`)
3. All shell operations implicitly use this branch

Shell actions and library tasks receive repo + branch from context:

```typescript
// Node configuration - no resource bindings needed
{
  id: 'run_tests',
  task_id: 'lib_run_tests',
  input_mapping: {
    pattern: '{{input.test_pattern}}'
  },
  output_mapping: {
    'state.test_output': 'stdout',
    'state.test_exit_code': 'exit_code'
  }
}
```

The executor resolves repo + branch from workflow context automatically.

### Multi-Repo Workflows

Workflows can access multiple repos by declaring them:

```typescript
WorkflowDef {
  id: 'cross_repo_update_v1',

  repos: {
    api: {
      id: '01HABC...',
      base_branch: 'main',
      merge_on_success: true,
      merge_strategy: 'rebase'
    },
    lib: {
      id: '01HGHI...',
      base_branch: 'main',
      merge_on_success: true,
      merge_strategy: 'rebase'
    }
  },

  nodes: [...]
}
```

Each repo gets its own working branch. Nodes specify which repo they target:

```typescript
{
  id: 'update_lib',
  task_id: 'lib_write_file',
  repo: 'lib',  // targets the lib repo's branch
  input_mapping: { ... }
}
```

## End-to-End Execution Flow

This section shows how all the pieces—coordinator, executor, containers, and source hosting—work together when a workflow edits code and commits it.

### Workflow Start: Branch Creation

```
1. Coordinator receives workflow start request
   → WorkflowDef declares: repo { id, base_branch: 'main' }

2. Coordinator creates working branch ref in D1
   → Branch: wonder/run-01HABC
   → Points to same SHA as main

3. Coordinator stores branch in workflow context
   → context.repo_id = '01HXYZ...'
   → context.branch = 'wonder/run-01HABC'

4. Coordinator dispatches first token
```

### Task Execution: Running Shell Commands

```
1. Coordinator dispatches token to Executor (via queue)
   → TaskPayload includes:
      - task_id: lib_run_tests
      - context: { repo_id: '01HXYZ...', branch: 'wonder/run-01HABC', ... }
      - input: { pattern: 'src/**/*.test.ts' }

2. Executor loads Task and executes steps
   → Step 1: shell action
   → ActionDef.implementation:
      - command_template: "pnpm test {{pattern}}"

3. Executor calls container pool
   → containerPool.exec(context.repo_id, context.branch, renderedCommand, {
       timeout: 60000
     })

4. Container pool allocates container
   → Find warm container for repo, or provision new one
   → Ensure checked out to correct branch
   → Execute command

5. Container executes command
   → Shell runs pnpm test
   → Returns: { stdout, stderr, exit_code: 0 }

6. Executor returns result to Coordinator (via RPC)
   → coordinator.handleTaskResult(token_id, { output_data: { ... } })
```

### Git Commit: Writing to R2/D1

```
1. Workflow reaches commit node
   → Node: commit
   → task_id: lib_git_commit
   → input_mapping: { message: 'feat: add JWT auth', files: ['.'] }

2. Executor executes lib_git_commit task
   → Task calls container pool:
      - containerPool.exec(repo_id, branch, "git add .", { cwd: '/workspace' })
      - containerPool.exec(repo_id, branch, "git commit -m 'feat: add JWT auth'", { cwd: '/workspace' })

3. Container runs git commit
   → Git creates blob objects (file contents)
   → Git creates tree object (directory structure)
   → Git creates commit object (metadata + tree SHA + parent SHA)
   → Git updates local branch ref: wonder/run-01HABC → new commit SHA

4. Git push (if configured, or at workflow end)
   → git push wonder wonder/run-01HABC

5. Git remote helper translates push to HTTP
   → Reads new objects from .git/objects/
   → POST /repos/{repo_id}/push
      - Headers: Authorization, Content-Type: application/x-git-pack
      - Body: git pack stream (new blobs, trees, commit)

6. Source service Worker receives push
   → Validates auth (workflow has access to this repo)
   → Writes objects to R2: git-objects/{repo_id}/{sha}
   → Updates ref in D1:
      UPDATE refs
      SET sha = 'new_commit_sha', updated_at = NOW()
      WHERE repo_id = '01HXYZ...' AND name = 'refs/heads/wonder/run-01HABC'
   → Returns success

7. Executor receives success from container
   → Returns result to Coordinator
```

### Workflow Completion: Merge to Main

```
1. Workflow reaches end node, all tokens completed
   → Coordinator checks WorkflowDef.repo.merge_on_success: true

2. Coordinator calls Source service to merge
   → source.merge({
       repo_id: '01HXYZ...',
       source_branch: 'wonder/run-01HABC',
       target_branch: 'main',
       strategy: 'rebase'
     })

3. Source service performs merge
   → Read current main SHA from D1
   → Read working branch SHA from D1
   → If main moved since workflow started:
      - strategy: 'rebase' → rebase working branch onto main, retry merge
      - strategy: 'fail' → return error, coordinator transitions to error path
      - strategy: 'force' → overwrite main (dangerous)
   → If no conflicts: create merge commit or fast-forward
   → CAS update main ref in D1:
      UPDATE refs
      SET sha = 'merge_commit_sha'
      WHERE repo_id = '01HXYZ...'
        AND name = 'refs/heads/main'
        AND sha = 'expected_base_sha'  # optimistic concurrency

4. Working branch retained for history
   → Branch wonder/run-01HABC remains in refs table
   → All commits reachable from main or the working branch
   → Cleanup policy may delete old branches after retention period
```

### The Complete Round Trip

```
User → HTTP service → Coordinator DO
                       ↓
                    Creates working branch (D1)
                    Stores branch in context
                       ↓
                    Coordinator dispatches tokens
                       ↓
                    Executor receives task (via queue)
                      → Loads Task, ActionDef (from Resources)
                      → Executes shell action
                        → containerPool.exec(repo_id, branch, command)
                          → Pool allocates container
                            → Container checked out to branch
                              → Command executes
                              → Files modified
                       ↓
                    Executor runs lib_git_commit task
                      → containerPool.exec(repo_id, branch, "git commit")
                        → Git creates objects locally
                        → git push wonder branch
                          → Remote helper
                            → POST /repos/{id}/push
                              → Source Worker
                                → Write objects to R2
                                → Update ref in D1
                       ↓
                    Workflow completes
                    Coordinator merges to main
                      → Source service CAS update on main ref
```

## Artifacts Workflow

Artifacts are committed like code. A workflow that produces an artifact:

```yaml
# WorkflowDef nodes
nodes:
  - ref: research
    task_id: lib_llm_research
    input_mapping:
      prompt: 'analyze market trends and provide recommendations'
    output_mapping:
      findings: $.response.findings
      recommendations: $.response.recommendations

  - ref: write_artifact
    task_id: lib_write_file
    input_mapping:
      path: 'research/market-analysis.md'
      content: |
        ---
        title: Market Analysis
        date: 2024-01-15
        workflow_run: ${run_id}
        ---

        ## Findings
        ${context.findings}

        ## Recommendations
        ${context.recommendations}
    output_mapping:
      file_written: $.success

  - ref: commit
    task_id: lib_git_commit
    input_mapping:
      message: 'research: market analysis'
      files: ['.']
```

Each node references a Task (e.g., `lib_llm_research`, `lib_write_file`, `lib_git_commit`). The node handles data mapping between workflow context and task I/O. Repo and branch come from workflow context automatically.

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
Event: branch_push
  → Filter: paths match artifacts/**
  → Action: Extract metadata, update D1 index
  → Action: Generate embeddings, update Vectorize
```

## Concurrent Workflows Example

Two workflows operating on the same project simultaneously:

```
Workflow A: implement-auth
  → Creates branch: wonder/run-01HABC from main
  → Commits: implement JWT auth
  → Human gate: review
  → Merges to main ✓

Workflow B: implement-logging (started concurrently)
  → Creates branch: wonder/run-01HDEF from main
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
| Repo access         | Branch-based, concurrent reads, isolated writes        |
| Shell execution     | Specify repo + branch, system handles container        |
| Merge               | Optimistic concurrency, configurable conflict strategy |
| Discovery           | D1 for metadata, Vectorize for semantic search         |
| UX                  | Separate views for code vs artifacts, unified history  |

The result: multiple workflows and agent conversations can operate on a project concurrently, each in isolation, with git handling the complexity of concurrent evolution. Code and artifacts share the same versioning model but surface through distinct, purpose-built interfaces.
