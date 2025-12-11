# Wonder HTTP Service

HTTP-to-RPC bridge providing REST API and WebSocket gateway for the Wonder platform.

## Authentication

All API endpoints (except `/health`) require authentication via API key.

### Local Development

The API key is stored in `.dev.vars` (git-ignored). This file is automatically loaded by Wrangler during local development.

```bash
# The .dev.vars file should contain:
API_KEY=your-generated-key-here
```

### Production Deployment

For production, set the API key as a secret using Wrangler:

```bash
pnpm wrangler secret put API_KEY --config services/http/wrangler.jsonc
```

When prompted, paste the same API key value from your `.dev.vars` file.

### Making Authenticated Requests

Include the API key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key-here" https://your-worker.workers.dev/api/workspaces
```

## Endpoints

- `GET /health` - Health check (no auth required)
- `/api/*` - All API endpoints (auth required)
  - `/api/workspaces` - Workspace management
  - `/api/projects` - Project management
  - `/api/actions` - Action management
  - `/api/prompt-specs` - Prompt specification management
  - `/api/model-profiles` - Model profile management
  - `/api/workflow-defs` - Workflow definition management
  - `/api/workflows` - Workflow management
  - `/api/workflow-runs` - Workflow run management
  - `/api/events` - Event streaming
  - `/api/logs` - Log streaming

## Development

```bash
# Run locally
pnpm --filter wonder-http dev

# Deploy
pnpm --filter wonder-http deploy
```
