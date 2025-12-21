# Typed Action Implementations

## Problem

The SDK's `action()` builder accepts `implementation` as `{ [key: string]: unknown }`, losing all type safety for action-specific options.

Example: Mock actions have a typed `MockOptions` interface in the executor:

```typescript
// services/executor/src/utils/mock-generator.ts
export interface MockOptions {
  seed?: number;
  stringLength?: { min: number; max: number };
  arrayLength?: { min: number; max: number };  // Must be object, not number
  maxDepth?: number;
  delay?: { minMs: number; maxMs: number };
  stringMode?: 'random' | 'words';
}
```

But the SDK's action builder doesn't enforce this:

```typescript
// packages/sdk/src/builders/action.ts
export function action(config: {
  // ...
  kind: ActionKind;
  implementation: {
    [key: string]: unknown;  // No type checking
  };
})
```

This allows invalid configurations that fail silently at runtime:

```typescript
action({
  kind: 'mock',
  implementation: {
    schema: outputSchema,
    options: {
      arrayLength: 4,  // WRONG: should be { min: 4, max: 4 }
    },
  },
});
// No TypeScript error, but mock generates empty array at runtime
```

## Proposed Solution

Make `implementation` a discriminated union based on `kind`:

```typescript
import type { MockOptions } from '@wonder/executor';  // Or shared package

type MockImplementation = {
  schema: JSONSchema;
  options?: MockOptions;
};

type LLMImplementation = {
  promptSpecId?: string;
  promptSpec?: EmbeddedPromptSpec;
  modelProfileId?: string;
  modelProfile?: EmbeddedModelProfile;
};

type ContextImplementation = Record<string, never>;

// ... other action kinds

type ActionConfig =
  | { kind: 'mock'; implementation: MockImplementation }
  | { kind: 'llm'; implementation: LLMImplementation }
  | { kind: 'context'; implementation: ContextImplementation }
  | { kind: 'http'; implementation: HttpImplementation }
  // ... etc

export function action(config: ActionConfig): EmbeddedAction;
```

## Benefits

1. **Compile-time errors** for invalid configurations
2. **IDE autocomplete** for action-specific options
3. **Self-documenting** - developers see exactly what each action kind accepts

## Implementation Steps

1. Define typed implementation interfaces for each action kind
2. Export shared types (like `MockOptions`) from a common package or re-export from SDK
3. Update `action()` builder to use discriminated union
4. Update generated OpenAPI types if needed to match

## Scope

Action kinds requiring typed implementations:

| Kind | Key Options |
|------|-------------|
| `mock` | `schema`, `options: MockOptions` |
| `llm` | `promptSpecId`, `promptSpec`, `modelProfileId`, `modelProfile` |
| `http` | `url`, `method`, `headers`, etc. |
| `mcp` | `toolName`, `serverConfig` |
| `context` | (empty or passthrough config) |
| `human` | `prompt`, `timeout` |
| `artifact` | TBD |
| `workflow` | `workflowDefId` |
| `vector` | TBD |
| `metric` | TBD |

## Priority

Medium - This is a developer experience improvement that prevents silent runtime failures. The workaround is to carefully read executor source code for correct option types.
