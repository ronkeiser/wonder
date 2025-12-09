# Containers in Wonder

## Overview

Wonder workflows can provision containers for agents to execute shell commands—editing code, running tests, type-checking, deploying, etc. Containers are stateful, long-lived resources that persist across multiple nodes and sub-workflow invocations within a single workflow run.

This document describes the ownership model, lifecycle management, and integration with Wonder's execution model.

## The Problem

Actions in Wonder are atomic and stateless. An `llm_call` executes, returns output, and completes. But implementing a feature might involve dozens of sequential actions—clone, edit, test, fix, commit—all operating on the same filesystem state.

Container lifecycle must therefore be scoped higher than individual nodes. A container is a _resource_ owned at the workflow level, accessible to nodes within that scope, and cleaned up when the scope ends.

## Ownership Model

Containers follow a **linear ownership** model, inspired by Rust's ownership semantics.

### Core Rules

1. **Single owner.** At any moment, exactly one workflow owns a container.
2. **Explicit transfer.** Ownership transfers to a sub-workflow via `pass_resources` and returns when the sub-workflow completes.
3. **No parallel access.** Fan-out branches do not receive container access. Extract data to context before fan-out.
4. **Automatic cleanup.** When the declaring workflow completes, the container is destroyed.

### Declaration

Workflows declare containers in a `resources` block:

```typescript
WorkflowDef {
  id: 'implement_feature_v1',
  nodes: [...],
  transitions: [...],
  resources: {
    dev_env: {
      type: 'container',
      image: 'node:20',
      repo: 'workspace/my-project',
      branch: 'main'
    }
  }
}
```

The workflow that declares the resource is the initial owner.

### Accepting Resources

Sub-workflows that require a container declare `accepts_resources`:

```typescript
WorkflowDef {
  id: 'react_coding_v1',
  accepts_resources: {
    dev_env: { type: 'container' }
  },
  nodes: [...]
}
```

This is validated at design time. Calling a workflow that requires `dev_env` without passing it is an error.

### Transfer via workflow_call

Ownership transfers explicitly:

```typescript
{
  kind: 'workflow_call',
  implementation: {
    workflow_def_id: 'react_coding_v1',
    pass_resources: ['dev_env']
  }
}
```

During the call:

- Parent workflow suspends
- Child workflow owns the container
- Child completes
- Ownership returns to parent
- Parent resumes

This mirrors Rust's borrowing—ownership is loaned for the duration of the call and automatically returns when scope ends.

### The Call Stack Invariant

Ownership follows execution. To determine who owns a container at any moment:

1. Find the workflow that declared the resource
2. Walk down the call stack to the currently executing workflow
3. Ownership is wherever execution is

If a node attempts to access a container it doesn't own, that's either a design-time error (missing `accepts_resources`) or a runtime error (called without `pass_resources`).

## Fan-Out and Parallel Branches

**Containers are never shared across parallel branches.**

When judges need to review code, they receive extracted data via `input_mapping`, not container access:

```
Node: run_tests (shell_exec, owns container)
  → output: { test_output, failed_files }

Node: extract_context (shell_exec, owns container)
  → output: { relevant_code: "...200 lines..." }

Transition: fan_out (spawn_count: 5)

Node: judge_code (llm_call, NO container access)
  → input: state.relevant_code, state.test_output
  → output: { verdict, rationale }

Transition: fan_in (wait_for: all, merge: append)

Node: apply_fix (shell_exec, owns container)
```

The container sits idle during fan-out. Ownership remains with the main execution line. Judges operate on strings in context—code snippets, diffs, test output—not live filesystem access.

This covers the vast majority of cases. Context windows are large (200k tokens). Extract what reviewers need; don't grant shell access.

## Hibernation and Resume

Workflows may pause for extended periods—human gates, approval flows, multi-day research pipelines. Keeping containers warm during long waits is expensive. Wonder uses **git-based hibernation**.

### The Model

Container state is git state. Before hibernation:

1. Ensure working directory is committed (enforced by workflow design)
2. Record current SHA in workflow context
3. Destroy container

On resume:

1. Provision fresh container
2. Clone repository, checkout SHA
3. Run package install (pnpm with warm store)
4. Continue execution

