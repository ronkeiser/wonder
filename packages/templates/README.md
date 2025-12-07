# @wonder/templates

Handlebars-compatible template engine for Wonder workflows. Built from scratch with a focus on safety, simplicity, and deterministic behavior.

## Features

### ✅ Variable Interpolation

```handlebars
{{name}}
{{user.email}}
{{users.[0].name}}
```

- Context variable access
- Dot notation for nested properties
- Array index access
- Automatic HTML escaping

### ✅ Path Expressions

```handlebars
{{.}}              <!-- Current context -->
{{this.name}}      <!-- Explicit this reference -->
{{../parent}}      <!-- Parent context access -->
{{../../root}}     <!-- Multiple levels up -->
```

- Current context (`.`)
- Parent paths (`..`)
- Multi-level parent access
- Explicit `this` keyword

### ✅ Literal Values

```handlebars
{{helper 'string'}}
{{helper 123}}
{{helper 45.67}}
{{helper true}}
{{helper false}}
{{helper null}}
```

- String literals (double and single quotes)
- Number literals (integers and decimals, positive and negative)
- Boolean literals (`true`, `false`)
- Null literal

### ✅ Escaping

```handlebars
\{{not-a-variable}}
<!-- Literal braces -->
{{escape 'He said "hi"'}}
<!-- Escaped quotes in strings -->
```

- Backslash escaping for literal braces
- Escaped quotes in string literals
- HTML escaping by default

### ✅ Comments

```handlebars
{{! This is a comment }}
{{! This is also a comment }}
```

- Standard comments `{{! }}`
- Long-form comments `{{!-- --}}`
- Comments are removed from output

### ✅ Built-in Helpers

#### `#if` - Conditional Rendering

```handlebars
{{#if condition}}
  Content shown when truthy
{{/if}}

{{#if value}}
  Truthy branch
{{else}}
  Falsy branch
{{/if}}
```

- Handlebars truthiness (0 is truthy, empty string is falsy)
- `{{else}}` support
- Works with nested contexts

#### `#unless` - Inverted Conditional

```handlebars
{{#unless condition}}
  Content shown when falsy
{{/unless}}
```

- Inverse of `#if`
- Handlebars truthiness rules

#### `#with` - Context Change

```handlebars
{{#with user}}
  {{name}}
  {{email}}
{{/with}}

{{#with person}}
  {{name}}
{{else}}
  No person found
{{/with}}
```

- Changes context to provided value
- `{{else}}` for undefined/null values

#### `#each` - Iteration

```handlebars
{{#each items}}
  {{this}}
{{/each}}

{{#each users}}
  {{@index}}:
  {{name}}
{{/each}}

{{#each object}}
  {{@key}}:
  {{this}}
{{/each}}
```

- Array iteration
- Object iteration
- Access to `@index` (zero-based)
- Access to `@key` (object property names)
- Access to `@first` and `@last` booleans
- Nested iteration support
- `{{else}}` for empty arrays/objects

### ✅ Data Variables

```handlebars
{{#each items}}
  {{@index}}
  <!-- Current index (0-based) -->
  {{@first}}
  <!-- true for first item -->
  {{@last}}
  <!-- true for last item -->
{{/each}}

{{#each object}}
  {{@key}}
  <!-- Property name -->
{{/each}}

{{@root.globalValue}}
<!-- Access root context from nested blocks -->
```

- `@index` - Current iteration index
- `@first` - Boolean, true for first item
- `@last` - Boolean, true for last item
- `@key` - Property name in object iteration
- `@root` - Access root context from any depth

### ✅ Functions as Values

```handlebars
<!-- Functions in context are automatically called -->
{{dynamicValue}}
<!-- Calls function and renders result -->
```

- Functions in context are automatically invoked
- Return values are rendered
- Works in all contexts (variables, helpers, blocks)

### ✅ Nested Contexts

```handlebars
{{#each users}}
  {{name}}
  {{#each posts}}
    {{title}} by {{../name}}
  {{/each}}
{{/each}}
```

- Multiple nesting levels
- Parent access with `..`
- Context stack maintained correctly

### ✅ ES6 Support

```handlebars
{{map.get('key')}}  <!-- ES6 Maps work -->
```

- ES6 Map property access
- Nested Maps
- Empty string keys

## What Doesn't Work Yet

### ⚠️ Parser Limitations

- ❌ Block parameters (`as |item|`) - parser doesn't recognize syntax
- ❌ Hash parameters (`helper key=value`) - not implemented
- ❌ Hyphenated identifiers (`{{foo-bar}}`) - treated as subtraction
- ❌ Nested `this` paths (`{{this.foo.bar}}`) - EOF parsing errors
- ❌ Whitespace control (`{{~foo~}}`) - tokens recognized but not applied

### ⚠️ Data Variable Issues

- ❌ Custom `@variable` syntax - only built-ins work (@index, @first, @last, @key, @root)
- ❌ Data functions - functions in data context treated as missing helpers
- ❌ @root priority - doesn't override when passed explicitly

### ⚠️ Security Gaps (CRITICAL)

- ❌ Prototype properties accessible (`{{constructor}}`, `{{__proto__}}`)
- ❌ Dangerous methods not blocked (`__defineGetter__`, etc.)
- ❌ `helperMissing` not protected from explicit calls
- ❌ Nested property access broken (`{{obj.prop}}` returns `[object Object]`)

**DO NOT use in production until security issues are fixed.**

### ⚠️ Missing Features

- ❌ `lookup` helper - dynamic property access
- ❌ Map/Set iteration - ES6 Map/Set don't work in `#each`
- ❌ Custom iterables - only Array and Object supported
- ❌ Helper registration system - no runtime helper registration yet
- ❌ Partials - not implemented
- ❌ Decorators - not planned for V1

## Usage

```typescript
import { compile } from '@wonder/templates';

// Compile a template
const template = compile('Hello {{name}}!');

// Render with context
const output = template({ name: 'World' });
console.log(output); // "Hello World!"

// With nested data
const template2 = compile(`
{{#each users}}
  {{@index}}. {{name}} - {{email}}
{{/each}}
`);

const output2 = template2({
  users: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
  ],
});
```

## API

```typescript
function compile(source: string): (context: any) => string;
```

Compiles a template string and returns a render function.

**Parameters:**

- `source` - Handlebars template string

**Returns:**

- Function that takes a context object and returns rendered string

**Throws:**

- `ParserError` - On invalid template syntax
- `Error` - On runtime errors (unknown helpers, etc.)

## Architecture

- **Lexer** - Tokenizes template source
- **Parser** - Builds AST from tokens
- **Interpreter** - Evaluates AST with context

No code generation, no eval, no Function constructor. Pure interpretation for safety and simplicity.
