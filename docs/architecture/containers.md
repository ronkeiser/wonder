# Containers in Wonder

## Overview

Wonder workflows and agents execute shell commands in containers—editing code, running tests, type-checking, deploying. Containers are **ephemeral compute**. The git branch is the state.

This document describes the execution model, container lifecycle, and integration with Wonder's git-based storage.

For how containers interact with repos and artifacts, see [Project Resources](./project-resources.md). For the underlying git storage infrastructure, see [Source Hosting](./source-hosting.md).

## Core Model

**Containers are stateless compute. Git branches are state.**

When a workflow or agent needs to run a shell command:

1. System provisions a ContainerHost for the caller (run_id or conv_id)
2. Container checks out the caller's branch
3. Command executes
4. Changes commit to the branch
5. Container stays warm via `sleepAfter`, destroyed after idle timeout

Each caller gets its own ContainerHost. The container identity matches the caller identity.

### Why This Model

| Concern | Solution |
| ------- | -------- |
| Concurrent access | Git branches provide isolation. Multiple workflows/agents can operate on the same repo simultaneously—each on its own branch. |
| State persistence | Branch is the checkpoint. No container snapshots needed. |
| Long-running work | Commits accumulate on the branch. Container can be destroyed and reprovisioned at any point. |
| Hibernation | Trivial—there's nothing to hibernate. State is the branch. Resume = checkout branch. |

## Branch Isolation

Each workflow run or agent conversation gets its own branch:

```
main
├── wonder/run-01HABC...        # workflow run A
├── wonder/run-01HDEF...        # workflow run B (concurrent)
├── wonder/conv-01HGHI...       # agent conversation
└── wonder/conv-01HJKL...       # another agent conversation (same project)
```

