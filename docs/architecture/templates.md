# Templates

## What Templates Are

Templates render structured workflow context into text. Primary use: converting schema-driven state into natural language prompts for LLM calls.

````handlebars
You are a code reviewer.

Review these files:
{{#each code_files}}
## {{path}} ({{language}})
```{{language}}
{{content}}
````

{{/each}}

Focus on: {{#each criteria}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}

````

Rendered with workflow context:
```typescript
{
  code_files: [
    { path: 'app.ts', language: 'typescript', content: '...' }
  ],
  criteria: ['security', 'performance', 'readability']
}
````

## How They're Used

**PromptSpec stores templates:**

```typescript
{
  id: 'code-review-prompt',
  version: 1,
  template: '...',  // Handlebars template
  requires: { code_files: 'array', criteria: 'array' },
  produces: { type: 'object', properties: { ... } }
}
```

**Execution flow:**

1. Node references PromptSpec via `action_id`
2. Executor loads PromptSpec
3. Node's `input_mapping` extracts data from context
4. Executor compiles template (cached by `(prompt_spec_id, version)`)
5. Executor renders template with mapped inputs
6. Rendered prompt sent to LLM
7. Response validated against `produces` schema

**Example:**

```typescript
// Node configuration
{
  ref: 'review_node',
  action_id: 'llm_review_action',  // References PromptSpec
  input_mapping: {
    code_files: '$.state.files',
    criteria: '$.input.review_criteria'
  }
}
```

## Why @wonder/templates

Cloudflare Workers prohibit `eval()` and `new Function()`. Standard template engines (Handlebars.js, etc.) use code generation for performance.

**@wonder/templates** implements Handlebars syntax via AST parsing + tree-walking interpretation:

- No code generation (CF Workers compatible)
- Runtime compilation (templates are user-defined, stored in D1)
- Compiled template caching (parse once, render many times)
- Minimal bundle size

## Requirements

Templates must support:

**Array iteration** — `{{#each items}}{{this}}{{/each}}` with nested loops for multi-level parallelism
**Loop variables** — `{{@index}}`, `{{@first}}`, `{{@last}}` for position-aware rendering
**Nested property access** — `{{item.property.nested}}` for complex context objects
**Conditionals** — `{{#if}}`, `{{#unless}}` for dynamic prompt structure
**Helpers** — Built-in comparison operators (`gt`, `eq`, etc.) for logic in templates

## Concrete Example: Ideation + Judging

A workflow that generates ideas in parallel, then judges them:

```
Node: ideation_prompt (llm_call)
  → Transition (spawn_count: 10) → Node: generate_idea (llm_call)
  → Transition (wait_for: all, merge: append) → Node: merge_ideas
  → Transition (spawn_count: 5) → Node: judge_ideas (llm_call)
  → Transition (wait_for: all, merge: append) → Node: merge_scores
  → Node: determine_winner (llm_call)
```

**After ideation (10 parallel tokens):**

```typescript
// Branch outputs merged with append strategy
context.state.all_ideas = [
  { name: 'Idea1' }, // from token 1
  { name: 'Idea2' }, // from token 2
  // ... 10 total
];
```

**Judging prompt template:**

```handlebars
You are a judge. Rate each idea from 1-10.

{{#each ideas}}
  {{@index}}.
  {{this.name}}
{{/each}}

Return JSON: [{ name: "...", score: 8 }, ...]
```

**After judging (5 parallel tokens):**

```typescript
// Each judge scores all ideas
context.state.all_scores = [
  [{ name: "Idea1", score: 8 }, { name: "Idea2", score: 7 }, ...],  // Judge 0
  [{ name: "Idea1", score: 9 }, { name: "Idea2", score: 6 }, ...],  // Judge 1
  // ... 5 judges total
]
```

**Ranking prompt template:**

```handlebars
Calculate average scores across judges.

{{#each judge_scores}}
  Judge
  {{@index}}:
  {{#each this}}
    -
    {{name}}:
    {{score}}/10
  {{/each}}
{{/each}}

Return ranked list with averages.
```

**Why this requires template complexity:**

- Nested `{{#each}}` for judge → scores iteration
- `{{@index}}` to label judges/ideas
- Dot notation (`{{this.name}}`, `{{this.score}}`) for object properties
- Dynamic array lengths (10 ideas, 5 judges — user-configurable via spawn_count)

## Syntax

Handlebars-compatible. See `packages/templates/docs/REQUIREMENTS.md` for full spec.

**Core features:**

- Variables: `{{variable}}`, `{{object.property}}`
- Conditionals: `{{#if}}`, `{{#unless}}`
- Iteration: `{{#each items}}{{this}}{{/each}}`
- Helpers: `{{#if (gt score 80)}}`, built-in comparison/logic helpers
- Parent context: `{{../parent.field}}`
- Comments: `{{! comment }}`