### Why Git-Based?

| Benefit                    | Explanation                                                                |
| -------------------------- | -------------------------------------------------------------------------- |
| Observability              | Every mutation is a commit. `git log` shows what happened.                 |
| Reproducibility            | `checkout <sha>` guarantees exact state. No snapshot corruption questions. |
| Debugging                  | Inspect any point in history by checking out that commit.                  |
| No new infrastructure      | Git is battle-tested. No custom snapshot/restore machinery.                |
| Branching mirrors workflow | Exploratory branches in the workflow = git branches. Natural fit.          |

### Enforcing Clean State

Workflows with human gates must include a commit node before the gate:

```
Node: implement_changes (shell_exec)
Node: commit_checkpoint (shell_exec)
  → command: "git add -A && git commit -m 'checkpoint: before review'"
Node: human_review (human_input)  // safe to hibernate here
```

This is a validation rule. Workflows that declare containers and include human gates must ensure clean git state before any gate. The "data loss risk" of git-based hibernation disappears by construction.

### Container State in Context

```typescript
state.container: {
  resource_id: 'dev_env',
  current_sha: 'a1b2c3d4e5f6...',
  branch: 'wonder/run-01HXYZ...',
  status: 'active' | 'hibernated'
}
```

Hibernation updates status and drops the container. Resume provisions a new container and restores from SHA.

## Cloudflare-Native Git Storage

Wonder is fully Cloudflare-native. Code storage should be too.

### Architecture

Git is content-addressed storage plus a commit graph:

- **Blobs** (file contents) keyed by SHA → R2
- **Trees** (directory structures) keyed by SHA → R2
- **Commits** (metadata + tree pointer + parents) → R2 or D1
- **Refs** (branches/tags → SHA) → D1

```
R2: git-objects/{sha}    — content-addressed blobs
D1: repositories         — repo metadata
D1: refs                 — branch/tag → SHA mappings
```

### Benefits Over GitHub

| Aspect          | External Git Host | Cloudflare-Native                |
| --------------- | ----------------- | -------------------------------- |
| Clone latency   | 5-60 seconds      | <1 second                        |
| Install latency | Network-bound     | pnpm store in R2, local symlinks |
| Observability   | External system   | Same D1 as everything else       |
| Auth            | OAuth tokens      | Wonder's existing auth           |
| Cost            | GitHub pricing    | R2 ($0.015/GB/month)             |

### Implementation Path

1. R2-backed object store using isomorphic-git (pure JS, pluggable backends)
2. D1 schema for refs and repository metadata
3. Container init that materializes from R2 instead of `git clone`
4. Shared pnpm store in R2 (warm installs across all containers)

### Lazy Materialization

Full checkout isn't required. Containers can materialize files on demand:

- Query tree object for directory listing
- Fetch blobs from R2 only when accessed
- A 10GB repo where the agent touches 50 files = fetch only those 50 blobs

## Shell Execution

Nodes execute shell commands via the `shell_exec` action:

```typescript
{
  id: 'run_tests',
  action: {
    kind: 'shell_exec',
    container: 'dev_env',
    command: 'pnpm test',
    timeout_ms: 300000
  },
  output_mapping: {
    'state.test_output': 'stdout',
    'state.test_exit_code': 'exit_code'
  }
}
```

The executor:

1. Validates the current workflow owns the referenced container
2. Dispatches command to container
3. Captures stdout, stderr, exit_code
4. Returns result to coordinator

## Summary

| Concept         | Design Decision                                   |
| --------------- | ------------------------------------------------- |
| Scope           | Workflow-level resource                           |
| Ownership       | Linear, single owner, explicit transfer           |
| Transfer        | `pass_resources` on `workflow_call`               |
| Parallel access | Not supported. Extract data to context.           |
| Hibernation     | Git-based. Commit before gates, rebuild from SHA. |
| Storage         | Cloudflare-native: R2 for objects, D1 for refs    |
| Execution       | `shell_exec` action with ownership validation     |

The model is simple: one owner, explicit handoff, git is the checkpoint mechanism. This covers deep sub-workflow composition, long-running workflows with human gates, and multi-step agent coding tasks—without locks, shared state, or complex capability systems.
