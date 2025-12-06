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

## Version 1 Features

**Core rendering with in-memory data:**

| Feature                | Notes                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| Variable interpolation | `{{variable}}`, `{{object.property}}`, nested property access            |
| HTML escaping          | Escape by default, `{{{variable}}}` for unescaped output                 |
| Built-in block helpers | `#if`, `#unless`, `#each`, `#with` - all standard Handlebars blocks      |
| Array iteration        | `{{#each items}}{{this}}{{/each}}` - P0 blocker for edge tests           |
| Nested iteration       | `{{#each outer}}{{#each inner}}{{/each}}{{/each}}` - for ranking         |
| Loop variables         | `{{this}}`, `{{@index}}`, `{{@first}}`, `{{@last}}`, `{{@key}}`          |
| Parent context access  | `../` to access outer scope in nested blocks                             |
| Conditionals           | `{{#if condition}}...{{else}}...{{/if}}`, `{{#unless}}`                  |
| Context switching      | `{{#with object}}...{{/with}}` - scoped context                          |
| Runtime helpers        | User-defined functions passed at render time via options                 |
| Built-in helpers       | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not` for comparisons |
| Subexpressions         | `{{#if (gt score 80)}}` - nested helper calls in expressions             |
| Comments               | `{{! comment }}`                                                         |

## Version 2 Features

**Async operations and stored templates:**

| Feature            | Notes                                                |
| ------------------ | ---------------------------------------------------- |
| Partials from D1   | `{{> partialName}}` - async resolution from database |
| Helpers from D1    | User-defined helpers stored and retrieved from D1    |
| Block params       | `{{#each items as \|item index\|}}` - param binding  |
| Whitespace control | `{{~#if}}` strips whitespace                         |
| Custom decorators  | Advanced template modification                       |

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
