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

{{#each myMap}}
  {{@key}}:
  {{this}}
{{/each}}

{{#each mySet}}
  {{this}}
{{/each}}
```

- Array iteration
- Object iteration
- ES6 Map iteration (with `@key` for map keys)
- ES6 Set iteration
- Access to `@index` (zero-based)
- Access to `@key` (object property names, or Map keys)
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

### ✅ Hash Arguments

```handlebars
{{helper key='value' count=42}}
{{#each items sortBy='name' limit=10}}
  {{name}}
{{/each}}
```

- Named parameters passed to helpers via `options.hash`
- Support for string, number, boolean, and variable values
- Works with both inline and block helpers

### ✅ `lookup` Helper

```handlebars
{{lookup user "name"}}
{{lookup items @index}}
{{lookup . key}}
```

- Dynamic property access
- Access properties by variable name
- Works with objects and arrays
- Safe - blocks prototype property access

### ✅ Custom Block Helpers

```handlebars
{{#myHelper data}}
  Content rendered by helper
{{/myHelper}}
```

- Full `options` object support
- `options.fn(context)` - render block content
- `options.inverse(context)` - render else block
- `options.hash` - named parameters
- `options.data` - data variables

### ✅ ES6 Support

```handlebars
{{map.get('key')}}  <!-- ES6 Maps work -->
{{#each myMap}}{{@key}}: {{this}}{{/each}}
{{#each mySet}}{{this}}{{/each}}
```

- ES6 Map property access
- ES6 Map/Set iteration in `#each`
- Nested Maps
- Empty string keys

## What Doesn't Work Yet

### ⚠️ Parser Limitations

- ❌ Block parameters (`as |item|`) - parser doesn't recognize syntax
- ❌ Hyphenated identifiers (`{{foo-bar}}`) - treated as subtraction
- ❌ Nested `this` paths (`{{this.foo.bar}}`) - EOF parsing errors
- ❌ Whitespace control (`{{~foo~}}`) - tokens recognized but not applied
- ❌ Standalone inverse sections (`{{^}}`) - must use `{{else}}` instead

### ⚠️ Data Variable Issues

- ❌ Custom `@variable` syntax - only built-ins work (@index, @first, @last, @key, @root)
- ❌ @root priority - doesn't override when passed explicitly

### ⚠️ Missing Features

- ❌ Custom iterables - only Array, Object, Map, Set supported
- ❌ Helper registration system - no runtime helper registration yet
- ❌ Partials - not implemented
- ❌ Decorators - not planned for V1

## Security

✅ **Prototype pollution protection** - The following are blocked:

- `constructor` property access (unless it's an own property)
- `__proto__` property access
- `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`
- Explicit `helperMissing`/`blockHelperMissing` calls

```handlebars
{{constructor}}
<!-- Returns empty, not Function -->
{{__proto__}}
<!-- Returns empty -->
{{lookup this '__proto__'}}
<!-- Returns undefined -->
```

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
