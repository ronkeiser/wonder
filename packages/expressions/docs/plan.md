# @wonder/expressions Implementation Plan

## Overview

Implement a pure expression evaluator for JSON data transformation, following the API and syntax defined in [design.md](./design.md). The implementation uses a classic lexer → parser → interpreter pipeline, adapted from `@wonder/templates` patterns where applicable.

Each phase includes its own tests. No phase is complete until its tests pass.

---

## Phase 1: Core Infrastructure

### 1.1 Lexer

Tokenize expression strings into a stream of tokens.

**Token types:**

| Category | Tokens |
|----------|--------|
| Identifiers | `foo`, `user`, `items` |
| String literals | `'hello'`, `"world"` (single and double quotes) |
| Number literals | `42`, `3.14`, `-17`, `0.5` |
| Boolean literals | `true`, `false` |
| Null literal | `null` |
| Arithmetic operators | `+`, `-`, `*`, `/`, `%` |
| Comparison operators | `===`, `!==`, `>`, `>=`, `<`, `<=` |
| Logical operators | `&&`, `\|\|`, `!` |
| Punctuation | `(`, `)`, `[`, `]`, `{`, `}`, `,`, `:`, `.`, `?` |
| Spread | `...` |

**Whitespace handling:** Ignore spaces, tabs, newlines between tokens.

**String escape sequences:** `\'`, `\"`, `\\`, `\n`, `\t`.

**Error cases:**
- Unterminated string literal
- Invalid character
- Invalid number format

**Position tracking:** Each token stores start line, column, and offset for error reporting.

**Tests:** Token generation for each type, error cases, position accuracy.

**Reference:** `@wonder/templates/src/lexer/`

### 1.2 AST Node Types

Define TypeScript interfaces for all AST nodes. Each node has a `type` discriminator and optional `loc` for source location.

| Node Type | Fields | Represents |
|-----------|--------|------------|
| `Literal` | `value: string \| number \| boolean \| null` | Primitive values |
| `Identifier` | `name: string` | Variable references |
| `MemberExpression` | `object`, `property`, `computed: boolean` | `a.b` or `a[b]` |
| `ArrayExpression` | `elements: (Expression \| SpreadElement)[]` | `[1, 2, ...arr]` |
| `ObjectExpression` | `properties: (Property \| SpreadElement)[]` | `{a: 1, ...obj}` |
| `Property` | `key`, `value`, `shorthand: boolean` | Object property |
| `SpreadElement` | `argument: Expression` | `...expr` |
| `BinaryExpression` | `operator`, `left`, `right` | `a + b`, `a > b` |
| `LogicalExpression` | `operator`, `left`, `right` | `a && b`, `a \|\| b` |
| `UnaryExpression` | `operator`, `argument` | `!a`, `-b` |
| `ConditionalExpression` | `test`, `consequent`, `alternate` | `a ? b : c` |
| `CallExpression` | `callee: Identifier`, `arguments: Expression[]` | `fn(a, b)` |

### 1.3 Parser

Transform token stream into AST using recursive descent parsing.

**Operator precedence (lowest to highest):**

1. Ternary (`?:`)
2. Logical OR (`||`)
3. Logical AND (`&&`)
4. Equality (`===`, `!==`)
5. Comparison (`>`, `>=`, `<`, `<=`)
6. Additive (`+`, `-`)
7. Multiplicative (`*`, `/`, `%`)
8. Unary (`!`, `-`)
9. Member access (`.`, `[]`)
10. Call (`()`)
11. Primary (literals, identifiers, grouping)

**Associativity:** All binary operators are left-associative. Ternary is right-associative.

**Ambiguity resolution:**
- `{` at expression start → object literal, not block
- `-` after operator → unary minus, otherwise binary minus

**Error recovery:** Report first error with position, do not attempt recovery.

**Tests:** AST structure for each construct, precedence validation, nested expressions, error messages with positions.

**Reference:** `@wonder/templates/src/parser/`

### 1.4 Interpreter

Evaluate AST nodes against a context object, returning JSON-compatible values.

**Identifier resolution:**
1. Look up identifier name in context object
2. Use secure `lookupProperty` to prevent prototype access
3. Return `undefined` for missing identifiers (not an error)

**Member expression evaluation:**
- Computed (`a[b]`): evaluate `b`, use result as key
- Non-computed (`a.b`): use literal property name
- Chain safely: `a.b.c` returns `undefined` if `a.b` is nullish

**Operator semantics:** Follow JavaScript semantics exactly, including:
- String concatenation with `+`
- Type coercion in comparisons
- Short-circuit evaluation for `&&` and `||`
- Ternary only evaluates the taken branch

**Function call evaluation:**
1. Verify callee is a known built-in function name
2. Evaluate all arguments
3. Call the function implementation with evaluated arguments
4. Return the result

**Immutability:** All operations return new values; context and intermediate values are never mutated.

**Tests:** Each operator, type coercion cases, short-circuit behavior, undefined propagation.

