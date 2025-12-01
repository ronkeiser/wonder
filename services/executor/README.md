# Wonder Executor

Queue consumer for workflow task execution.

## Responsibilities

- Consume tasks from `workflow-tasks` queue
- Execute actions (LLM calls, HTTP requests, MCP tools, etc.)
- Return results to coordinator
- Handle retries and failures
- Report execution metrics

## Development

```bash
# Start dev server
pnpm dev

# Deploy
pnpm deploy

# Test health endpoint
curl http://localhost:8787/health
```

## Queue Configuration

- **Queue name:** `workflow-tasks`
- **Batch size:** Up to 10 messages
- **Batch timeout:** 5 seconds
- **Max retries:** 3
- **Dead letter queue:** `workflow-tasks-dlq`

## Task Format

```typescript
interface WorkflowTask {
  workflow_run_id: string;
  token_id: string;
  node_id: string;
  action_kind: string;
  input_data: Record<string, unknown>;
  retry_count: number;
}
```

## Action Executors

Task execution is dispatched by `action_kind`:

- `llm_call` - Call LLM providers
- `mcp_tool` - Execute MCP tools
- `http_request` - Make HTTP requests
- `human_input` - Wait for human input
- `update_context` - Transform context data
- `write_artifact` - Persist artifacts
- `workflow_call` - Invoke sub-workflows
- `vector_search` - Search vector indexes
- `emit_metric` - Record metrics
