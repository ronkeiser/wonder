# Future SQL Capabilities for Wonder Workflows

## Overview

Beyond basic CRUD operations, Wonder workflows will need advanced SQL capabilities for execution management, state tracking, and observability.

## Required Capabilities

### 1. Transaction Management

- **Atomic workflow execution**: All-or-nothing commits for workflow state changes
- **Savepoints**: Rollback individual effects without aborting entire workflow
- **Nested transactions**: Support for sub-workflows and composed operations
- **Optimistic locking**: Concurrent execution control with version tracking

### 2. Query Builders

- **State queries**: Find workflows by status, context values, timestamps
- **Filtering**: JSON path queries on workflow context (`json_extract`, `json_path`)
- **Aggregations**: Statistics on execution duration, success rates, effect performance
- **Pattern matching**: Find workflows matching specific context patterns

### 3. Graph Operations

- **Dependency traversal**: Recursive CTEs for downstream/upstream effect chains
- **Topological sort**: Determine execution order from workflow DAG
- **Cycle detection**: Validate workflow graphs before execution
- **Path finding**: Trace execution paths through workflow nodes

### 4. Temporal Queries

- **Scheduling**: Find workflows ready for execution based on `scheduled_at`
- **Retry management**: Query failed effects eligible for retry based on backoff
- **Time-range filtering**: Analyze workflows within specific time windows
- **Expiration**: Clean up old completed/failed workflows

### 5. Context Operations

- **Merge/patch**: Apply partial updates to workflow context (`json_patch`)
- **Array operations**: Append results to context arrays (`json_insert`)
- **Conditional updates**: Merge context based on predicates
- **Type-safe access**: Validate context shape during queries

### 6. Event Sourcing & Audit

- **Event logging**: Insert workflow state changes as immutable events
- **State replay**: Reconstruct workflow state from event history
- **Causality tracking**: Link events across workflow boundaries
- **Temporal queries**: Query workflow state at any point in time

### 7. Concurrency Control

- **Worker claims**: Atomic claim of pending workflows for execution
- **Distributed locking**: Prevent duplicate workflow execution
- **Lease management**: Auto-release stale worker claims
- **Priority queues**: Execute high-priority workflows first

### 8. Maintenance & Cleanup

- **Archival**: Move completed workflows to cold storage
- **Cascade deletes**: Clean up array tables when parent deleted
- **Vacuum**: Reclaim space from deleted records
- **Index optimization**: Rebuild indexes for query performance

### 9. Full-Text Search (Future)

- **Context search**: SQLite FTS5 on workflow context JSON
- **Error search**: Find workflows with specific error messages
- **Metadata search**: Search across workflow metadata fields

### 10. Analytics & Reporting

- **Success rates**: Effect/workflow success percentages over time
- **Duration statistics**: P50, P95, P99 latencies per effect type
- **Resource usage**: Execution counts, context size growth
- **Error analysis**: Group errors by type, frequency, recency

## Implementation Strategy

### Phase 1: Query Builder (Basic)

- Generate SELECT with WHERE clauses from schema
- Type-safe parameter binding
- Support for JSON path queries

### Phase 2: Transaction Helpers

- Atomic workflow state updates
- Savepoint management
- Optimistic locking patterns

### Phase 3: Advanced Queries

- Recursive CTEs for graph operations
- Aggregation builders
- Temporal query helpers

### Phase 4: Maintenance Tools

- Migration system for schema evolution
- Index generator for common patterns
- Cleanup utilities

## Related Work

- **Drizzle ORM**: Type-safe query builder for SQLite/D1
- **Kysely**: SQL query builder with excellent TypeScript support
- **Prisma**: Schema-first ORM with migration system

## Open Questions

1. Should we build a custom query builder or integrate existing tools?
2. How to balance type safety with SQLite/D1 limitations?
3. Should context queries use JSON functions or denormalize to columns?
4. How to handle schema migrations for running workflows?

## Notes

- All capabilities must work with Cloudflare D1 limitations
- No stored procedures or triggers (not supported in D1)
- Prioritize prepared statements for security and performance
- Consider read replicas for analytics queries
