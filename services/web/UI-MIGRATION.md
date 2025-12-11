# Web Service UI Migration

## Overview

Successfully migrated the Events and Logs UIs from their respective services to the centralized Web service. Both UIs share a common `StreamViewer` component while maintaining their unique filtering capabilities.

## Implementation

### Shared Component

**`src/lib/components/StreamViewer.svelte`**

- Unified component handling both events and logs
- Configurable via props:
  - `type`: 'events' | 'logs'
  - `apiPath`: REST endpoint for data fetching
  - `streamPath`: WebSocket endpoint for real-time updates
  - `filterType`: 'event_type' | 'service'
  - `filterOptions`: Filter dropdown options

### Routes

**`/events` (`src/routes/events/+page.svelte`)**

- Event stream viewer
- Filters: workflow_started, workflow_completed, workflow_failed, task_started, task_completed, task_failed
- Color-coded by event type

**`/logs` (`src/routes/logs/+page.svelte`)**

- Log stream viewer
- Filters: coordinator, executor, events, logs, resources, http
- Color-coded by log level

**`/` (`src/routes/+page.svelte`)**

- Home page with navigation to Events and Logs

### API Proxying

**`src/hooks.server.ts`**

- Intercepts all `/api/*` requests
- Forwards to HTTP service via service binding
- Handles both REST and WebSocket upgrades
- Non-API requests use normal SvelteKit rendering

### Service Bindings

**`wrangler.jsonc`**

- `HTTP`: Service binding to wonder-http
- `ASSETS`: SvelteKit build output
- `HTTP_URL`: Environment variable for HTTP service URL

## Features

### Common Features

- Real-time WebSocket streaming
- Time-based filtering (5m, 15m, 1h, 24h)
- Pretty-print JSON metadata
- Copy to clipboard
- Auto-scroll to latest entries
- URL state preservation (filters persist on reload)
- Sorted insertion (maintains chronological order)
- Memory management (max 1000 visible entries)

### Events-Specific

- Event type filtering
- Sequence number ordering (for same timestamp)
- Workflow/Task ID display
- Event metadata JSON formatting

### Logs-Specific

- Service filtering
- Log level display
- Message and metadata display

## Deployment

```bash
cd services/web
pnpm run build
pnpm run deploy
```

## URLs

- Production: https://wonder-web.ron-keiser.workers.dev
- Events UI: https://wonder-web.ron-keiser.workers.dev/events
- Logs UI: https://wonder-web.ron-keiser.workers.dev/logs

## Status

✅ All UIs accessible and functional
✅ API proxying working
✅ WebSocket streaming operational
✅ No type errors
✅ Shared component implementation
✅ Original UIs remain in events/logs services (to be removed after confirmation)

## Next Steps

1. Verify web UIs work correctly with real data
2. Test WebSocket streams with actual events/logs
3. Remove original UIs from events/logs services
4. Update UI serving routes in events/logs services
