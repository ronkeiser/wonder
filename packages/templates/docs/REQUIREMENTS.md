# @wonder/templates — Requirements

## Overview

A Handlebars-style template engine designed to run in Cloudflare Workers, where `eval()` and `new Function()` are prohibited. Templates are user-defined and stored in D1, requiring full runtime compilation without dynamic code generation.

## Core Constraints

- **No `eval()` or `new Function()`** — must use AST parsing and tree-walking interpretation
- **Runtime compilation** — templates cannot be precompiled; users create/edit templates dynamically
- **Cloudflare Workers compatible** — no Node.js-specific APIs, minimal bundle size

## Syntax (Handlebars-compatible)

```handlebars
{{variable}}              <!-- escaped output -->
{{{variable}}}            <!-- unescaped output -->
{{object.property}}       <!-- dot notation -->
{{#if condition}}...{{/if}}
{{#unless condition}}...{{/unless}}
{{#each items}}...{{/each}}
{{#each items as |item index|}}...{{/each}}
{{#with object}}...{{/with}}
{{> partialName}}         <!-- partials -->
{{! comment }}            <!-- comments -->
{{@index}}, {{@first}}, {{@last}}, {{@key}}  <!-- loop metadata -->
```

## Features

| Feature                             | Priority | Notes                                        |
| ----------------------------------- | -------- | -------------------------------------------- |
| Variable interpolation              | P0       | Dot notation, bracket notation               |
| HTML escaping                       | P0       | Escape by default, triple-stache for raw     |
| Conditionals (`if`/`unless`/`else`) | P0       | Truthy/falsy evaluation                      |
| Iteration (`each`)                  | P0       | Arrays and objects                           |
| Nested contexts                     | P0       | `../` parent access                          |
| Partials                            | P1       | Async partial resolution (from D1)           |
| Helpers                             | P1       | User-defined functions passed at render time |
| Block helpers                       | P2       | Custom block logic                           |
| Whitespace control (`~`)            | P2       | `{{~#if}}` strips whitespace                 |

## Reference Implementations to Study

| Library           | What to borrow                                       |
| ----------------- | ---------------------------------------------------- |
| **LiquidJS**      | AST structure, interpreter pattern, no-eval approach |
| **Handlebars**    | Syntax spec, helper API design                       |
| **mustache.js**   | Scanner/tokenizer simplicity                         |
| **micromustache** | Security safeguards (prototype pollution prevention) |

## API Design

```typescript
import { compile, render } from '@wonder/templates';

// One-shot render
const output = await render('Hello {{name}}!', { name: 'World' });

// Compile + reuse
const template = compile('Hello {{name}}!');
const output = await template.render({ name: 'World' });

// With partials and helpers
const output = await render(templateStr, data, {
  partials: {
    header: '...', // or async () => fetchFromD1('header')
  },
  helpers: {
    uppercase: (str) => str.toUpperCase(),
    formatDate: (date, format) => /* ... */,
  },
});
```
