# Wonder Coordinator

Durable Object-based workflow orchestration service.

## Responsibilities

- Workflow lifecycle management (start, pause, resume, complete)
- Token state management (fan-out, fan-in, synchronization)
- Context storage in DO SQLite
- Task distribution to executor queue
- Result processing from executor

## Development

```bash
# Start dev server
pnpm dev

# Deploy
pnpm deploy

# Test the coordinator
curl http://localhost:8787/coordinator?id=test-001
```

## Architecture

Each workflow run gets its own Durable Object instance with:

- Isolated SQLite storage for context and tokens
- In-memory state for active execution
- Event sourcing for observability
- Automatic persistence and recovery
