---
name: new-service
description: Scaffold a new Cloudflare Worker service for the wonder-refactor project
argument-hint: <service-name> - Name of the new service to create
agent: agent
tools:
  - search/codebase
  - search/changes
---

# Create a New Service

You are helping create a new Cloudflare Worker service in this monorepo.

## Context

This project uses:

- **pnpm** workspaces for package management
- **TypeScript** for all code
- **Cloudflare Workers** for services (see `wrangler.jsonc` files)
- **Drizzle ORM** for database access where needed
- **Vitest** for testing

## Reference Files

Use these existing services as templates:

- [Coordinator Service](../../services/coordinator/) - Full example with database
- [Events Service](../../services/events/) - Simpler service example

## Instructions

1. Create a new folder under `services/${input:serviceName}`
2. Add required files:
   - `package.json` with appropriate dependencies
   - `tsconfig.json` extending the root config
   - `wrangler.jsonc` for Cloudflare configuration
   - `src/index.ts` as the main entry point
   - `vitest.config.ts` for testing
   - `README.md` documenting the service

3. Register the new service in the root `pnpm-workspace.yaml` if not already covered by glob

4. Ensure the service follows project conventions:
   - Use consistent naming patterns
   - Include proper TypeScript types
   - Add basic error handling
   - Set up health check endpoint at `/health`

## Output

After scaffolding, run `pnpm install` to link the new package.
