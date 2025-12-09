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
      image: 'node:20',
      repo_id: '01HABC...',
      base_branch: 'main',
      merge_on_success: true,
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
      repo_id: '01HABC...',        // code repo
      base_branch: 'main',
      merge_on_success: true,
      merge_strategy: 'rebase'
    }
  },

  artifacts: {
    repo_id: '01HDEF...',          // project artifacts repo
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
      image: 'node:20',
      repo_id: '01HABC...',
      base_branch: 'main',
      merge_on_success: true,
      merge_strategy: 'rebase'
    },
    lib_env: {
      type: 'container',
      image: 'node:20',
      repo_id: '01HGHI...',
      base_branch: 'main',
      merge_on_success: true,
      merge_strategy: 'rebase'
    }
  }
}
```

Each container gets its own working branch in its respective repo. Ownership rules apply per-container.

## End-to-End Execution Flow

This section shows how all the pieces—coordinator, executor, containers, and source hosting—work together when a workflow edits code and commits it.

### Workflow Start: Container Provisioning

```
1. Coordinator receives workflow start request
   → WorkflowDef declares: resources.dev_env { repo_id, base_branch: 'main' }

2. Coordinator creates working branch ref in D1
   → Branch: wonder/run-01HABC
   → Points to same SHA as main

3. Coordinator provisions container via Containers service
   → containerStub = env.CONTAINERS.get(env.CONTAINERS.idFromName(repo_id))
   → await containerStub.claim(workflow_run_id, 'wonder/run-01HABC')

4. ContainerDO starts container with environment
   → REPO_ID=01HXYZ...
   → BRANCH=wonder/run-01HABC
   → WONDER_API_TOKEN=...

5. Container init script runs
   → git config remote.wonder.url "wonder://${REPO_ID}"
   → git config remote.wonder.helper "/usr/local/bin/git-remote-wonder"
   → git clone wonder://${REPO_ID} /workspace
   → git checkout ${BRANCH}
   → pnpm install  # uses R2-backed store, cached by lockfile hash

6. Container ready
   → ContainerDO marks status: 'active'
   → Coordinator dispatches first token
```

**Key insight:** The git remote helper translates git commands to HTTP calls to the Source service Worker. `git clone wonder://repo_id` → `GET /repos/{id}/refs` + `POST /repos/{id}/fetch` → objects fetched from R2.

### Task Execution: Running Shell Commands

```
1. Coordinator dispatches token to Executor (via queue)
   → TaskPayload includes:
      - task_id: shell_edit_task
      - resources: { "container": "do-abc123..." }  # resolved container DO ID
      - input: { file: "src/auth.ts", changes: "..." }

2. Executor loads TaskDef and executes steps
   → Step 1: action_id: shell, action_version: 1
   → ActionDef.implementation:
      - command_template: "cat > {{file}} << 'EOF'\n{{changes}}\nEOF"
      - resource_name: "container"

3. Executor resolves container from resources
   → containerId = taskPayload.resources["container"]  # from Node.resource_bindings
   → containerStub = env.CONTAINERS.get(env.CONTAINERS.idFromString(containerId))

4. Executor calls container to execute command
   → result = await containerStub.exec(workflow_run_id, renderedCommand, {
       cwd: '/workspace',
       timeout: 60000
     })

5. ContainerDO validates ownership
   → if (this.owner_run_id !== workflow_run_id) throw new Error("Not owner")
   → Forward command to container's shell server (HTTP endpoint in container)

6. Container executes command
   → Shell writes file to /workspace/src/auth.ts
   → Returns: { stdout, stderr, exit_code: 0 }

7. Executor returns result to Coordinator (via RPC)
   → coordinator.handleTaskResult(token_id, { output_data: { exit_code: 0, ... } })
```

**Key insight:** The Executor never directly accesses the container. It calls ContainerDO via RPC, which validates ownership and forwards to the actual container process.

### Git Commit: Writing to R2/D1

```
1. Workflow reaches commit node
   → Node: commit
   → task_id: git_commit_task (tool action)
   → resource_bindings: { container: dev_env }

2. Executor executes git_commit tool
   → Tool implementation calls container:
      - containerStub.exec(run_id, "git add .", { cwd: '/workspace' })
      - containerStub.exec(run_id, "git commit -m 'feat: add JWT auth'", { cwd: '/workspace' })

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
   → Validates auth (workflow owns this repo)
   → Writes objects to R2: git-objects/{repo_id}/{sha}
   → Updates ref in D1:
      UPDATE refs
      SET sha = 'new_commit_sha', updated_at = NOW()
      WHERE repo_id = '01HXYZ...' AND name = 'refs/heads/wonder/run-01HABC'
   → Returns success

7. Executor receives success from container
   → Returns result to Coordinator
```

