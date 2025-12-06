# @wonder/templates — V1 Implementation Plan

## Overview

Version 1 provides the core template rendering capabilities needed for LLM prompt templates in multi-judge workflows. Implementation follows a layered architecture: Tokenizer → Parser → Interpreter.

---

## Capability 1: Template Parsing

**Goal:** Transform template strings into executable AST without using `eval()` or `new Function()`

### Feature 1.1: Tokenization

- Scan template string and produce token stream
- Recognize mustache delimiters: `{{`, `}}`
- Distinguish between text and template tokens
- Handle escaped delimiters (if needed)

**Test cases:**
- Plain text with no templates
- Single `{{variable}}`
- Multiple variables
- Mixed text and variables
- Triple-stache `{{{unescaped}}}`
- Malformed input (unmatched braces)

### Feature 1.2: Token Classification

- Identify token types: `text`, `variable`, `block_start`, `block_end`, `comment`
- Parse variable expressions: `variable`, `object.property`, `../parent`
- Parse block expressions: `#if`, `#each`, `#unless`, `/if`, `/each`, `/unless`
- Parse modifiers: `else`

**Test cases:**
- Simple variables: `{{name}}`
- Nested properties: `{{user.profile.name}}`
- Parent access: `{{../parentVar}}`
- Block starts: `{{#if condition}}`
- Block ends: `{{/if}}`
- Comments: `{{! this is ignored }}`

### Feature 1.3: AST Construction

- Build hierarchical tree from flat token stream
- Match block starts with block ends
- Nest blocks appropriately
- Validate structure (balanced blocks, valid nesting)

**Test cases:**
- Single-level block
- Nested blocks (2+ levels deep)
- Multiple blocks at same level
- Invalid nesting (unmatched blocks)
- Empty blocks

---

## Capability 2: Context Resolution

**Goal:** Look up values from context objects with support for nested properties and scope chains

### Feature 2.1: Simple Variable Lookup

- Resolve variable names from context object
- Handle undefined/null values gracefully
- Support primitive types (string, number, boolean)

**Test cases:**
- Existing variable
- Undefined variable
- Null variable
- Different primitive types

### Feature 2.2: Nested Property Access

- Parse dot notation: `object.property.nested`
- Traverse object hierarchies
- Handle missing intermediate objects
- Support array index access

**Test cases:**
- Two-level nesting: `user.name`
- Deep nesting: `a.b.c.d.e`
- Missing intermediate: `user.address.city` when `address` is undefined
- Array access: `items.0.name`

### Feature 2.3: Scope Chain Management

- Maintain stack of context scopes
- Support `{{this}}` for current scope
- Support `{{../variable}}` for parent scope
- Support `{{../../variable}}` for grandparent scope

**Test cases:**
- Access current scope with `{{this}}`
- Access parent scope: `{{#each items}}{{../parentVar}}{{/each}}`
- Access grandparent: nested blocks with `{{../../topLevelVar}}`
- Undefined parent access

---

## Capability 3: Output Rendering

**Goal:** Convert AST + context into final string output with proper escaping

### Feature 3.1: Text and Variable Output

- Render text nodes as-is
- Render variable nodes with resolved values
- Convert non-string values to strings (JSON for objects/arrays)
- Handle undefined/null as empty string

**Test cases:**
- Plain text
- String variables
- Number variables
- Boolean variables
- Object variables (JSON stringified)
- Undefined/null variables

### Feature 3.2: HTML Escaping

- Escape HTML characters by default: `<`, `>`, `&`, `"`, `'`
- Support unescaped output with `{{{variable}}}`
- Apply escaping only to string values, not primitives

**Test cases:**
- Escaped: `{{html}}` with `<script>alert('xss')</script>`
- Unescaped: `{{{html}}}` preserves tags
- Numbers don't get escaped
- Nested properties with HTML content

### Feature 3.3: Comments

- Recognize comment tokens
- Exclude from output entirely

**Test cases:**
- Single-line comment
- Multi-line comment
- Comment with mustache syntax inside
- Comment between variables

---

## Capability 4: Conditional Blocks

**Goal:** Support `{{#if}}` and `{{#unless}}` with truthiness evaluation and `{{else}}` clauses

