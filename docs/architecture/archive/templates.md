# Template Rendering

## Why Handlebars Doesn't Work in Cloudflare Workers

Handlebars uses runtime template compilation via `new Function()` or `eval()` to generate executable JavaScript from template strings. Cloudflare Workers blocks this for security reasons:

```
Error: Code generation from strings disallowed for this context
```

This is a fundamental security restriction in the V8 isolate runtime that Workers uses. It prevents:

- `eval()`
- `new Function()`
- `setTimeout(string)`
- `setInterval(string)`

### Workarounds We Can't Use

**Pre-compilation approach:**

- Handlebars supports pre-compiling templates at build time
- Requires templates to be known at build time
- Wonder's templates are stored in the database and created/edited by users at runtime
- Pre-compilation is not an option for user-defined templates

**Runtime-only Handlebars:**

- The `handlebars/runtime` package can execute pre-compiled templates
- Still requires templates to be compiled ahead of time
- Doesn't solve the dynamic template problem

## Wonder's Template Requirements

### Use Cases

1. **Prompt templates for LLM calls** - Users define templates with variable substitution for prompts
2. **Dynamic data injection** - Templates receive context from workflow execution (input, node outputs, merged branch data)
3. **User-editable** - Templates stored in database, created and modified through UI
4. **Runtime compilation** - Must compile at workflow execution time, not build time

### Required Features

Based on actual usage in edge test (`packages/test/src/tests/edge.test.ts`):

#### 1. Array Iteration (`{{#each}}`)

```handlebars
{{#each names}}
  -
  {{this}}
{{/each}}
```

**Use case:** Iterate over merged branch outputs (e.g., 10 dog names from ideation phase)

#### 2. Nested Iteration

```handlebars
{{#each judge_scores}}
  Judge
  {{@index}}:
  {{#each this}}
    -
    {{this.name}}:
    {{this.score}}/10
  {{/each}}
{{/each}}
```

**Use case:** Display results from multiple judges, each judging multiple items

#### 3. Loop Variables

- `{{this}}` - Current item in iteration
- `{{@index}}` - Zero-based index
- `{{@first}}` - Boolean, true if first item
- `{{@last}}` - Boolean, true if last item

#### 4. Nested Property Access

```handlebars
{{this.name}}
{{this.score}}
{{item.nested.property}}
```

**Use case:** Access properties of objects in arrays (judge scores, rankings, etc.)

#### 5. Simple Variable Substitution

```handlebars
{{variable}}
```

**Use case:** Basic variable replacement for simple prompts

### Data Flow Example

From the edge test workflow:

```
Ideation (fan-out 10x)
  → each outputs: { name: "DogName" }

Merge Names (fan-in)
  → stores: merge_names_node_output.all_names = ["Name1", "Name2", ...]

Judging (fan-out 5x)
  → input_mapping: { names: "$.merge_names_node_output.all_names" }
  → template needs: {{#each names}} to iterate over array
  → each outputs: { scores: [{ name: "Name1", score: 8 }, ...] }

Merge Scores (fan-in)
  → stores: merge_scores_node_output.all_scores = [
      [{ name: "Name1", score: 8 }, ...],  // Judge 0
      [{ name: "Name1", score: 7 }, ...],  // Judge 1
      ...
    ]

Ranking (single)
  → input_mapping: { judge_scores: "$.merge_scores_node_output.all_scores" }
  → template needs: {{#each judge_scores}} with nested {{#each this}}
  → output: { ranking: [{ name: "...", average_score: 8.5, rank: 1 }] }
```

## Implementation Options

### Option 1: Custom Template Engine

Implement a focused template engine supporting only the features we need:

**Pros:**

- Full control over features and performance
- No external dependencies
- Guaranteed Workers compatibility

**Cons:**

- ~200-300 lines of implementation
- Need to handle edge cases and bugs
- Maintenance burden

**Estimated complexity:** Medium (2-3 hours)

### Option 2: Extract from Handlebars

Take Handlebars source code and remove:

- The compiler (uses `new Function`)
- File system operations
- Node.js dependencies

Keep:

- Parser (template string → AST)
- AST walker
- Helper system

**Pros:**

- Battle-tested parsing logic
- Comprehensive edge case handling
- MIT licensed

**Cons:**

- Still significant code to maintain
- May still hit runtime code generation

**Estimated complexity:** Medium-High (4-6 hours)

### Option 3: Alternative Template Library

Research Worker-compatible template engines:

Candidates:

- `liquidjs` - Liquid template engine (Shopify's language)
- `nunjucks` - Mozilla's templating (may have same eval issue)
- `mustache` - Logicless templates (limited features)
- `eta` - Embedded JS templates (may have eval issue)

**Pros:**

- Maintained by others
- May have better features

**Cons:**

- Need to verify Workers compatibility
- May still hit code generation restrictions
- Learning curve for different syntax

**Estimated complexity:** Unknown (depends on compatibility research)

### Option 4: Custom Minimal Implementation

Build exactly what we need, no more:

```typescript
// Supports:
// - {{variable}}
// - {{#each array}} {{this}} {{@index}} {{/each}}
// - {{item.property.nested}}
// - Nested {{#each}}

function renderTemplate(template: string, context: Record<string, unknown>): string {
  // 1. Parse template into tokens
  // 2. Build AST from tokens
  // 3. Walk AST with context stack
  // 4. Render each node type
}
```

**Pros:**

- Minimal code (~150-200 lines)
- Only what we need
- Easy to understand and maintain

**Cons:**

- Limited to our exact needs
- No community support
- Manual edge case handling

**Estimated complexity:** Low-Medium (1-2 hours)

## Current State

**template.ts:** Uses simple regex-based variable substitution

```typescript
// Only supports: {{variable}} and {{json variable}}
// Does NOT support: {{#each}}, {{this}}, nested properties
```

**Status:** Inadequate for current test requirements

**Next Steps:** Choose implementation option and proceed