Multiple callers can target the same branch if needed (e.g., sub-workflows continuing parent's work). Git handles conflicts via normal merge/rebase semantics.

## Shell Execution

Shell commands specify the execution context directly:

```typescript
{
  kind: 'shell',
  operation: 'exec',
  implementation: {
    command_template: 'pnpm test {{pattern}}',
    repo_id: '01HXYZ...',
    branch: '{{context.branch}}'  // from workflow/agent context
  }
}
```

The executor:

1. Receives shell action with caller context (run_id or conv_id, repo_id, branch)
2. Gets or creates ContainerHost for that caller
3. Ensures container is checked out to the correct branch
4. Executes command
5. Captures stdout, stderr, exit_code
6. Returns result

### Library Tasks

Common operations are wrapped as library tasks:

```typescript
// Git operations
task: 'lib_git_commit' → { message: string, files?: string[] }
task: 'lib_git_push' → { remote?: string, branch?: string }
task: 'lib_git_status' → {}

// Testing and build
task: 'lib_run_tests' → { pattern?: string, framework?: string }
task: 'lib_run_lint' → { fix?: boolean }
task: 'lib_run_build' → { target?: string }

// File operations
task: 'lib_read_file' → { path: string }
task: 'lib_write_file' → { path: string, content: string }
task: 'lib_list_files' → { pattern?: string }
```

These tasks can be used directly by workflow nodes, or wrapped as Tools for LLM-driven execution. See [Agents](./agent.md#tools) for how Tools bind to Tasks.

### Custom Commands

For custom shell commands, use the shell action directly:

```bash
# Exploration
find src -name "*.ts" | head -20
grep -r "pattern" src/

# Build steps
pnpm run custom-script --arg
```

### Timeouts

Long-running commands need appropriate timeouts:

```typescript
{
  kind: 'shell',
  operation: 'exec',
  implementation: {
    command_template: 'pnpm test',
    repo_id: '01HXYZ...',
    branch: '{{context.branch}}'
  },
  execution: {
    timeout_ms: 300000  // 5 minutes for test suite
  }
}
```

Timeout triggers task failure, handled via workflow transitions or agent error handling.

## Container Lifecycle

Each caller (workflow run or conversation) gets its own ContainerHost. Container identity = caller identity.

### Per-Caller Model

ContainerHost is keyed by caller ID:
- Workflow run: `container:run:{run_id}`
- Conversation: `container:conv:{conv_id}`

This maps directly to Cloudflare's 1:1 Container-to-DO relationship. No pool abstraction needed.

### Provisioning

When a shell command arrives for a caller:

1. Get ContainerHost by caller ID (creates if doesn't exist)
2. Container provisions on first use:
   - Clone repo from R2 (sub-second, cached)
   - Checkout branch
   - Install dependencies (pnpm store in R2, cache hit likely)
3. Subsequent commands reuse the warm container

### Idle Timeout

Containers use Cloudflare's `sleepAfter` for idle timeout. Benefits:

- Faster successive operations (no provision overhead)
- In-memory caches preserved (TS compiler, pnpm cache)
- Automatic cleanup—Cloudflare handles destruction

After idle timeout, the container is destroyed. The branch remains. Next shell command provisions a new container, checks out the branch, and continues.

## Workflow Integration

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
2. Store branch in workflow context
3. All shell operations use this branch

At workflow completion (success):

1. Optionally merge working branch to target
2. Working branch retained for history

### Sub-Workflows

Sub-workflows can share the parent's branch or create their own:

```typescript
// Share parent branch (continue work in progress)
{
  kind: 'workflow',
  implementation: {
    workflow_def_id: 'coding_task_v1',
    inherit_branch: true  // uses parent's branch
  }
}

// Create new branch (isolated work)
{
  kind: 'workflow',
  implementation: {
    workflow_def_id: 'experimental_v1',
    inherit_branch: false  // creates wonder/run-{child_run_id}
  }
}
```

## Agent Integration

Agent conversations get a branch at conversation start:

```
Conversation created
  → Branch: wonder/conv-{conversation_id} from project default branch
  → Stored in conversation context
```

All tool calls that invoke shell operations use this branch. The agent doesn't manage container lifecycle—it just specifies commands, and the system handles execution.

Multiple conversations can operate on the same project concurrently. Each has its own branch. Merging completed work is a user decision, not automatic.

## Fan-Out and Parallel Execution

When workflows fan out, parallel branches don't get shell access by default. Extract data to context before fan-out:

```
Node: run_tests (shell action)
  → output: { test_output, failed_files }

Node: extract_context (shell action)
  → output: { relevant_code: "...200 lines..." }

Transition: fan_out (spawn_count: 5)

Node: judge_code (llm action, no shell)
  → input: state.relevant_code, state.test_output
  → output: { verdict, rationale }

Transition: fan_in

Node: apply_fix (shell action)
```

This keeps the model simple: one branch per execution line, no concurrent writes to same branch.

If parallel shell execution is truly needed, each fan-out branch can create its own sub-branch.

## Cloudflare Containers Integration

Wonder containers are built on Cloudflare's Container platform.

**1:1 DO Mapping:** Each ContainerHost manages exactly one container. Container identity = DO identity = caller ID. This is Cloudflare's native model—no pooling layer needed.

**Provisioning:** Container starts with environment variables pointing to repo. Init script:
- Clones from R2-backed git
- Checks out the specified branch
- Installs dependencies via pnpm (store mounted from R2)
- Starts shell server

**Shell Access:** Container runs HTTP server accepting commands. Executor calls `containerDO.exec(command, timeout)` on the caller's ContainerHost.

**Lifecycle:** ContainerHost uses `sleepAfter` for idle timeout. Cloudflare handles hibernation and cleanup automatically.

## Summary

| Concept | Design Decision |
| ------- | --------------- |
| State | Git branch, not container filesystem |
| Identity | ContainerHost per caller (run_id or conv_id) |
| Isolation | Branch per workflow run or conversation |
| Lifecycle | `sleepAfter` idle timeout, Cloudflare manages cleanup |
| Provisioning | Sub-second via R2 cache |
| Shell execution | Executor calls caller's ContainerHost directly |

The model is simple: git branch is state, container is compute. Each caller gets its own ContainerHost. This supports concurrent workflows, concurrent agent conversations, long-running work with human gates, and deep sub-workflow composition—with clean 1:1 mapping to Cloudflare's container model.