**Key insight:** Git operations use standard git commands. The remote helper is a ~50 line script that translates git's wire protocol to HTTP. The Source Worker handles all storage complexity.

### Workflow Completion: Merge to Main

```
1. Workflow reaches end node, all tokens completed
   → Coordinator checks WorkflowDef.resources.dev_env.merge_on_success: true

2. Coordinator calls Source service to merge
   → source.merge({
       repo_id: '01HXYZ...',
       source_branch: 'wonder/run-01HABC',
       target_branch: 'main',
       strategy: 'rebase'  # from WorkflowDef.merge_strategy
     })

3. Source service performs merge
   → Read current main SHA from D1
   → Read working branch SHA from D1
   → If main moved since workflow started:
      - strategy: 'rebase' → git rebase main into working branch, retry merge
      - strategy: 'fail' → return error, coordinator transitions to error path
      - strategy: 'force' → overwrite main (dangerous)
   → If no conflicts: create merge commit or fast-forward
   → CAS update main ref in D1:
      UPDATE refs
      SET sha = 'merge_commit_sha'
      WHERE repo_id = '01HXYZ...'
        AND name = 'refs/heads/main'
        AND sha = 'expected_base_sha'  # optimistic concurrency

4. Coordinator releases container
   → containerStub.release(workflow_run_id)
   → ContainerDO marks status: 'destroyed'
   → Container process shuts down

5. Working branch retained for history
   → Branch wonder/run-01HABC remains in refs table
   → All commits reachable from main or the working branch
   → Cleanup policy may delete old branches after retention period
```

**Key insight:** Merge is a Source service operation with optimistic concurrency control. The CAS on the ref update catches concurrent modifications.

### The Complete Round Trip

```
User → HTTP service → Coordinator DO
                       ↓
                    Creates working branch (D1)
                    Provisions container (ContainerDO)
                       ↓
                    Container init script:
                      git clone wonder://repo (via remote helper)
                        → Source Worker
                          → Fetch objects from R2
                          → Return to container
                       ↓
                    Coordinator dispatches tokens
                       ↓
                    Executor receives task (via queue)
                      → Loads TaskDef, ActionDef (from Resources)
                      → Executes shell action
                        → containerStub.exec(command)
                          → ContainerDO validates ownership
                            → Shell server in container
                              → Command executes
                              → Files modified
                       ↓
                    Executor runs git_commit tool
                      → containerStub.exec("git commit")
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
                    Coordinator releases container
                      → ContainerDO destroys container
```

### Hibernation and Resume

For workflows with human gates:

```
1. Before human gate node
   → Workflow must commit all changes (validation enforced)
   → Coordinator records current SHA in workflow context
   → Coordinator calls containerStub.hibernate()
   → ContainerDO records SHA, destroys container

2. Human approves (hours/days later)
   → Coordinator provisions new container
   → containerStub.claim(workflow_run_id, 'wonder/run-01HABC')
   → Container init script:
      - git clone wonder://repo
      - git checkout wonder/run-01HABC  # resumes at exact SHA
      - pnpm install  # from R2-backed store, cache hit likely
   → Workflow resumes execution
```

**Key insight:** Container state IS git state. Hibernation requires no snapshots or state serialization—just a SHA. Resume is a fresh container checkout.

## Artifacts Workflow

Artifacts are committed like code. A workflow that produces an artifact:

```yaml
# WorkflowDef nodes
nodes:
  - ref: research
    task_id: llm_research_task
    task_version: 1
    resource_bindings:
      container: artifacts
    input_mapping:
      prompt: 'analyze market trends and provide recommendations'
    output_mapping:
      findings: $.response.findings
      recommendations: $.response.recommendations

  - ref: write_artifact
    task_id: write_file_task
    task_version: 1
    resource_bindings:
      container: artifacts
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
    task_id: git_commit_task
    task_version: 1
    resource_bindings:
      container: artifacts
    input_mapping:
      message: 'research: market analysis'
      files: ['.']
```

Each node references a TaskDef (e.g., `llm_research_task`, `write_file_task`, `git_commit_task`). The TaskDef contains steps that reference ActionDefs. The node handles resource bindings and data mapping between workflow context and task I/O.

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
