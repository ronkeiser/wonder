# Testing

## Stack

- **Vitest ~3.2.0** + `@cloudflare/vitest-pool-workers`
- Tests run inside Workers runtime (miniflare)
- D1, Workers AI, KV, R2 bindings work locally via wrangler config

## Structure

```
services/api/
├── vitest.config.ts
├── test/
│   ├── tsconfig.json       # Extends root, adds cloudflare:test types
│   ├── env.d.ts            # ProvidedEnv type declaration
│   ├── unit/               # Pure functions, no bindings
│   ├── integration/        # Single domain + real bindings
│   └── e2e/                # Full workflows across domains
```

## Config

```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
```

Bindings read from `wrangler.jsonc` automatically. Override via `miniflare` key if needed.

## Types

```typescript
// test/env.d.ts
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
```

```json
// test/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@cloudflare/vitest-pool-workers"]
  },
  "include": ["./**/*.ts", "../worker-configuration.d.ts"]
}
```

## Conventions

| Pattern        | Example                          |
| -------------- | -------------------------------- |
| File naming    | `*.test.ts`                      |
| Describe block | Domain or feature name           |
| Test isolation | Fresh DB per test via migrations |
| Fixtures       | `test/fixtures/` for seed data   |

## Running

```bash
pnpm test              # all tests
pnpm test:watch        # watch mode
pnpm test -- -t "name" # filter by name
```

## Bindings in Tests

```typescript
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';

// D1
const db = drizzle(env.DB);

// Workers AI
const result = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## Mocking

- Prefer real bindings (miniflare) over mocks
- Mock external HTTP via `vi.mock()` or MSW if needed
- Never mock D1—use test database
