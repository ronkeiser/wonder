# Wonder Workflow DSL

A type-safe domain-specific language for defining workflows with compile-time validation.

## Problem

Workflows are defined using string-based JSONPath expressions for input/output mappings:

```typescript
node({
  ref: 'process_node',
  input_mapping: {
    name: '$.input.name', // String - no type checking
    count: '$.input.badField', // Typo? Won't know until runtime
  },
  output_mapping: {
    greeting: '$.response.greeting', // Does this path exist? 🤷
  },
});
```

Errors are only discovered at runtime:

- Typos in field names
- References to non-existent nodes
- Mismatched types between producer and consumer
- Invalid JSONPath expressions

## Solution

A fluent builder DSL that leverages TypeScript's type inference to catch errors at compile time while emitting the same `CreateWorkflowDef` JSON.

## Design

### Core Principles

1. **Type-safe references** - `ctx.input.name` instead of `'$.input.name'`
2. **Progressive disclosure** - Context grows as nodes are defined
3. **Same output** - `.build()` returns standard `CreateWorkflowDef`
4. **Optional adoption** - Can coexist with string-based builders

### Context Type Evolution

The context type grows as nodes are added:

```typescript
// After .input({ name: z.string() })
ctx.input.name; // ✓ string

// After .node('greet', { output: { greeting: z.string() } })
ctx.input.name; // ✓ string
ctx.output.greet.greeting; // ✓ string

// After .node('process', { output: { count: z.number() } })
ctx.input.name; // ✓ string
ctx.output.greet.greeting; // ✓ string
ctx.output.process.count; // ✓ number
```

## API

### Basic Workflow

```typescript
import { wonder } from '@wonder/sdk';
import { z } from 'zod';

const workflow = wonder
  .workflow('greeting-workflow')
  .input({
    name: z.string(),
    language: z.enum(['en', 'es', 'fr']),
  })
  .output({
    greeting: z.string(),
  })

  .node('greet', (ctx) => ({
    task: greetTaskId,
    version: 1,
    input: {
      userName: ctx.input.name, // ✓ Autocomplete works
      lang: ctx.input.language,
      bad: ctx.input.foo, // ✗ TYPE ERROR: 'foo' doesn't exist
    },
    output: {
      greeting: z.string(),
    },
  }))

  .returns((ctx) => ({
    greeting: ctx.output.greet.greeting,
  }))

  .build();
```

### Multi-Node with Dependencies

```typescript
const pipeline = wonder
  .workflow('data-pipeline')
  .input({
    items: z.array(z.string()),
    threshold: z.number(),
  })
  .state({
    processedCount: z.number(),
  })
  .output({
    results: z.array(z.object({ id: z.string(), score: z.number() })),
    summary: z.string(),
  })

  .node('validate', (ctx) => ({
    task: validateTaskId,
    input: {
      data: ctx.input.items,
      min: ctx.input.threshold,
    },
    output: {
      validItems: z.array(z.string()),
      invalidCount: z.number(),
    },
  }))

  .node('process', (ctx) => ({
    task: processTaskId,
    input: {
      // Reference previous node's output - type safe!
      items: ctx.output.validate.validItems,
      threshold: ctx.input.threshold,
    },
    output: {
      results: z.array(z.object({ id: z.string(), score: z.number() })),
    },
  }))

  .node('summarize', (ctx) => ({
    task: summarizeTaskId,
    input: {
      results: ctx.output.process.results,
    },
    output: {
      summary: z.string(),
    },
  }))

  .transition('validate', 'process')
  .transition('process', 'summarize')

  .returns((ctx) => ({
    results: ctx.output.process.results,
    summary: ctx.output.summarize.summary,
  }))

  .build();
```

### Conditional Transitions

