# @wonder/sdk

Type-safe client SDK for the Wonder workflow orchestration platform using `openapi-fetch`.

## Installation

```bash
pnpm add @wonder/sdk
```

## Usage

```typescript
import { createClient } from '@wonder/sdk';

const client = createClient('https://wonder-http.ron-keiser.workers.dev');

// Create a workspace
const { data, error } = await client.POST('/api/workspaces', {
  body: {
    name: 'My Workspace',
    description: 'A workspace for AI workflows',
  },
});

// Get a project
const { data: project } = await client.GET('/api/projects/{id}', {
  params: { path: { id: 'project-id' } },
});

// Start a workflow
const { data: result } = await client.POST('/api/workflows/{id}/start', {
  params: { path: { id: 'workflow-id' } },
  body: { input: 'Hello, world!' },
});

// List model profiles with filters
const { data: profiles } = await client.GET('/api/model-profiles', {
  params: { query: { provider: 'anthropic' } },
});
```

## Type Safety

The SDK uses `openapi-fetch` which provides:

- Full TypeScript autocomplete for all API paths
- Type-safe request bodies and parameters
- Type-safe response types
- Automatic type inference from OpenAPI spec

No generated code needed - just types!

## Code Generation

Generate TypeScript types from the OpenAPI specification:

```bash
pnpm generate
```

This fetches the OpenAPI spec and generates types to `src/generated/schema.d.ts`.

### Environment Variables

- `API_URL` - Base URL for the Wonder API (default: `https://wonder-http.ron-keiser.workers.dev`)

## API Response Format

All methods return:

```typescript
{
  data: T | undefined,
  error: Error | undefined,
  response: Response
}
```

Example error handling:

```typescript
const { data, error } = await client.POST('/api/workspaces', {
  body: { name: 'Test' },
});

if (error) {
  console.error('Failed:', error);
  return;
}

console.log('Created:', data);
```

## Development

### Regenerate Types

After HTTP service OpenAPI spec changes:

```bash
pnpm generate
```

TypeScript will automatically catch any breaking changes.

## License

MIT