### Feature 4.1: Truthiness Evaluation

- Evaluate condition expressions
- Apply JavaScript truthiness rules
- Support negation with `{{#unless}}`

**Test cases:**
- Truthy values: non-empty string, non-zero number, true, non-empty array, object
- Falsy values: empty string, 0, false, null, undefined, empty array
- `{{#if}}` with truthy/falsy
- `{{#unless}}` with truthy/falsy

### Feature 4.2: Block Conditional Rendering

- Render block content when condition is true
- Skip block content when condition is false
- Handle nested conditionals

**Test cases:**
- Single `{{#if}}` block
- `{{#if}}{{else}}{{/if}}` structure
- `{{#unless}}{{else}}{{/unless}}` structure
- Nested if inside if
- Nested if inside each

### Feature 4.3: Else Clause Handling

- Parse `{{else}}` as block modifier
- Render else content when condition is false
- Handle else in nested blocks

**Test cases:**
- If-else with true condition
- If-else with false condition
- Unless-else with true condition
- Unless-else with false condition
- Else in nested block doesn't affect parent

---

## Capability 5: Iteration Blocks

**Goal:** Support `{{#each}}` for arrays and objects with loop metadata

### Feature 5.1: Array Iteration

- Iterate over arrays
- Provide `{{this}}` as current item
- Support empty arrays
- Handle non-array values gracefully

**Test cases:**
- Iterate over strings array
- Iterate over objects array
- Empty array renders nothing
- Null/undefined doesn't error
- Iterate over primitives array (numbers, booleans)

### Feature 5.2: Loop Metadata Variables

- Provide `{{@index}}` (zero-based position)
- Provide `{{@first}}` (boolean, true for first item)
- Provide `{{@last}}` (boolean, true for last item)
- Scope metadata to current loop only

**Test cases:**
- Access `{{@index}}` in loop
- Access `{{@first}}` in first/non-first item
- Access `{{@last}}` in last/non-last item
- Metadata in nested loops (inner index doesn't override outer)

### Feature 5.3: Object Iteration

- Iterate over object properties
- Provide `{{@key}}` as property name
- Provide `{{this}}` as property value
- Maintain consistent iteration order

**Test cases:**
- Iterate over object properties
- Access `{{@key}}` and `{{this}}`
- Empty object renders nothing
- Nested objects

### Feature 5.4: Nested Iteration

- Support `{{#each}}` inside `{{#each}}`
- Maintain separate scope chains for each level
- Allow parent access with `../`
- Support deep nesting (3+ levels)

**Test cases:**
- Two-level nested iteration
- Access outer item in inner loop: `{{#each outer}}{{#each inner}}{{../outerProp}}{{/each}}{{/each}}`
- Three-level nesting
- Nested iteration with mixed arrays and objects

---

## Capability 6: API and Integration

**Goal:** Provide clean API for template compilation and rendering

### Feature 6.1: Render Function

- Accept template string and context
- Return rendered string
- Handle errors gracefully

**Test cases:**
- Simple render: `render('Hello {{name}}', { name: 'World' })`
- Complex render with all features
- Invalid template (parse error)
- Invalid context (missing required data)

### Feature 6.2: Compile Function

- Parse template once, reuse multiple times
- Return compiled template object with `render()` method
- Cache AST for performance

**Test cases:**
- Compile once, render multiple times with different contexts
- Compiled template is reusable
- Compilation errors are caught early

### Feature 6.3: Error Handling

- Provide clear error messages
- Include position information when possible
- Distinguish between parse errors and runtime errors

**Test cases:**
- Unmatched block error message
- Undefined variable in strict mode (future)
- Invalid syntax error message
- Runtime error (accessing property of undefined)

---

## Implementation Order

1. **Capability 1** (Parsing) — Foundation for everything else
2. **Capability 2** (Context Resolution) — Needed for output
3. **Capability 3** (Output) — Core rendering
4. **Capability 4** (Conditionals) — Independent block type
5. **Capability 5** (Iteration) — Most complex block type
6. **Capability 6** (API) — Polish and integration

Each capability should be implemented with its full feature set before moving to the next, with tests validating each feature as it's completed.
