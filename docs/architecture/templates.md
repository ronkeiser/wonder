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

## Syntax

Handlebars-compatible. See `packages/templates/docs/REQUIREMENTS.md` for full spec.

**Core features:**

- Variables: `{{variable}}`, `{{object.property}}`
- Conditionals: `{{#if}}`, `{{#unless}}`
- Iteration: `{{#each items}}{{this}}{{/each}}`
- Helpers: `{{#if (gt score 80)}}`, built-in comparison/logic helpers
- Parent context: `{{../parent.field}}`
- Comments: `{{! comment }}`
