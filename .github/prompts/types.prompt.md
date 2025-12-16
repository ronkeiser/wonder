---
name: types
description: Generating types and performing typechecks
agent: agent
tools:
  [
    'vscode',
    'edit',
    'execute',
    'read',
    'search',
    'web',
    'copilot-container-tools/*',
    'agent',
    'todo',
  ]
---

We have a number of services that depend on each other's types for RPC. Some of these dependencies are circular.

We must therefore generate types for all services at once using a special process handled by a generator script. This script can be run from the root directory with `pnpm types`. This is THE ONLY way to generate types.

DO NOT attempt to remove `/dist` or generate types for a single service at a time.

Running `pnpm types` will BOTH generate worker configurations AND run typechecks against every service.

YOU MAY run `pnpm typecheck` from a specific service folder to ensure you have not introduced type error, and are encouraged to do so.

Running `pnpm types` is ONLY necessary if types imported by other services have changed, or RPC signatures have changed.
