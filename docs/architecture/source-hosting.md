# Source Hosting

## Overview

Wonder is fully Cloudflare-native. Workflows, state, artifacts, and events all live within Cloudflare's infrastructure. Code is no exception.

Rather than depending on external git hosts (GitHub, GitLab), Wonder implements a native source hosting layer built on R2 and D1. This eliminates network round-trips during container provisioning, unifies observability, and keeps the entire system within a single trust boundary.

This document covers the infrastructure for hosting code repositories. For how repos relate to artifacts and projects, see [Project Resources](./project-resources.md).

## Why Not GitHub?

External git hosting introduces friction:

| Concern           | Impact                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Clone latency     | 5-60 seconds per container provision, depending on repo size and network                  |
| Auth complexity   | OAuth tokens, SSH keys, GitHub Apps—separate credential management                        |
| Rate limits       | GitHub API limits can throttle high-frequency workflows                                   |
| Observability gap | Commits live in an external system; correlating with workflow events requires integration |
| Cost              | GitHub pricing for private repos and API access                                           |
| Dependency        | Platform availability affects workflow reliability                                        |

For a system designed around rapid container spin-up and git-based hibernation, these costs compound. Every workflow resume pays the clone tax. Every agent checkpoint waits on network I/O.

## Git Fundamentals

Git is simpler than it appears. At its core:

**Objects** (content-addressed by SHA):

- **Blob**: Raw file contents
- **Tree**: Directory listing (name → blob/tree SHA mappings)
- **Commit**: Metadata + pointer to root tree + parent commit SHAs

**Refs** (mutable pointers):

- **Branches**: `refs/heads/main` → commit SHA
- **Tags**: `refs/tags/v1.0` → commit SHA

That's it. Everything else—merging, diffing, history traversal—is derived from these primitives.

## Architecture

### Storage Layout

```
R2
└── git-objects/
    └── {repo_id}/
        └── {sha}              — blob, tree, or commit object

D1
├── repositories               — repo metadata
├── refs                       — branch/tag → SHA mappings
└── commits                    — denormalized commit metadata (optional, for queries)
```

### Schema

```sql
-- Repository metadata
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,           -- ULID
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Refs (branches and tags)
CREATE TABLE refs (
  repo_id TEXT NOT NULL,
  name TEXT NOT NULL,            -- e.g., 'refs/heads/main'
  sha TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repo_id, name),
  FOREIGN KEY (repo_id) REFERENCES repositories(id)
);

-- Denormalized commit index (for queries, history traversal)
CREATE TABLE commits (
  repo_id TEXT NOT NULL,
  sha TEXT PRIMARY KEY,
  parent_shas TEXT,              -- JSON array of parent SHAs
  tree_sha TEXT NOT NULL,
  message TEXT,
  author TEXT,
  authored_at TEXT,
  committer TEXT,
  committed_at TEXT,
  FOREIGN KEY (repo_id) REFERENCES repositories(id)
);
```

### Object Storage

Git objects are stored in R2 as raw bytes, keyed by SHA:

```
R2: git-objects/{repo_id}/{sha}
```

Object type (blob/tree/commit) is encoded in the object header, following git's format. Alternatively, store as JSON for easier inspection:

```json
{
  "type": "tree",
  "entries": [
    { "mode": "100644", "name": "package.json", "sha": "a1b2c3..." },
    { "mode": "040000", "name": "src", "sha": "d4e5f6..." }
  ]
}
```

The tradeoff: raw git format enables compatibility with standard tools; JSON simplifies debugging and querying. For Wonder's purposes, JSON is likely preferable—we're not trying to be a general-purpose git host.

## Operations

### Write Path (Commit)

When an agent commits changes:

```
1. Hash each modified file → blob SHAs
2. Write new blobs to R2
3. Build tree object reflecting new directory state
4. Write tree to R2
5. Create commit object (tree SHA, parent SHA, message, author)
6. Write commit to R2
7. Update ref in D1 (atomic)
8. Optionally index commit in commits table
```

This happens via isomorphic-git running in the container, configured with a custom R2 backend.

### Read Path (Clone/Checkout)

When provisioning a container:

```
1. Query D1 for ref → SHA (e.g., refs/heads/main → a1b2c3d)
2. Fetch commit object from R2
3. Fetch tree object from R2 (root)
4. Recursively fetch subtrees as needed
5. Fetch blob objects and write to filesystem
```

Since R2 is co-located with Workers, latency is minimal. A typical project (few hundred files) materializes in under a second.

### Lazy Materialization

Full checkout isn't always necessary. For large repos:

1. Fetch commit and root tree only
2. Create filesystem stubs or use FUSE-like interception
3. Fetch blobs on first access
4. Cache fetched blobs locally in container

An agent working on a 10GB monorepo but touching 50 files only fetches those 50 blobs. The rest remain in R2 until needed.