**Reference:** `@wonder/templates/src/interpreter/`

### 1.5 Runtime Utilities

Secure property access, adapted from `@wonder/templates/src/runtime/utils.ts`.

**`lookupProperty(object, key)`:**
- Return `undefined` if object is null/undefined
- Block dangerous keys: `__proto__`, `constructor`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`
- Only return own properties (not inherited)
- Support `Map` objects via `.get()`

**`resolvePath(object, parts[])`:**
- Walk through property path segments
- Return `undefined` if any intermediate value is nullish
- Use `lookupProperty` for each step

**Tests:** Prototype pollution attempts, null handling, Map support, inherited property blocking.

---

## Phase 2: Built-in Functions

Implement the function library. All functions are pure (no side effects) and return new values.

### 2.1 Array Functions

| Function | Behavior | Edge Cases |
|----------|----------|------------|
| `length(arr)` | Return array length | Non-array → error |
| `append(arr, item)` | Return new array with item at end | |
| `concat(a, b, ...)` | Return new array with all elements | Empty arrays, non-arrays |
| `first(arr)` | Return first element | Empty → `undefined` |
| `last(arr)` | Return last element | Empty → `undefined` |
| `slice(arr, start, end?)` | Return slice | Negative indices, out of bounds |
| `includes(arr, item)` | Return boolean | Uses strict equality |
| `unique(arr)` | Return array with duplicates removed | Object equality (reference) |
| `flatten(arr)` | Flatten one level | Non-arrays left as-is |
| `sort(arr)` | Return sorted copy | Natural string order, numbers |
| `reverse(arr)` | Return reversed copy | |

**Tests per function:** Normal case, empty array, single element, immutability verification.

### 2.2 Iterator Functions

These parse and evaluate a predicate expression string for each element.

| Function | Behavior | Short-circuits? |
|----------|----------|-----------------|
| `map(arr, expr)` | Transform each element | No |
| `filter(arr, expr)` | Keep elements where expr is truthy | No |
| `find(arr, expr)` | Return first element where expr is truthy | Yes, on first match |
| `every(arr, expr)` | Return true if all elements pass | Yes, on first failure |
| `some(arr, expr)` | Return true if any element passes | Yes, on first success |

**Predicate context:** Expression receives `item` (current element) and `index` (position).

**Predicate caching:** Compiled expressions should be cached per unique predicate string to avoid re-parsing.

**Tests:** Predicate with `item`, predicate with `index`, empty arrays, short-circuit verification, complex predicates.

### 2.3 Object Functions

| Function | Behavior | Edge Cases |
|----------|----------|------------|
| `keys(obj)` | Return array of own keys | Non-object → error |
| `values(obj)` | Return array of own values | |
| `entries(obj)` | Return array of `[key, value]` pairs | |
| `merge(a, b, ...)` | Shallow merge, later wins | Non-objects, empty |
| `pick(obj, keys[])` | Return object with only specified keys | Missing keys ignored |
| `omit(obj, keys[])` | Return object without specified keys | |
| `get(obj, path, default?)` | Deep access via dot-notation string | Missing → default or `undefined` |
| `has(obj, key)` | Return boolean for own property | |

**Tests per function:** Normal case, empty object, missing keys, immutability.

### 2.4 Math Functions

| Function | Behavior | Edge Cases |
|----------|----------|------------|
| `sum(arr)` | Sum of numbers | Empty → `0` |
| `avg(arr)` | Average of numbers | Empty → `NaN` or error? |
| `min(arr)` | Minimum value | Empty → `undefined` |
| `max(arr)` | Maximum value | Empty → `undefined` |
| `round(n, decimals?)` | Round to decimals (default 0) | Negative decimals |
| `floor(n)` | Floor | |
| `ceil(n)` | Ceiling | |
| `abs(n)` | Absolute value | |

**Decision needed:** Behavior of `avg([])` - return `NaN`, `undefined`, or throw?

**Tests:** Positive, negative, decimals, empty arrays, non-numbers in array.

### 2.5 String Functions

| Function | Behavior | Edge Cases |
|----------|----------|------------|
| `upper(str)` | Uppercase | Non-string → coerce or error? |
| `lower(str)` | Lowercase | |
| `trim(str)` | Trim whitespace | |
| `split(str, delim)` | Split into array | Empty delimiter, no matches |
| `join(arr, delim)` | Join with delimiter | Non-strings in array |
| `startsWith(str, prefix)` | Boolean | |
| `endsWith(str, suffix)` | Boolean | |
| `replace(str, find, repl)` | Replace first occurrence | No match → unchanged |
| `replaceAll(str, find, repl)` | Replace all occurrences | |
| `substring(str, start, end?)` | Extract substring | Negative indices, out of bounds |

**Tests:** Empty strings, unicode, boundary indices.

### 2.6 Type Functions

| Function | Returns `true` for |
|----------|-------------------|
| `isArray(val)` | Arrays only |
| `isObject(val)` | Plain objects (not arrays, not null) |
| `isString(val)` | Strings |
| `isNumber(val)` | Numbers (including `NaN`?) |
| `isBoolean(val)` | `true` or `false` |
| `isNull(val)` | `null` only |
| `isDefined(val)` | Not `null` and not `undefined` |
| `isEmpty(val)` | `null`, `undefined`, `''`, `[]`, `{}` |
| `type(val)` | Returns type string: `'string'`, `'number'`, `'boolean'`, `'null'`, `'array'`, `'object'` |

**Decision needed:** Should `isNumber(NaN)` return `true`?

**Tests:** All JSON types for each function, edge cases for `isEmpty`.

---

## Phase 3: Public API & Error Handling

### 3.1 Core Exports

**`evaluate(expression: string, context: Record<string, unknown>): unknown`**
- Parse expression
- Evaluate against context
- Return result
- Throws on syntax or runtime errors

**`compile(expression: string): CompiledExpression`**
- Parse expression once
- Return object with `evaluate(context)` method
- Reusable for multiple evaluations with different contexts

**CompiledExpression interface:**
- `evaluate(context: Record<string, unknown>): unknown`
- Holds parsed AST internally
- Each call evaluates against fresh context

**Tests:** Basic evaluation, compile-once-run-many, context isolation, error propagation.

### 3.2 Error Types

All errors include `expression` (the full input) and optional `position` (line, column, offset).

| Error Type | When Thrown |
|------------|-------------|
| `ExpressionSyntaxError` | Invalid syntax during parsing |
| `ExpressionReferenceError` | Unknown function name |
| `ExpressionTypeError` | Invalid operation (e.g., spread on non-iterable) |
| `ExpressionRangeError` | Limits exceeded |

**Error message format:** `"<message> at line <line>, column <col>"`

**Tests:** Each error type with position, message clarity.

---

## Phase 4: Security & Limits

### 4.1 Forbidden Syntax

Parser rejects these constructs with clear error messages:

| Construct | Detection | Error Message |
|-----------|-----------|---------------|
| Function definition | `function` keyword, arrow `=>` | "Function definitions are not allowed" |
| Assignment | `=`, `+=`, `-=`, etc. | "Assignment is not allowed" |
| Increment/decrement | `++`, `--` | "Increment/decrement operators are not allowed" |
| Loops | `for`, `while`, `do` | "Loops are not allowed" |
| `this` keyword | `this` token | "The 'this' keyword is not allowed" |
| `new` keyword | `new` token | "The 'new' keyword is not allowed" |
| Method calls | `obj.method()` | "Method calls are not allowed; use built-in functions" |
| Prototype access | `__proto__`, `constructor` as property | "Prototype access is not allowed" |

**Method call detection:** CallExpression where callee is MemberExpression (not plain Identifier).

**Tests:** Each forbidden construct triggers appropriate error.

### 4.2 Runtime Limits

| Limit | Default | Rationale |
|-------|---------|-----------|
| Expression length | 10,000 chars | Prevent DoS via huge expressions |
| Recursion depth | 100 | Nested ternaries, function calls |
| Array/object literal size | 1,000 elements | Prevent memory exhaustion |
| String literal length | 10,000 chars | Prevent memory exhaustion |

**Limit enforcement:**
- Expression length: check before parsing
- Recursion: track depth during interpretation, throw if exceeded
- Literal sizes: check during AST construction

**Configurability:** Limits can be overridden via options object (future consideration).

**Tests:** Each limit at boundary and over boundary.

---

## Implementation Order

1. **Lexer + tests** - tokenization of all token types
2. **AST type definitions** - TypeScript interfaces
3. **Parser + tests** - recursive descent, precedence, errors
4. **Runtime utilities + tests** - secure property access
5. **Interpreter (basic) + tests** - literals, identifiers, operators
6. **Public API + tests** - `evaluate`, `compile`
7. **Type functions + tests** - simplest category
8. **Math functions + tests** - straightforward
9. **String functions + tests** - straightforward
10. **Array functions (non-iterator) + tests**
11. **Object functions + tests**
12. **Iterator functions + tests** - predicate parsing
13. **Security hardening + tests** - forbidden syntax
14. **Limits + tests** - all runtime limits

---

## Open Questions

These require decisions before or during implementation:

1. **`avg([])`** - Return `NaN`, `undefined`, or throw?
2. **`isNumber(NaN)`** - Return `true` or `false`?
3. **Non-string to string functions** - Coerce or throw? (e.g., `upper(123)`)
4. **Unknown identifier** - Return `undefined` or throw `ReferenceError`?
5. **Method call on primitive** - Is `"hello".length` allowed via member access, or forbidden as method-like?

---

## Success Criteria

- All syntax from design.md is supported
- All built-in functions pass their test cases
- Security tests pass (no prototype pollution, forbidden syntax rejected)
- Cloudflare Workers compatible (no `eval`, no `new Function`)
- `@wonder/templates` patterns followed for consistency
