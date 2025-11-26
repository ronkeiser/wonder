# @wonder/logger

Unified logger package for Wonder services with optional D1 persistence.

## Features

- **Flexible**: Use with D1 for persistence or console-only for Durable Objects
- **Buffering**: Auto-flushes at buffer threshold (default 50 entries) when using D1
- **Child loggers**: Inherit and merge parent metadata
- **Levels**: debug (console only), info, warn, error, fatal
- **Fatal handling**: Immediate flush on fatal logs (when using D1)
- **Console output**: All logs write to console for `wrangler tail`

## Installation

1. Add to your service's `package.json`:

   ```json
   {
     "dependencies": {
       "@wonder/logger": "workspace:*"
     }
   }
   ```

2. Add the logs table to your Drizzle schema (`src/infrastructure/db/schema.ts`):

   ```typescript
   export { logs } from '@wonder/logger/schema';
   ```

3. Generate and apply the migration:
   ```bash
   pnpm db:generate
   pnpm db:migrate:local
   ```

## Usage

### With D1 Persistence (Workers, API Handlers)

Use when you have D1 database access and want persistent, queryable logs:

```typescript
import { createLogger } from '@wonder/logger';

// Create D1-backed logger
const logger = createLogger({ db: env.DB });

// Add metadata via child()
const requestLogger = logger.child({ requestId: 'req_123' });
const userLogger = requestLogger.child({ userId: 'user_456' });

// Log events (sync, buffers internally)
userLogger.info('request_started', { path: '/api/users' });
userLogger.warn('slow_query', { duration_ms: 500 });
userLogger.error('validation_failed', { field: 'email' });

// Flush at request boundary
await logger.flush();
```

### Console-Only (Durable Objects)

Use in Durable Objects or any environment without D1 access:

```typescript
import { createLogger } from '@wonder/logger';

// Create console-only logger (no D1 persistence)
const logger = createLogger({ consoleOnly: true });

// Same interface as D1Logger
const childLogger = logger.child({ do_id: 'do_123', workflow_run_id: 'run_456' });

childLogger.info('workflow_started');
childLogger.error('coordination_failed', { reason: 'timeout' });

// flush() is a no-op for ConsoleLogger (always returns immediately)
await logger.flush();

// Flush at request/alarm boundary
await logger.flush();
```

## Levels

- `debug` — Console only, not persisted
- `info` — Normal operations
- `warn` — Recoverable issues
- `error` — Failures, handled gracefully
- `fatal` — Catastrophic, immediate flush

## Configuration

```typescript
createLogger({
  db: env.DB,
  bufferSize: 100, // Default: 50
  tableName: 'logs', // Default: 'logs'
});
```
