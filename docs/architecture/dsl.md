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
import { wonder, schema as s } from '@wonder/sdk';

const workflow = wonder
  .workflow('greeting-workflow')
  .input({
    name: s.string(),
    language: s.string({ enum: ['en', 'es', 'fr'] }),
  })
  .output({
    greeting: s.string(),
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
      greeting: s.string(),
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
    items: s.array(s.string()),
    threshold: s.number(),
  })
  .state({
    processedCount: s.number(),
  })
  .output({
    results: s.array(s.object({ id: s.string(), score: s.number() })),
    summary: s.string(),
  })

  .node('validate', (ctx) => ({
    task: validateTaskId,
    input: {
      data: ctx.input.items,
      min: ctx.input.threshold,
    },
    output: {
      validItems: s.array(s.string()),
      invalidCount: s.number(),
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
      results: s.array(s.object({ id: s.string(), score: s.number() })),
    },
  }))

  .node('summarize', (ctx) => ({
    task: summarizeTaskId,
    input: {
      results: ctx.output.process.results,
    },
    output: {
      summary: s.string(),
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
    query: s.string(),
    priority: s.string({ enum: ['low', 'medium', 'high'] }),
  })
  .output({
    response: s.string(),
    handler: s.string(),
  })

  .node('classify', (ctx) => ({
    task: classifyTaskId,
    input: { query: ctx.input.query },
    output: {
      category: s.string({ enum: ['billing', 'technical', 'general'] }),
      confidence: s.number(),
    },
  }))

  .node('billing_handler', (ctx) => ({
    task: billingTaskId,
    input: {
      query: ctx.input.query,
      category: ctx.output.classify.category,
    },
    output: { response: s.string() },
  }))

  .node('technical_handler', (ctx) => ({
    task: technicalTaskId,
    input: { query: ctx.input.query },
    output: { response: s.string() },
  }))

  .node('general_handler', (ctx) => ({
    task: generalTaskId,
    input: { query: ctx.input.query },
    output: { response: s.string() },
  }))

  // Conditional transitions with type-safe expression builder
  .transition('classify', 'billing_handler', {
    when: (ctx) => ctx.output.classify.category.eq('billing'),
  })
  .transition('classify', 'technical_handler', {
    when: (ctx) => ctx.output.classify.category.eq('technical'),
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

### Expression Builder

Conditions are built using a type-safe expression API that compiles to CEL:

```typescript
// Comparison operators
ctx.output.classify.category.eq('billing'); // category == "billing"
ctx.output.classify.confidence.gt(0.8); // confidence > 0.8
ctx.output.classify.confidence.gte(0.8); // confidence >= 0.8
ctx.output.classify.confidence.lt(0.5); // confidence < 0.5
ctx.input.priority.neq('low'); // priority != "low"
ctx.input.priority.in(['high', 'critical']); // priority in ["high", "critical"]

// String operators
ctx.input.query.contains('refund'); // query.contains("refund")
ctx.input.query.startsWith('help'); // query.startsWith("help")
ctx.input.query.matches('^[A-Z]{3}-\\d+$'); // query.matches("^[A-Z]{3}-\\d+$")

// Logical operators
ctx.output.classify.category.eq('billing').and(ctx.output.classify.confidence.gt(0.8)); // &&

ctx.input.priority.eq('high').or(ctx.input.priority.eq('critical')); // ||

ctx.output.classify.category.eq('billing').not(); // !(...)

// Complex expressions
ctx.output.classify.confidence
  .gt(0.8)
  .and(ctx.input.priority.eq('high').or(ctx.output.classify.category.eq('billing')));
// confidence > 0.8 && (priority == "high" || category == "billing")
```

The expression builder:

1. **Type-checks at compile time** — `ctx.output.classify.typo` is a TS error
2. **Validates operator/type combinations** — `.gt()` only available on numbers
3. **Generates valid CEL** — No string manipulation errors
4. **Provides autocomplete** — IDE knows available fields and methods

For rare cases requiring arbitrary CEL, use the escape hatch:

```typescript
.transition('a', 'b', {
  whenCEL: "size(input.items) > output.validate.threshold * 2",
})
```

### Fan-Out / Fan-In

```typescript
const parallel = wonder
  .workflow('idea-generator')
  .input({
    topic: s.string(),
    judgeCount: s.number(),
  })
  .output({
    bestIdea: s.string(),
    scores: s.array(s.number()),
  })

  .node('generate', (ctx) => ({
    task: generateTaskId,
    input: { topic: ctx.input.topic },
    output: { ideas: s.array(s.string()) },
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
      scores: s.array(s.number()),
      topPick: s.string(),
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
      bestIdea: s.string(),
      finalScores: s.array(s.number()),
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

### Phase 2: Transitions & Expression Builder

1. `.transition()` with type-safe node ref validation
2. Expression builder: `Expr`, `StringFieldExpr`, `NumberFieldExpr`, etc.
3. Proxy-based `ExprContext` that builds paths and returns typed field expressions
4. CEL code generation from expression tree
5. Priority ordering
6. `whenCEL` escape hatch for complex expressions

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
  .input({ path: s.string(), content: s.string() })
  .output({ success: s.boolean(), hash: s.string() })

  .step('write', (ctx) => ({
    action: writeActionId,
    input: {
      filePath: ctx.input.path,
      data: ctx.input.content,
    },
    output: { bytesWritten: s.number() },
  }))

  .step('verify', (ctx) => ({
    action: readActionId,
    input: { filePath: ctx.input.path },
    output: { content: s.string(), hash: s.string() },
  }))

  .returns((ctx) => ({
    success: ctx.state.write.bytesWritten > 0,
    hash: ctx.state.verify.hash,
  }))

  .build();
```

## Type Implementation Sketch

```typescript
import type { JSONSchema } from '@wonder/context';

// Infer TypeScript type from JSONSchema
type InferSchema<T extends JSONSchema> = T['type'] extends 'string'
  ? T['enum'] extends readonly string[]
    ? T['enum'][number]
    : string
  : T['type'] extends 'number' | 'integer'
    ? number
    : T['type'] extends 'boolean'
      ? boolean
      : T['type'] extends 'array'
        ? T['items'] extends JSONSchema
          ? InferSchema<T['items']>[]
          : unknown[]
        : T['type'] extends 'object'
          ? T['properties'] extends Record<string, JSONSchema>
            ? { [K in keyof T['properties']]: InferSchema<T['properties'][K]> }
            : Record<string, unknown>
          : unknown;

// Schema shape: Record<string, JSONSchema>
type SchemaShape = Record<string, JSONSchema>;

// Infer object type from schema shape
type InferShape<T extends SchemaShape> = {
  [K in keyof T]: InferSchema<T[K]>;
};

// Context type that grows with each node
type WorkflowContext<
  TInput extends SchemaShape,
  TState extends SchemaShape,
  TOutput extends SchemaShape,
  TNodes extends Record<string, SchemaShape>,
> = {
  input: InferShape<TInput>;
  state: InferShape<TState>;
  output: { [K in keyof TNodes]: InferShape<TNodes[K]> };
};

// Builder with evolving generic
class WorkflowBuilder<
  TInput extends SchemaShape = {},
  TState extends SchemaShape = {},
  TOutput extends SchemaShape = {},
  TNodes extends Record<string, SchemaShape> = {},
> {
  input<T extends SchemaShape>(schema: T): WorkflowBuilder<T, TState, TOutput, TNodes>;

  state<T extends SchemaShape>(schema: T): WorkflowBuilder<TInput, T, TOutput, TNodes>;

  output<T extends SchemaShape>(schema: T): WorkflowBuilder<TInput, TState, T, TNodes>;

  node<TRef extends string, TNodeOutput extends SchemaShape>(
    ref: TRef,
    config: (ctx: WorkflowContext<TInput, TState, TOutput, TNodes>) => NodeConfig<TNodeOutput>,
  ): WorkflowBuilder<TInput, TState, TOutput, TNodes & { [K in TRef]: TNodeOutput }>;

  build(): CreateWorkflowDef;
}
```

### Expression Builder Types

```typescript
// Base expression that compiles to CEL
interface Expr {
  toCEL(): string;
  and(other: Expr): Expr;
  or(other: Expr): Expr;
  not(): Expr;
}

// Type-safe field reference with operators based on field type
type FieldExpr<T> = T extends string
  ? StringFieldExpr
  : T extends number
    ? NumberFieldExpr
    : T extends boolean
      ? BooleanFieldExpr
      : T extends Array<infer U>
        ? ArrayFieldExpr<U>
        : ObjectFieldExpr<T>;

interface StringFieldExpr extends Expr {
  eq(value: string): Expr;
  neq(value: string): Expr;
  in(values: string[]): Expr;
  contains(substring: string): Expr;
  startsWith(prefix: string): Expr;
  endsWith(suffix: string): Expr;
  matches(pattern: string): Expr;
}

interface NumberFieldExpr extends Expr {
  eq(value: number): Expr;
  neq(value: number): Expr;
  gt(value: number): Expr;
  gte(value: number): Expr;
  lt(value: number): Expr;
  lte(value: number): Expr;
  in(values: number[]): Expr;
  between(min: number, max: number): Expr;
}

interface BooleanFieldExpr extends Expr {
  eq(value: boolean): Expr;
  isTrue(): Expr; // field == true
  isFalse(): Expr; // field == false
}

interface ArrayFieldExpr<T> extends Expr {
  contains(value: T): Expr;
  isEmpty(): Expr;
  isNotEmpty(): Expr;
  size(): NumberFieldExpr; // Returns number expr for size(field)
}

// Proxy-based context for transitions
// Each property access builds the path and returns typed FieldExpr
type ExprContext<
  TInput extends SchemaShape,
  TState extends SchemaShape,
  TNodes extends Record<string, SchemaShape>,
> = {
  input: ExprShape<TInput>;
  state: ExprShape<TState>;
  output: { [K in keyof TNodes]: ExprShape<TNodes[K]> };
};

// Convert schema shape to expression shape
type ExprShape<T extends SchemaShape> = {
  [K in keyof T]: FieldExpr<InferSchema<T[K]>>;
};
```

The expression context is a Proxy that:

1. Tracks the path as you access properties (`ctx.output.classify.category` → `"output.classify.category"`)
2. Returns a `FieldExpr` with methods typed to the field's schema type
3. Each method returns an `Expr` that serializes to CEL

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

1. **~~Zod dependency~~** - ✅ Resolved: Use `@wonder/context` JSONSchema + SDK's `schema.*` helpers
2. **Async node config** - Should node config callback be async for fetching task metadata?
3. **Validation mode** - Emit warnings vs errors for type mismatches?
4. **IDE integration** - How to surface errors in workflow editor UI?

## References

- [TypeScript Builder Pattern](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [@wonder/context](../packages/context/README.md) - Runtime JSON Schema validation
- [Effect-TS](https://effect.website/) - Inspiration for type-safe effect systems
