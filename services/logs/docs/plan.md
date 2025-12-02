# Logs Service Implementation Plan

## Schema Design

### Final Schema Decisions

**Columns:**

- `id` - Primary key
- `timestamp` - Unix timestamp (milliseconds)
- `level` - error, warn, info, debug
- `service` - Which service emitted the log (coordinator, executor, resources, http)
- `environment` - production, staging, development
- `event_type` - Structured event identifier (e.g., 'db_query_slow', 'rpc_call_failed')
- `message` - Human-readable log message
- `source_location` - File:line (e.g., 'coordinator.ts:142') - **injected at build time**
- `trace_id` - Distributed tracing across service boundaries
- `request_id` - Correlate all logs for a single HTTP request
- `workspace_id` - Tenant filtering
- `project_id` - Tenant filtering
- `user_id` - Tenant filtering
- `version` - Deployment tracking (git sha or version string)
- `instance_id` - Durable Object instance identifier
- `metadata` - JSON blob for additional context

**Key Decisions:**

1. **NO `function_name` column** - Dropped in favor of `source_location`

   - Reasoning: Function names require expensive runtime introspection (Error stack parsing) or manual maintenance
   - `source_location` provides file:line which is more precise and can be injected at build time with zero runtime cost
   - When debugging, knowing the exact line is more valuable than just the function name
   - Stack traces already contain function names when errors occur

2. **`source_location` via build-time injection** - NOT runtime introspection

   - Webpack/Vite plugin can inject `__filename:__line__` during compilation
   - Zero runtime performance cost
   - Always accurate (no stack parsing fragility)
   - Implementation: Transform `env.LOGS.write({...})` → `env.LOGS.write({..., source_location: 'file.ts:142'})`

3. **Indexed columns** - Optimized for common query patterns:
   - `timestamp` - Time-range queries
   - `level` - Filter by severity
   - `service` - Per-service logs
   - `environment` - Production vs staging
   - `event_type` - Structured event queries
   - `trace_id` - Distributed tracing
   - `request_id` - Request correlation
   - `workspace_id` - Tenant isolation

## Build-Time Source Location Injection

### Approach

Use a build plugin (Vite/esbuild) to transform log calls:

```typescript
// Source code:
env.LOGS.write({ level: 'info', message: 'Task started' });

// After build transformation:
env.LOGS.write({
  level: 'info',
  message: 'Task started',
  source_location: 'executor.ts:142',
});
```

### Implementation Options

1. **Vite Plugin** (for local development)
2. **esbuild Plugin** (for wrangler build)
3. **TypeScript Transformer** (compile-time)

Preference: esbuild plugin since wrangler uses esbuild internally.

## Next Steps

1. Finalize any remaining schema questions
2. Create `services/logs/src/schema.ts` with Drizzle schema
3. Implement `services/logs/src/index.ts` WorkerEntrypoint with RPC methods
4. Implement build-time source location injection plugin
5. Configure wrangler bindings for all services
6. Migrate services to use `env.LOGS.write()`
7. Delete `packages/logger`
