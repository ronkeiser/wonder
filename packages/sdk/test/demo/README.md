# Wonder SDK Demo

Examples demonstrating the Wonder SDK's ergonomic API.

## Running the Demos

```bash
# Set your API URL (optional, defaults to production)
export API_URL=https://wonder-http.ron-keiser.workers.dev

# Run basic usage demo
pnpm exec tsx demo/basic-usage.ts

# Run type-safe demo
pnpm exec tsx demo/type-safety.ts
```

## Available Demos

### `basic-usage.ts`

Demonstrates the core SDK patterns:

- Collection methods: `list()`, `create()`
- Instance access: `resource(id)`
- Instance methods: `get()`, `patch()`, `delete()`
- Action methods: `workflows(id).start()`
- All API resources

### `type-safety.ts`

Shows TypeScript type safety features:

- Auto-completion for all methods
- Request/response types from OpenAPI spec
- Type-safe schemas with `SchemaType`
- Compile-time validation

## Key Features

### Ergonomic API

```typescript
// Collections
await wonder.workspaces.list();
await wonder.workspaces.create({ name: 'New' });

// Instances
await wonder.workspaces('ws-123').get();
await wonder.workspaces('ws-123').patch({ name: 'Updated' });
await wonder.workspaces('ws-123').delete();

// Actions
await wonder.workflows('wf-123').start({ force: true });

// Resources with hyphens
await wonder['model-profiles'].list();
```

### Type Safety

```typescript
// Request bodies are typed
const workspace = await wonder.workspaces.create({
  name: 'Test', // ✓ valid
  invalid: 'field', // ✗ type error
});

// Response types are inferred
const ws = await wonder.workspaces('id').get();
console.log(ws.name); // ✓ typed as string
console.log(ws.invalid); // ✗ type error
```

### Generated from OpenAPI

The entire SDK is auto-generated from the OpenAPI specification:

- Paths map to nested method chains
- Types match your API exactly
- Regenerate when API changes
- Zero manual maintenance
