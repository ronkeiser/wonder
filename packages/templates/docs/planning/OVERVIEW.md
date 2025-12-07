# @wonder/templates — V1 Implementation Plan

## Overview

Version 1 provides complete template rendering with in-memory data, including helpers, comparisons, and all built-in blocks needed for LLM prompt templates. Implementation follows a layered architecture: Lexer → Parser → Interpreter.

**Key Constraint:** Must work in Cloudflare Workers without `eval()` or `new Function()`. We implement stages 1-2 from Handlebars (Lexer + Parser to produce AST), then directly interpret the AST instead of compiling to JavaScript.

**V1 Scope:** All features that work with in-memory data - variables, all built-in blocks (#if, #unless, #each, #with), runtime helpers, built-in comparison helpers, and subexpressions.

**V2 Scope:** Async operations - partials/helpers stored in D1, block params, whitespace control.

---

## Capability 1: Lexical Analysis (Tokenization)

**Status:** ✅ Completed

**Goal:** Transform template strings into token streams following Handlebars tokenization rules

### Feature 1.1: Core Token Types

Implement recognition for essential token types from Handlebars spec:

- **Delimiters:** `OPEN` (`{{`), `CLOSE` (`}}`), `OPEN_UNESCAPED` (`{{{`), `CLOSE_UNESCAPED` (`}}}`)
- **Block tokens:** `OPEN_BLOCK` (`{{#`), `OPEN_ENDBLOCK` (`{{/`), `OPEN_INVERSE` (`{{^`)
- **Special:** `INVERSE` (`{{else}}`), `COMMENT` (`{{!` or `{{!--`)
- **Subexpressions:** `OPEN_SEXPR` (`(`), `CLOSE_SEXPR` (`)`)
- **Content:** `CONTENT` (plain text between mustaches)
- **Literals:** `STRING` (`"text"` or `'text'`), `NUMBER`, `BOOLEAN`, `UNDEFINED`, `NULL`
- **Identifiers:** `ID` (variable/helper names)
- **Path separators:** `SEP` (`.` or `/` for dot notation)
- **Data prefix:** `DATA` (`@` for data variables)

**Test cases:**

- Plain text with no templates
- Single `{{variable}}`
- Triple-stache `{{{unescaped}}}`
- Block helpers: `{{#if}}`, `{{/if}}`
- Comments: `{{! comment }}` and `{{!-- comment --}}`
- String literals: `"text"`, `'text'` (with quote escaping)
- Number literals: `123`, `1.5`, `-1`
- Boolean literals: `true`, `false`
- Special values: `null`, `undefined`

### Feature 1.2: Path Tokenization

- Recognize dot notation: `foo.bar.baz` → `ID("foo")`, `SEP`, `ID("bar")`, `SEP`, `ID("baz")`
- Recognize slash notation: `foo/bar` → Same token sequence as dot notation
- Recognize parent paths: `../parent` → `ID("..")`, `SEP`, `ID("parent")`
- Recognize data variables: `@index` → `DATA`, `ID("index")`
- Whitespace handling: `{{  foo  }}` → Preserve spacing between delimiters

**Test cases:**

- Dot notation: `{{user.profile.name}}`
- Slash notation: `{{user/profile/name}}`
- Parent access: `{{../parent}}`, `{{../../grandparent}}`
- Data variables: `{{@index}}`, `{{@root.value}}`
- Mixed: `{{../user.name}}`
- Whitespace: `{{  foo  }}` tokenizes correctly

### Feature 1.3: Escape Handling

Implement backslash escaping before tokenization:

- `\\{{foo}}` → Literal text `{{foo}}` (not tokenized)
- `\\\\{{foo}}` → Literal `\` + tokenized `{{foo}}`
- Escaping only affects the immediately following character

**Test cases:**

- Escaped mustache: `\\{{foo}}` renders as `{{foo}}`
- Escaped backslash: `\\\\{{foo}}` renders as `\` + resolved value
- Multiple escapes: `\\{{foo}} \\{{bar}}`

### Feature 1.4: Lexer State Machine

- Stateful lexer: `setInput()` to initialize, `lex()` to get next token
- Track position information for error messages (line, column)
- Handle EOF gracefully
- Detect malformed input (unclosed comments, invalid syntax)

**Test cases:**

- Sequential token extraction via `lex()`
- Position tracking in multi-line templates
- EOF detection
- Unclosed comment error
- Unclosed string literal error

---

## Capability 2: Syntax Analysis (Parsing & AST)

**Status:** ✅ Completed

**Goal:** Build Abstract Syntax Tree from token stream following Handlebars AST structure

### Feature 2.1: AST Node Types

Implement core node types from Handlebars AST specification:

**Program (root):**

- `type: 'Program'`
- `body: Statement[]`
- `loc: SourceLocation | null`

**Statements:**

- `ContentStatement` — Plain text
- `MustacheStatement` — Variable/helper output (`{{foo}}`)
- `BlockStatement` — Block helpers (`{{#if}}...{{/if}}`)
- `CommentStatement` — Comments (excluded from output)

**Expressions:**

- `PathExpression` — Variable paths with depth tracking
- `SubExpression` — Nested helper calls like `(gt x 1)`
- `StringLiteral`, `NumberLiteral`, `BooleanLiteral`, `NullLiteral`, `UndefinedLiteral`

**Test cases:**

- Parse plain text → `ContentStatement`
- Parse `{{foo}}` → `MustacheStatement` with `PathExpression`
- Parse `{{#if x}}...{{/if}}` → `BlockStatement`
- Parse `{{! comment }}` → `CommentStatement`

### Feature 2.2: PathExpression Parsing

Implement Handlebars path structure with security-critical fields:

**PathExpression structure:**

- `type: 'PathExpression'`
- `data: boolean` — true if starts with `@`
- `depth: number` — 0=current, 1=../, 2=../../
- `parts: string[]` — Path segments (e.g., ['foo', 'bar'] for foo.bar)
- `original: string` — Raw path string

**Parsing rules:**

- `{{foo}}` → `depth: 0`, `parts: ['foo']`, `data: false`
- `{{foo.bar}}` → `depth: 0`, `parts: ['foo', 'bar']`
- `{{../parent}}` → `depth: 1`, `parts: ['parent']`
- `{{../../grand}}` → `depth: 2`, `parts: ['grand']`
- `{{@index}}` → `depth: 0`, `parts: ['index']`, `data: true`
- `{{this}}` → `depth: 0`, `parts: []` (empty = current context)
- `{{this.foo}}` → `depth: 0`, `parts: ['foo']` (scoped)
- `{{./foo}}` → `depth: 0`, `parts: ['foo']` (scoped, prevents helper resolution)

**Test cases:**

- Simple path parsing
- Depth calculation for parent paths
- Data flag for @ variables
- Empty parts for `{{this}}`
- Scoped path detection

### Feature 2.3: Block Structure

Parse block helpers with proper nesting:

**BlockStatement structure:**

- `type: 'BlockStatement'`
- `path: PathExpression`
- `params: Expression[]` — Helper arguments (e.g., for built-in comparison helpers)
- `hash: Hash` — Named parameters (reserved for future use)
- `program: Program | null` — Main block content
- `inverse: Program | null` — `{{else}}` content

**Requirements:**

- Match `{{#helper}}` with `{{/helper}}`
- Parse `{{else}}` as inverse block divider
- Validate block name matching
- Support nested blocks
- Track nesting depth for error messages

**Test cases:**

- Single block: `{{#if x}}content{{/if}}`
- Block with else: `{{#if x}}yes{{else}}no{{/if}}`
- Nested blocks: `{{#if a}}{{#if b}}...{{/if}}{{/if}}`
- Mismatched block error: `{{#if x}}{{/each}}`
- Unclosed block error: `{{#if x}}content`

### Feature 2.4: MustacheStatement Properties

**MustacheStatement structure:**

- `type: 'MustacheStatement'`
- `path: PathExpression`
- `params: Expression[]` — Helper arguments (can include subexpressions)
- `hash: Hash` — Named parameters (reserved for future use)
- `escaped: boolean` — true for `{{`, false for `{{{`

**Requirements:**

- Set `escaped: true` for `{{variable}}`
- Set `escaped: false` for `{{{variable}}}`
- Store path as PathExpression
- Parse params for helper calls like `{{uppercase name}}`
- Parse nested subexpressions like `{{#if (gt score 80)}}`

**Test cases:**

- Escaped mustache: `escaped: true`
- Unescaped mustache: `escaped: false`
- Path expression structure

---

## Capability 3: Runtime Utilities

**Status:** ✅ Completed

**Goal:** Implement core utility functions from Handlebars runtime for secure, correct evaluation

### Feature 3.1: lookupProperty

Security-aware property access from Handlebars `runtime.js`:

**Requirements:**

- Handle null/undefined parents → return `undefined`
- Check if property exists on object
- Return only own properties (not inherited) for security
- Return `undefined` for inherited properties to prevent prototype pollution

**Test cases:**

- Access existing property
- Access undefined property → `undefined`
- Access null parent → `undefined`
- Access inherited property → `undefined` (security)
- Access own property with null value → `null`

### Feature 3.2: escapeExpression

HTML entity escaping from Handlebars `utils.js`:

**Requirements:**

- Handle null/undefined → empty string
- Handle non-string falsy values → string coercion
- Convert to string if needed
- Escape 7 characters: `& < > " ' ` =`
- Fast path: skip replacement if no special characters found

**Escape mappings:**

- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#x27;`
- `` ` `` → `&#x60;`
- `=` → `&#x3D;`

**Test cases:**

- Null/undefined → `""`
- `false` → `"false"`
- `0` → `"0"`
- HTML tags → escaped
- All 7 special characters escaped
- No special characters → unchanged (fast path)

### Feature 3.3: createFrame

Data frame creation for scope isolation from Handlebars `utils.js`:

**Requirements:**

- Create shallow copy of object
- Add `_parent` reference to original object
- Changes to frame don't affect parent
- Parent properties remain accessible

**Test cases:**

- Creates shallow copy
- Adds `_parent` reference
- Changes to frame don't affect parent
- Parent properties accessible

### Feature 3.4: isEmpty

Falsy value detection for conditionals from Handlebars `utils.js`:

**Requirements:**

- Return `true` for: `null`, `undefined`, `false`, `""`
- Return `true` for empty arrays: `[]`
- Return `false` for: `0`, `{}`, non-empty arrays
- **Important:** Different from JavaScript falsy! `{}` is NOT empty, `0` is NOT empty

**Test cases:**

- `null`, `undefined`, `false`, `""` → `true`
- `[]` → `true` (empty array)
- `0`, `{}`, non-empty array → `false`

### Feature 3.5: Type Checking

**Requirements:**

- `isArray()` — Detect arrays using `Array.isArray()`
- `isFunction()` — Detect functions using `typeof`

**Test cases:**

- Arrays detected correctly
- Non-arrays return false
- Functions detected

---

## Capability 4: Context Resolution & Interpreter

**Status:** ✅ Completed

**Goal:** Evaluate PathExpressions by traversing context scopes and data frames

### Feature 4.1: Simple Path Resolution

Walk path parts using lookupProperty:

**Requirements:**

- Start with current context
- Walk each part in sequence
- Use `lookupProperty()` for security
- Return `undefined` if any intermediate is null/undefined
- Support array index access

**Test cases:**

- Single property: `{{foo}}`
- Nested property: `{{foo.bar.baz}}`
- Missing intermediate: `{{foo.bar}}` when `foo` is `null`
- Array index: `{{items.0}}`

### Feature 4.2: Depth-based Lookup

Handle parent scope access via depth field:

**Requirements:**

- Maintain context stack (array of contexts from current to root)
- Maintain data stack (array of data frames)
- Data variables (`@`) lookup from data stack
- Regular variables use context stack
- Depth determines starting point in stack
- Empty parts means `{{this}}` or `{{..}}`
- Out-of-bounds depth uses root context

**Test cases:**

- `{{foo}}` with depth 0 → current context
- `{{../parent}}` with depth 1 → parent context
- `{{../../grand}}` with depth 2 → grandparent context
- `{{@index}}` → data frame lookup
- `{{this}}` with empty parts → current context object
- Out-of-bounds depth → root context

### Feature 4.3: Data Variable Management

Maintain data frame stack for loop metadata:

**Data variables:**

- `@root` — Set once at initialization to top-level context
- `@index` — Zero-based position (set by #each)
- `@first` — Boolean, true for first iteration
- `@last` — Boolean, true for last iteration
- `@key` — Property name in object iteration

**Requirements:**

- Create new data frame for each iteration
- Use `createFrame()` to inherit parent data
- Each frame maintains its own metadata
- Data variables are scoped to current frame

**Test cases:**

- Access `@root` at any depth
- Access `@index`, `@first`, `@last` in #each
- Access `@key` in object iteration
- Data frames inherit via `createFrame()`
- Nested loops maintain separate data frames

---

## Capability 5: Built-in Block Helpers

**Status:** ✅ Completed

**Goal:** Implement #if, #unless, #each, #with following Handlebars behavior exactly

### Feature 5.1: #if Helper

**Requirements:**

- Resolve condition using path expression
- Handle function values by calling them
- Use `isEmpty()` for truthiness check (not standard JS falsy)
- Truthy: render main block
- Falsy: render inverse block (if present)
- No inverse block: render empty string

**Truthiness rules:**

- **Truthy:** non-empty string, non-zero number, `true`, non-empty array, `{}`
- **Falsy:** `""`, `0`, `false`, `null`, `undefined`, `[]`

**Test cases:**

- Truthy values render main block
- Falsy values render else block
- `{{#if condition}}yes{{/if}}` without else
- `{{#if condition}}yes{{else}}no{{/if}}` with else
- Nested if blocks

### Feature 5.2: #unless Helper

**Requirements:**

- Inverts #if logic
- Falsy values render main block
- Truthy values render inverse block
- Same truthiness rules as #if

**Test cases:**

- Falsy values render main block
- Truthy values render else block
- `{{#unless condition}}no{{else}}yes{{/unless}}`

### Feature 5.3: #each Helper — Array Iteration

**Requirements:**

- Resolve collection using path expression
- Handle empty/null → render inverse block
- Skip non-arrays in V1
- Create data frame per iteration with:
  - `@index` — Zero-based position
  - `@first` — Boolean, true for index 0
  - `@last` — Boolean, true for last index
- Push item as new context
- Push data frame to data stack
- Skip sparse array holes (use `in` operator)
- Pop stacks after each iteration

**Test cases:**

- Array of strings
- Array of objects
- Empty array → render else block
- `{{this}}` in loop → current item
- `{{@index}}` increments correctly
- `{{@first}}` true only for index 0
- `{{@last}}` true only for last index
- Sparse arrays skip holes: `[1, , 3]`

### Feature 5.4: #each Helper — Object Iteration

**Requirements:**

- Use `Object.keys()` for iteration order
- Handle empty objects → render inverse block
- Create data frame per iteration with:
  - `@key` — Property name
  - `@index` — Zero-based position
  - `@first` — Boolean, true for first property
  - `@last` — Boolean, true for last property
- Push property value as new context
- **Critical:** Use delayed iteration pattern to detect `@last`
  - Process previous iteration when starting next
  - Allows lookahead to set `last` flag correctly

**Test cases:**

- Object property iteration
- `{{@key}}` contains property name
- `{{this}}` contains property value
- `{{@index}}` increments per property
- `{{@first}}` true for first property
- `{{@last}}` true for last property (uses lookahead)
- Empty object → render else block
- Iteration order follows `Object.keys()`

### Feature 5.5: #with Helper

**Requirements:**

- Resolve context object using path expression
- Handle empty/null → render inverse block
- Use `isEmpty()` for truthiness check
- Push object as new context
- Create new data frame
- Render main block with new context
- No inverse block: render empty string

**Test cases:**

- `{{#with user}}{{name}}{{/with}}` accesses user properties
- `{{#with user}}{{../parentProp}}{{/with}}` accesses parent
- Null/undefined/empty object → render else block
- Nested with blocks

### Feature 5.6: Nested Blocks

**Requirements:**

- Both context stack and data stack must be maintained correctly
- Each level has independent data frame
- Parent context accessible via `../`
- Data variables (`@index`, etc.) scoped to current frame only

**Test cases:**

- Two-level nested `#each`
- Access outer item in inner loop: `{{../outerProp}}`
- Access outer `@index` not possible (data variables are scoped to current frame)
- Three-level nesting
- Mixed array and object iteration
- `#with` nested in `#each` and vice versa

---

## Capability 6: Helpers & Subexpressions

**Status:** ✅ Completed

**Goal:** Support runtime helper functions and nested helper calls in expressions

### Feature 6.1: SubExpression Parsing

Parse nested helper calls within expressions:

**SubExpression structure:**

- `type: 'SubExpression'`
- `path: PathExpression` — Helper name
- `params: Expression[]` — Arguments (can include nested SubExpressions)
- `hash: Hash` — Named parameters (reserved for future use)

**Requirements:**

- Recognize `(` token as subexpression start
- Parse helper name as PathExpression
- Parse parameters (can be nested subexpressions)
- Recognize `)` token as subexpression end
- Support arbitrary nesting depth

**Test cases:**

- Simple: `(gt x 1)` → SubExpression with 2 params
- Nested: `(and (gt x 1) (lt x 10))` → SubExpression with 2 SubExpression params
- Multiple params: `(add a b c)`
- String literals in params: `(eq status "active")`

### Feature 6.2: SubExpression Evaluation

Evaluate subexpressions by calling helpers:

**Requirements:**

- Resolve helper name from path
- Evaluate all parameters recursively (depth-first)
- Call helper function with evaluated params
- Return helper result for use in parent expression
- Handle missing helpers → throw clear error

**Test cases:**

- `(gt 5 3)` → `true`
- `(not true)` → `false`
- `(eq "foo" "foo")` → `true`
- Nested: `(and (gt x 5) (lt x 10))` evaluates inner expressions first
- Unknown helper throws error

### Feature 6.3: Built-in Comparison Helpers

Implement standard comparison helpers needed for conditionals:

**Comparison helpers:**

- `eq(a, b)` — Strict equality (`a === b`)
- `ne(a, b)` — Not equal (`a !== b`)
- `lt(a, b)` — Less than (`a < b`)
- `lte(a, b)` — Less than or equal (`a <= b`)
- `gt(a, b)` — Greater than (`a > b`)
- `gte(a, b)` — Greater than or equal (`a >= b`)

**Logical helpers:**

- `and(...args)` — Logical AND (all truthy)
- `or(...args)` — Logical OR (any truthy)
- `not(value)` — Logical NOT

**Requirements:**

- All helpers work with any value types
- Use Handlebars truthiness rules (not JavaScript)
- Comparison helpers do type coercion like JavaScript operators
- Logical helpers use `isEmpty()` for truthiness

**Test cases:**

- `{{#if (gt score 80)}}` with various scores
- `{{#if (eq status "active")}}` string comparison
- `{{#if (and isValid hasPermission)}}` multiple conditions
- `{{#if (or (eq role "admin") (eq role "owner"))}}` chained conditions
- `{{#if (not isDisabled)}}` negation

### Feature 6.4: Runtime Helper Registry

Support user-provided helpers passed at render time:

**Requirements:**

- Accept `helpers` option in render/compile API
- Merge with built-in helpers (user helpers can override built-ins)
- Look up helper by name during evaluation
- Pass evaluated arguments to helper function
- Pass context as `this` binding
- Return helper result

**Helper function signature:**

```typescript
type Helper = (this: any, ...args: any[]) => any;
```

**Test cases:**

- Custom helper: `helpers: { uppercase: (str) => str.toUpperCase() }`
- Helper with multiple args: `helpers: { add: (a, b) => a + b }`
- Helper accessing context: `function() { return this.value }`
- Override built-in helper
- Unknown helper throws error

### Feature 6.5: Helper Detection

Distinguish between variable lookups and helper calls:

**Requirements:**

- If MustacheStatement/BlockStatement has params → it's a helper call
- If no params and name exists in helper registry → it's a helper call
- Otherwise → it's a variable lookup
- Scoped paths (starting with `./` or `this.`) are never helpers

**Test cases:**

- `{{uppercase name}}` with params → helper call
- `{{uppercase}}` no params, helper exists → helper call
- `{{uppercase}}` no params, no helper → variable lookup
- `{{./uppercase}}` scoped → variable lookup (even if helper exists)
- `{{this.uppercase}}` scoped → variable lookup

---

## Capability 7: Output Generation

**Status:** ✅ Completed

**Goal:** Walk AST and generate final string output

### Feature 7.1: Interpreter Main Loop

**Requirements:**

- Accept Program node and context/data stacks
- Iterate over statement array
- Delegate to appropriate evaluator per statement type
- Concatenate all output strings
- Handle null programs → empty string

**Statement types:**

- `ContentStatement` → return raw content
- `MustacheStatement` → resolve and escape
- `BlockStatement` → evaluate helper
- `CommentStatement` → return empty string

### Feature 7.2: Mustache Evaluation

**Requirements:**

- Resolve path expression using context/data stacks
- Convert value to string:
  - `null`/`undefined` → `""`
  - Strings → unchanged
  - Other types → coerce with `+ ''`
- Apply escaping if `escaped: true`
- Return unescaped if `escaped: false`

**Test cases:**

- String values
- Number values → stringified
- Boolean values → `"true"` / `"false"`
- Null/undefined → `""`
- Objects → `"[object Object]"` (primitive coercion)
- Escaped vs unescaped output

### Feature 7.3: Block Evaluation

**Requirements:**

- Extract helper name from path
- Dispatch to appropriate helper function:
  - `if` → evaluateIfBlock
  - `unless` → evaluateUnlessBlock
  - `each` → evaluateEachBlock
- Throw error for unknown helpers
- Pass block node and stacks to helper

**Test cases:**

- All built-in helpers work
- Unknown helper throws clear error
- Nested blocks maintain separate stacks

---

## Capability 8: Public API

**Status:** ✅ Completed

**Goal:** Provide clean, simple API matching Handlebars conventions

### Feature 8.1: render() Function

**Signature:**

```typescript
async function render(
  template: string,
  context: any,
  options?: {
    helpers?: Record<string, Helper>;
  },
): Promise<string>;
```

**Requirements:**

- Lex template string to tokens
- Parse tokens to AST
- Initialize context stack with context
- Initialize data stack with `{ root: context }`
- Merge built-in helpers with provided helpers (user helpers override built-ins)
- Evaluate AST and return output string
- Throw errors with position info on failure

**Test cases:**

- Simple: `await render('Hello {{name}}', { name: 'World' })`
- With helpers: `await render('{{uppercase name}}', { name: 'foo' }, { helpers: { uppercase: (s) => s.toUpperCase() } })`
- Complex templates with all features
- Empty context
- Null context

### Feature 8.2: compile() Function

**Signature:**

```typescript
function compile(template: string): CompiledTemplate;

interface CompiledTemplate {
  render(context: any, options?: { helpers?: Record<string, Helper> }): string;
}
```

**Requirements:**

- Lex and parse once (up-front)
- Return object with `render(context, options)` method
- Cache AST for reuse
- Each render call initializes fresh stacks
- Same template can be rendered with different contexts and helpers

**Test cases:**

- Compile once, render multiple times
- Different contexts produce different output
- Different helpers per render call
- AST is cached (not re-parsed)

### Feature 8.3: Error Handling

**Requirements:**

- Custom error class: `TemplateError`
- Include line and column numbers when available
- Clear error messages for common issues
- Position tracking throughout lexer/parser

**Error types:**

- **Lexer errors:** Unclosed comment, invalid syntax, unclosed string
- **Parser errors:** Unmatched blocks, invalid nesting, unexpected token
- **Runtime errors:** Unknown helper, missing required data

**Test cases:**

- Unclosed block: `{{#if condition}}` → Error with line number
- Mismatched block: `{{#if}}{{/each}}` → Clear error message
- Unknown helper: `{{#unknown}}` → Error naming the helper
- Position tracking in multi-line templates

---

## Implementation Order

1. **Capability 1** (Lexer) — Tokenize templates including subexpressions
2. **Capability 2** (Parser) — Build AST from tokens including SubExpression nodes
3. **Capability 3** (Runtime Utilities) — Core functions for evaluation
4. **Capability 4** (Interpreter Core) — Path resolution and basic evaluation
5. **Capability 5** (Block Helpers) — #if, #unless, #each, #with
6. **Capability 6** (Helpers & Subexpressions) — Built-in helpers, runtime helpers, subexpression evaluation
7. **Capability 7** (Output Generation) — Complete interpreter loop
8. **Capability 8** (Public API) — Export clean interface with helpers option

Each capability should be test-driven: write tests first based on Handlebars behavior, then implement until tests pass.