## isomorphic-git Integration

[isomorphic-git](https://isomorphic-git.org/) is a pure JavaScript git implementation with pluggable storage backends. It runs in Node, browsers, and Cloudflare Workers.

### Custom Backend

```typescript
import * as git from 'isomorphic-git';
import { R2GitBackend } from '@wonder/git';

const backend = new R2GitBackend({
  bucket: env.R2_GIT_OBJECTS,
  repoId: 'repo_01HXYZ...',
});

await git.clone({
  fs: backend.fs,
  http: backend.http, // not used for R2 backend
  dir: '/workspace',
  url: 'wonder://repo_01HXYZ...',
  ref: 'main',
});
```

The backend implements:

- `readObject(sha)` → fetch from R2
- `writeObject(sha, data)` → put to R2
- `readRef(name)` → query D1
- `writeRef(name, sha)` → update D1

Standard git commands work normally. The agent runs `git add`, `git commit`, `git log`—all routed through the R2/D1 backend.

## Package Management

Code isn't enough. Node projects need `node_modules`. Fresh `npm install` on every container provision is slow.

### Shared pnpm Store

pnpm uses a content-addressed store. Packages are downloaded once, then hard-linked into projects. Wonder hosts this store in R2:

```
R2
└── pnpm-store/
    └── {package-hash}         — package tarballs
```

Container init:

```bash
# Mount or sync pnpm store from R2
pnpm config set store-dir /mnt/pnpm-store

# Install is now just linking, not downloading
pnpm install  # sub-10 seconds for most projects
```

For very fast installs, the pnpm store can be:

- Pre-warmed with common packages
- Layered in a base container image
- Lazily populated as packages are requested

### Lockfile as Cache Key

`pnpm-lock.yaml` fully specifies dependencies. Its hash can key a pre-built `node_modules` snapshot:

```
R2: node-modules-cache/{lockfile-hash}.tar
```

If the lockfile hasn't changed, restore from cache instead of running install. This brings "install" time to pure I/O—seconds for most projects.

## Repository Lifecycle

### Creation

Repositories are created within a project:

```typescript
// Via API or workflow
const repo = await createRepository({
  project_id: 'proj_01HXYZ...',
  name: 'my-service',
  initial_content: {
    'package.json': '{ "name": "my-service", ... }',
    'src/index.ts': '// entry point',
  },
});
```

Or imported from external source (one-time migration):

```typescript
await importRepository({
  project_id: 'proj_01HXYZ...',
  source: 'https://github.com/org/repo',
  name: 'my-service',
});
```

### Garbage Collection

Unreferenced objects accumulate as branches are deleted and history is rewritten. Periodic GC:

1. Mark all objects reachable from any ref
2. Delete unmarked objects from R2
3. Run on schedule or when storage exceeds threshold

For simplicity, retain all objects for some period (30 days) before GC eligibility. This allows recovery from accidental branch deletion.

## Deployment Integration

Code lives in Wonder. Deployment targets Cloudflare. The path is direct:

```
Workflow: deploy_service
  → Node: build (shell_exec)
      command: "pnpm build"
  → Node: deploy (cloudflare_deploy)
      artifact: "./dist"
      target: "production"
```

The `cloudflare_deploy` action uses Cloudflare's deployment APIs directly. No external CI/CD system needed.

### Environment Promotion

```
branch: main           → production
branch: staging        → staging environment
branch: wonder/run-*   → preview deployments
```

Human gate approvals can trigger promotion:

```
Node: deploy_preview
Node: human_review (approve for production?)
  → approved: Node: merge_to_main → Node: deploy_production
  → rejected: Node: cleanup_preview
```

## Security

### Access Control

Repository access follows project permissions. If you can access the project, you can access its repositories. No separate git credentials.

### Secrets

Secrets (API keys, tokens) are never committed. They're stored encrypted in D1 and injected as environment variables at container runtime:

```typescript
WorkflowDef {
  resources: {
    dev_env: {
      type: 'container',
      repo: 'repo_01HXYZ...',
      env_from_secrets: ['OPENAI_API_KEY', 'DATABASE_URL']
    }
  }
}
```

### Audit Trail

Every commit is tied to a workflow run. Every workflow run has an event log. Full audit trail from code change back to the workflow that produced it.

## Summary

| Component      | Implementation                       |
| -------------- | ------------------------------------ |
| Object storage | R2, content-addressed by SHA         |
| Refs           | D1, mutable pointers                 |
| Commit index   | D1, denormalized for queries         |
| Git operations | isomorphic-git with R2/D1 backend    |
| Package store  | R2, shared pnpm store                |
| Container init | Checkout from R2 + pnpm link         |
| Deployment     | Direct to Cloudflare, no external CI |

The result: sub-second container provisioning, unified observability, no external dependencies, and a complete code hosting solution native to Cloudflare.
