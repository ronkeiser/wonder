# @wonder/env

Build tooling for Wonder's Cloudflare Worker services.

## Usage

From the workspace root:

```bash
pnpm types
```

Or directly:

```bash
pnpm --filter @wonder/env run build-services
```

### Options

- `--skip-check` - Skip the final type check step (useful for CI when you only need declarations)

## What it does

1. **Generates wrangler types** - Runs `wrangler types` for all services with their cross-service dependencies
2. **Patches worker-configuration.d.ts** - Rewrites imports from `src` to `dist` so TypeScript resolves to declaration files
3. **Builds TypeScript declarations** - Generates `.d.ts` files for all services in parallel
4. **Runs final type check** - Validates all services type-check correctly with the generated declarations

## Why

Cloudflare Worker services with RPC bindings have a chicken-and-egg problem:

- `wrangler types` generates `worker-configuration.d.ts` with imports pointing to source files
- TypeScript needs declaration files to resolve cross-service types
- But declarations can't be built until types resolve

This script solves the bootstrap problem by:

1. Using `--skipLibCheck` during declaration generation to emit despite cross-service errors
2. Patching the generated imports to point to `dist/` instead of `src/`
3. Running a clean type check after all declarations exist