```typescript
const router = wonder
  .workflow('smart-router')
  .input({
    query: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  })
  .output({
    response: z.string(),
    handler: z.string(),
  })

  .node('classify', (ctx) => ({
    task: classifyTaskId,
    input: { query: ctx.input.query },
    output: {
      category: z.enum(['billing', 'technical', 'general']),
      confidence: z.number(),
    },
  }))

  .node('billing_handler', (ctx) => ({
    task: billingTaskId,
    input: {
      query: ctx.input.query,
      category: ctx.output.classify.category,
    },
    output: { response: z.string() },
  }))

  .node('technical_handler', (ctx) => ({
    task: technicalTaskId,
    input: { query: ctx.input.query },
    output: { response: z.string() },
  }))

  .node('general_handler', (ctx) => ({
    task: generalTaskId,
    input: { query: ctx.input.query },
    output: { response: z.string() },
  }))

  // Conditional transitions with type-safe conditions
  .transition('classify', 'billing_handler', {
    when: (ctx) => ctx.output.classify.category === 'billing',
  })
  .transition('classify', 'technical_handler', {
    when: (ctx) => ctx.output.classify.category === 'technical',
  })
  .transition('classify', 'general_handler') // Default fallback

  .returns((ctx) => ({
    response:
      ctx.output.billing_handler?.response ??
      ctx.output.technical_handler?.response ??
      ctx.output.general_handler?.response,
    handler: ctx.lastNode,
  }))

  .build();
```

### Fan-Out / Fan-In

```typescript
const parallel = wonder
  .workflow('idea-generator')
  .input({
    topic: z.string(),
    judgeCount: z.number(),
  })
  .output({
    bestIdea: z.string(),
    scores: z.array(z.number()),
  })

  .node('generate', (ctx) => ({
    task: generateTaskId,
    input: { topic: ctx.input.topic },
    output: { ideas: z.array(z.string()) },
  }))

  // Fan-out: spawn N parallel executions
  .node('judge', (ctx) => ({
    task: judgeTaskId,
    fanOut: ctx.input.judgeCount,
    input: {
      ideas: ctx.output.generate.ideas,
      judgeIndex: ctx.tokenIndex, // 0, 1, 2... per instance
    },
    output: {
      scores: z.array(z.number()),
      topPick: z.string(),
    },
  }))

  // Fan-in: merge parallel results
  .node('aggregate', (ctx) => ({
    task: aggregateTaskId,
    fanIn: 'judge',
    input: {
      allScores: ctx.merged.judge.scores, // Array of all outputs
      allPicks: ctx.merged.judge.topPick,
    },
    output: {
      bestIdea: z.string(),
      finalScores: z.array(z.number()),
    },
  }))

  .transition('generate', 'judge')
  .transition('judge', 'aggregate')

  .returns((ctx) => ({
    bestIdea: ctx.output.aggregate.bestIdea,
    scores: ctx.output.aggregate.finalScores,
  }))

  .build();
```

## Implementation Strategy

### Phase 1: Core Builder

1. `WorkflowBuilder` class with generic type parameter for context
2. `.input()`, `.output()`, `.state()` methods that extend context type
3. `.node()` method that adds node output to context type
4. `.build()` that emits `CreateWorkflowDef`

### Phase 2: Transitions

1. `.transition()` with type-safe node ref validation
2. Conditional transitions with `when` predicate
3. Priority ordering

### Phase 3: Fan-Out/Fan-In

1. `fanOut` configuration in node definition
2. `fanIn` configuration referencing source node
3. `ctx.merged` accessor for aggregated outputs
4. `ctx.tokenIndex` for parallel instance identification

### Phase 4: Task DSL

Extend to task definitions with step-level type safety:

```typescript
const task = wonder
  .task('write-verified')
  .input({ path: z.string(), content: z.string() })
  .output({ success: z.boolean(), hash: z.string() })

  .step('write', (ctx) => ({
    action: writeActionId,
    input: {
      filePath: ctx.input.path,
      data: ctx.input.content,
    },
    output: { bytesWritten: z.number() },
  }))

  .step('verify', (ctx) => ({
    action: readActionId,
    input: { filePath: ctx.input.path },
    output: { content: z.string(), hash: z.string() },
  }))

  .returns((ctx) => ({
    success: ctx.state.write.bytesWritten > 0,
    hash: ctx.state.verify.hash,
  }))

  .build();
```

