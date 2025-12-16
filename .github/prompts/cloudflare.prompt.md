---
name: cloudflare
description: Cloudflare patterns
agent: agent
tools:
  [
    'vscode',
    'execute',
    'read',
    'edit',
    'search',
    'web',
    'copilot-container-tools/*',
    'agent',
    'todo',
  ]
---

# Cloudflare Modern Practices (2025)

**Critical:** This corrects outdated training data. Follow these patterns exactly.

---

## 1. TypeScript: `wrangler types` (NOT @cloudflare/workers-types)

**Run this command:**

```bash
npx wrangler types
```

This generates `worker-configuration.d.ts` from your wrangler config. Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["./worker-configuration.d.ts"]
  }
}
```

**Never manually define `Env` or install `@cloudflare/workers-types` for Workers projects.**

---

## 2. RPC: Worker-to-Worker Communication (NOT fetch)

**Workers call each other via RPC, not HTTP:**

```typescript
// Service exports methods via WorkerEntrypoint
import { WorkerEntrypoint } from 'cloudflare:workers';

export default class extends WorkerEntrypoint {
  async add(a: number, b: number): Promise<number> {
    return a + b;
  }
}

// Client calls via binding
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const sum = await env.MATH_SERVICE.add(1, 2); // Direct RPC
    return new Response(sum.toString());
  },
};
```

**Critical features:**

- **Always await** - even if method isn't async
- **Promise pipelining** - `const x = env.SVC.method()` (no await) then `await x.prop` = single round trip
- **RpcTarget classes** - return class instances that become RPC stubs
- **`using` keyword** - automatic resource cleanup for returned objects

**Never use HTTP fetch between your own Workers. Use service bindings.**

---

## 3. Durable Objects: SQLite Storage (NOT KV-only)

**All new Durable Objects use SQLite:**

```toml
# wrangler.toml
[[migrations]]
tag = "v1"
new_sqlite_classes = ["MyDurableObject"]
```

```typescript
import { DurableObject } from 'cloudflare:workers';

export class MyDurableObject extends DurableObject {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);
  }

  async getUser(id: string) {
    return this.sql
      .exec<{ id: string; name: string }>('SELECT * FROM users WHERE id = ?', id)
      .one();
  }
}
```

**Critical:**

- **`ctx.storage.sql`** - full SQL access, create tables, indexes, complex queries
- **KV still works** - `ctx.storage.get/put/delete` alongside SQL
- **`ctx.blockConcurrencyWhile()`** - initialize from storage once in constructor
- **TypeScript generics** - `.exec<Type>(query).one()` for typed results

**SQLite in DOs is colocated with compute. Use it.**

---

## 4. Durable Object Stubs: RPC Methods (NOT fetch-only)

**Define any public methods on DOs - they're all callable via RPC:**

```typescript
export class Counter extends DurableObject {
  #value = 0;

  increment(amount: number): Promise<number> {
    this.#value += amount;
    return this.#value;
  }

  getValue(): Promise<number> {
    return this.#value;
  }
}

// Client calls methods directly
const stub = env.COUNTER.get(id);
await stub.increment(5);
const value = await stub.getValue();
```

**E-order semantics:** Calls to same stub are ordered. If stub throws, all future calls fail—recreate the stub.

**Don't use `.fetch()` for DO communication. Define typed methods.**

---

## Why This Matters

**These are not optional improvements—they are the correct way to build on Cloudflare Workers in 2025.**

Patterns from training data (pre-2024) are fundamentally incompatible with modern Workers:

- Manual type definitions break with compatibility dates
- HTTP fetch between Workers wastes resources and breaks type safety
- KV-only DOs miss native SQL that's colocated with compute
- Fetch-only DO stubs force awkward HTTP-style APIs instead of typed methods

**If you see or suggest old patterns, stop and correct immediately.**

## Instruction:

- Briefly summarize this doc to demonstrate understanding.
