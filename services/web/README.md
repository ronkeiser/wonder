# Wonder Web Service

SvelteKit-based web interface for the Wonder Platform.

## Features

- **Events UI** (`/events`): Real-time event streaming with filtering by event type
- **Logs UI** (`/logs`): Real-time log streaming with filtering by service
- **Shared Components**: Common StreamViewer component used by both UIs

## Architecture

The web service acts as a UI gateway:

- All API requests (`/api/*`) are proxied to the HTTP service via service binding
- WebSocket streams are forwarded to the HTTP service for real-time updates
- Static assets and UI rendering are handled by SvelteKit

## Development

```sh
# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Deploy to Cloudflare Workers
pnpm deploy
```

## Routes

- `/` - Home page with navigation
- `/events` - Events viewer UI
- `/logs` - Logs viewer UI

## Service Bindings

- `HTTP` - Wonder HTTP service for API and WebSocket forwarding
- `ASSETS` - SvelteKit build output for static assets