## Type Implementation Sketch

```typescript
// Context type that grows with each node
type WorkflowContext<
  TInput extends ZodRawShape,
  TState extends ZodRawShape,
  TOutput extends ZodRawShape,
  TNodes extends Record<string, ZodRawShape>,
> = {
  input: z.infer<z.ZodObject<TInput>>;
  state: z.infer<z.ZodObject<TState>>;
  output: { [K in keyof TNodes]: z.infer<z.ZodObject<TNodes[K]>> };
};

// Builder with evolving generic
class WorkflowBuilder<
  TInput extends ZodRawShape = {},
  TState extends ZodRawShape = {},
  TOutput extends ZodRawShape = {},
  TNodes extends Record<string, ZodRawShape> = {},
> {
  input<T extends ZodRawShape>(schema: T): WorkflowBuilder<T, TState, TOutput, TNodes>;

  state<T extends ZodRawShape>(schema: T): WorkflowBuilder<TInput, T, TOutput, TNodes>;

  output<T extends ZodRawShape>(schema: T): WorkflowBuilder<TInput, TState, T, TNodes>;

  node<TRef extends string, TNodeOutput extends ZodRawShape>(
    ref: TRef,
    config: (ctx: WorkflowContext<TInput, TState, TOutput, TNodes>) => NodeConfig<TNodeOutput>,
  ): WorkflowBuilder<TInput, TState, TOutput, TNodes & { [K in TRef]: TNodeOutput }>;

  build(): CreateWorkflowDef;
}
```

## Comparison to Alternatives

| Approach               | Type Safety | Autocomplete | Error Messages  | Effort    |
| ---------------------- | ----------- | ------------ | --------------- | --------- |
| String JSONPath        | ❌ None     | ❌ None      | ❌ Runtime only | ✅ Low    |
| Template Literal Types | 🟡 Partial  | 🟡 Limited   | ❌ Cryptic      | 🔴 High   |
| **DSL Builder**        | ✅ Full     | ✅ Full      | ✅ Clear        | 🟡 Medium |
| Runtime Validation     | ✅ Full     | ❌ None      | ✅ Clear        | ✅ Low    |

## Migration Path

1. DSL is additive - existing string-based builders continue to work
2. New workflows can adopt DSL incrementally
3. `.build()` output is identical, so no backend changes needed
4. Consider deprecation warnings on string-based builders in future

## File Location

The DSL lives in the SDK package alongside existing builders:

```
packages/sdk/src/
├── builders/           # Existing string-based builders
│   ├── index.ts
│   ├── workflow.ts     # workflowDef()
│   ├── node.ts         # node()
│   ├── task.ts         # taskDef(), step()
│   ├── transition.ts
│   └── schema.ts
│
├── dsl/                # NEW: Type-safe DSL
│   ├── index.ts        # Exports wonder.workflow(), wonder.task()
│   ├── workflow.ts     # WorkflowBuilder class
│   ├── task.ts         # TaskBuilder class
│   ├── types.ts        # Context generics, WorkflowContext<T>
│   └── compile.ts      # Converts DSL → CreateWorkflowDef
│
├── index.ts            # Exports both
└── ...
```

Usage from the same package:

```typescript
// Existing builders still work
import { workflowDef, node, step } from '@wonder/sdk';

// New DSL - same package
import { wonder } from '@wonder/sdk';

const workflow = wonder
  .workflow('my-workflow')
  .input({ name: z.string() })
  // ...
  .build();
```

Both approaches emit the same `CreateWorkflowDef` type, so no backend changes are needed.

## Open Questions

1. **Zod dependency** - Use Zod directly or our own `schema.*` helpers?
2. **Async node config** - Should node config callback be async for fetching task metadata?
3. **Validation mode** - Emit warnings vs errors for type mismatches?
4. **IDE integration** - How to surface errors in workflow editor UI?

## References

- [TypeScript Builder Pattern](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [Zod Schema Inference](https://zod.dev/?id=type-inference)
- [Effect-TS](https://effect.website/) - Inspiration for type-safe effect systems
