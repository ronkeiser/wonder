# @wonder/logger

Generic logger package for Wonder services. Writes to D1 with buffering and explicit flush.

## Features

- **D1-backed**: Persists logs to provided D1 database
- **Buffering**: Auto-flushes at buffer threshold (default 50 entries)
- **Child loggers**: Inherit and merge parent metadata
- **Levels**: debug (console only), info, warn, error, fatal
- **Fatal handling**: Immediate flush on fatal logs
- **Console output**: All levels write to console for `wrangler tail`

## Installation

```bash
pnpm add @wonder/logger
```

## Usage

```typescript
import { createLogger } from '@wonder/logger';

// Create logger with D1 binding
const logger = createLogger({ db: env.DB });

// Add metadata via child()
const requestLogger = logger.child({ requestId: 'req_123' });
const userLogger = requestLogger.child({ userId: 'user_456' });

// Log events (sync, buffers internally)
userLogger.info('request_started', { path: '/api/users' });
userLogger.warn('slow_query', { duration_ms: 500 });
userLogger.error('validation_failed', { field: 'email' });

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
