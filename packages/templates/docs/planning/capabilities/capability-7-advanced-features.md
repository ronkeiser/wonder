# Capability 7: Advanced Context & Parsing Features

**Status:** `[ ]` Not Started

**Goal:** Implement advanced features needed for 100% Handlebars basic spec compatibility. These features extend the core capabilities with function invocation, literal syntax, hyphenated identifiers, whitespace control, SafeString support, Map objects, and complex escaping.

**Reference:** Handlebars `basic.test.js` from handlebars-spec, specifically advanced context resolution patterns and literal syntax parsing

**Summary:**

- Feature 7.1: Context Function Invocation - Call functions found in context
- Feature 7.2: Implicit Block Iteration - Arrays/booleans as block helpers
- Feature 7.3: Literal Bracket Syntax - Parse `{{[foo bar]}}` for special chars
- Feature 7.4: Literal Value Context Keys - Support `{{"string"}}`, `{{42}}`, `{{true}}`
- Feature 7.5: Hyphenated Identifiers - Parse `{{foo-bar}}` as single identifier
- Feature 7.6: Whitespace Control - Parse and handle `{{~` syntax
- Feature 7.7: SafeString Support - Bypass escaping for wrapped values
- Feature 7.8: Map Object Support - Resolve properties from Map instances
- Feature 7.9: Complex Backslash Escaping - Handle `\\{{` and `\\\\{{`
- Feature 7.10: This Keyword Validation - Enforce `this` placement rules

**Dependencies:**

- Capability 4: Context Resolution (✅ Complete)
- Capability 5: Block Helpers (✅ Complete)
- Capability 6: Helpers & Subexpressions (✅ Complete)

---

## Feature 7.1: Context Function Invocation

**Goal:** When a context variable resolves to a function, call it automatically and use the return value

### Task C7-F1-T1: Implement Function Detection in evaluateMustache

**Status:** `[ ]` Not Started

- After variable lookup in `evaluateMustache()`:
  - Check if resolved `value` is a function using `typeof value === 'function'`
  - If function and not a helper call (no params):
    - Call the function with current context as `this` binding
    - Use: `value.call(context)`
    - Replace `value` with the function's return value
  - Continue with normal string conversion and escaping
- Functions are called with no arguments for simple mustache statements
- Helper calls (with params) take precedence over function invocation

**Deliverable:** Modified `evaluateMustache()` in `src/interpreter/interpreter.ts`

**Tests:**

- Simple function: `{{awesome}}` with `{awesome: () => 'Awesome'}` → `'Awesome'`
- Function bound to context: `{{awesome}}` with `{awesome: function() { return this.more; }, more: 'More'}` → `'More awesome'`
- Function returning SafeString (tested in Feature 7.7)
- Function vs helper precedence: Helpers take priority if params exist
- Nested function: `{{user.getName}}` calls function at nested path
- Function returning null/undefined → empty string

---

## Feature 7.2: Implicit Block Iteration

**Goal:** Allow arrays and booleans in context to act as block helpers without explicit `#each` or `#if`

### Task C7-F2-T1: Implement Implicit Block Helper Fallback

**Status:** `[ ]` Not Started

- Modify `evaluateBlock()` when helper not found:
  - Instead of throwing "Unknown block helper", resolve the path as context value
  - If value is an array:
    - Iterate like `#each` helper
    - Push each item to context stack
    - Create data frame with `@index`, `@first`, `@last`
    - Evaluate `node.program` for each item
  - If value is a boolean:
    - Render `node.program` if `true`
    - Render `node.inverse` if `false`
  - If value is a function:
    - Call function with options object (Feature 7.2-T2)
  - If value is falsy or missing:
    - Render `node.inverse` (else block) if present
- This allows `{{#goodbyes}}{{.}}{{/goodbyes}}` to work without registering a helper

**Deliverable:** Modified `evaluateBlock()` in `src/interpreter/interpreter.ts`

**Tests:**

- Array iteration: `{{#goodbyes}}{{this}}{{/goodbyes}}` with `{goodbyes: ['a', 'b']}` → `'ab'`
- Boolean true: `{{#goodbye}}YES{{/goodbye}}` with `{goodbye: true}` → `'YES'`
- Boolean false: `{{#goodbye}}YES{{/goodbye}}` with `{goodbye: false}` → `''`
- Nested objects in array: `{{#items}}{{name}}{{/items}}` → Access properties of each item
- Empty array: Renders inverse block if present
- Function as block (tested in Feature 7.2-T2)

### Task C7-F2-T2: Implement Block Function Invocation

**Status:** `[ ]` Not Started

- When block helper path resolves to a function:
  - Create options object with structure matching Handlebars:
    - `fn`: Function that evaluates `node.program` - `fn(context)` renders main block with new context
    - `inverse`: Function that evaluates `node.inverse` - `inverse()` renders else block
    - `data`: Current data frame (reference to top of data stack)
    - `hash`: Empty object (V1 has no hash support)
  - Call function with: `func.call(context, ...params, options)` where:
    - `this` is bound to current context
    - `params` are evaluated parameter expressions
    - `options` is last argument
  - Use function's return value as block output
- Block functions have full control:
  - Can render `options.fn()` or `options.inverse()`
  - Can pass new context to `fn()`: `options.fn(newContext)`
  - Can return custom string without calling fn/inverse
- **CRITICAL**: `options.fn` and `options.inverse` must maintain interpreter state:
  - Create closures that capture current context/data stacks
  - When called, evaluate program with provided context (or current if none)

**Deliverable:** Block function support in `evaluateBlock()`

**Tests:**

- Block function with context: `{{#awesome 1}}inner {{.}}{{/awesome}}` with function that calls `options.fn(context)` → `'inner 1'`
- Block function without params: `{{#awesome}}inner{{/awesome}}` with function that calls `options.fn(this)` → `'inner'`
- Pathed block function: `{{#foo.awesome}}inner{{/foo.awesome}}` → Works with nested functions
- Depthed block function: `{{#with value}}{{#../awesome}}inner{{/../awesome}}{{/with}}` → Works with parent context functions
- Function controls output: Block function can return custom string or call `fn()`/`inverse()`

---

## Feature 7.3: Literal Bracket Syntax

**Goal:** Parse `{{[foo bar]}}` to access properties with spaces, special characters, or reserved names

### Task C7-F3-T1: Add OPEN_SEXPR Token Support in Lexer

**Status:** `[ ]` Not Started

- Detect `[` inside mustache as start of literal segment
- Create `OPEN_SEXPR` token (reuse from subexpressions)
- Track nesting level to handle brackets in expressions
- Scan until matching `]` found
- Content between brackets is literal string (property name)

**Deliverable:** Modified lexer in `src/lexer/lexer.ts`

**Tests:**

- Tokenize `{{[foo bar]}}` → `OPEN_MUSTACHE`, `OPEN_SEXPR`, `ID('foo bar')`, `CLOSE_SEXPR`, `CLOSE_MUSTACHE`
- Tokenize `{{[@alan]}}` → Handles @ in bracket literals
- Tokenize `{{[foo[bar]}}` → Handles bracket characters inside
- Nested paths: `{{[foo bar]/expression}}` → Literal segment in path

### Task C7-F3-T2: Parse Bracket Literals in Parser

**Status:** `[ ]` Not Started

- In `parsePathExpression()`:
  - Detect `OPEN_SEXPR` token as start of literal segment
  - Extract literal string from tokens between `[` and `]`
  - Add literal string as single path part
  - Continue parsing rest of path normally
- Handle bracket literals in:
  - Simple paths: `{{[foo bar]}}`
  - Nested paths: `{{[foo bar]/nested}}`
  - First segment: `{{[first]/rest}}`
  - Middle segment: `{{start/[middle]/end}}`

**Deliverable:** Modified `parsePathExpression()` in `src/parser/parser.ts`

**Tests:**

- Simple bracket: `{{[foo bar]}}` → PathExpression with parts: `['foo bar']`
- Nested after bracket: `{{[@alan]/expression}}` → parts: `['@alan', 'expression']`
- Multiple brackets: `{{[foo bar]/[baz qux]}}` → parts: `['foo bar', 'baz qux']`
- Integration: Full template evaluation with bracket syntax

---

## Feature 7.4: Literal Value Context Keys

**Goal:** Support string, number, and boolean literals as context lookup keys: `{{"foo"}}`, `{{42}}`, `{{true}}`

### Task C7-F4-T1: Parse String Literals as Context Keys

**Status:** `[ ]` Not Started

- In `parseMustacheStatement()` and `parseBlockStatement()`:
  - If path is a `StringLiteral` expression:
    - Convert to PathExpression with `parts: [literal.value]`
    - Set `depth: 0`, `data: false`
    - Use literal value as context key
- String literals use the string value as property name
- Empty string `{{""}}` looks up empty string property

**Deliverable:** Modified mustache/block parsing in `src/parser/parser.ts`

**Tests:**

- Double quotes: `{{"foo"}}` with `{foo: 'bar'}` → `'bar'`
- Single quotes: `{{'foo'}}` with `{foo: 'bar'}` → `'bar'`
- Special chars: `{{"foo[bar"}}` with `{'foo[bar': 'baz'}` → `'baz'`
- Escaped quotes: `{{"foo'bar"}}` and `{{'foo"bar'}}` → Handle quotes in strings
- Empty string: `{{""}}` with `{'': 'value'}` → `'value'`
- String literal in block: `{{#"foo"}}{{.}}{{/"foo"}}` → Iterate over property

### Task C7-F4-T2: Parse Number Literals as Context Keys

**Status:** `[ ]` Not Started

- If path is a `NumberLiteral` expression:
  - Convert to PathExpression with `parts: [String(literal.value)]`
  - Use number converted to string as property name
- Integer literals: `{{12}}` → Look up property `"12"`
- Decimal literals: `{{12.34}}` → Look up property `"12.34"`
- Numbers can be used as helper names with params: `{{12.34 1}}`

### Task C7-F4-T3: Parse Boolean Literals as Context Keys

**Status:** `[ ]` Not Started

- If path is a `BooleanLiteral` expression:
  - Convert to PathExpression with `parts: [String(literal.value)]`
  - Use boolean converted to string as property name
- `{{true}}` → Look up property `"true"` (not the boolean `true`)
- `{{false}}` → Look up property `"false"` (not the boolean `false`)
- **CRITICAL**: This is STRING lookup, not boolean evaluation:
  - `{{true}}` with no `"true"` property → `''` (empty)
  - `{{true}}` with `{true: 'foo'}` → `''` (empty, because looking up string `"true"` not boolean key)
  - `{{false}}` with `{false: 'foo'}` → `'foo'` (string key `"false"` exists)
- Note: Boolean context keys are rare but must be supported for spec compliance

**Deliverable:** Boolean literal context support in parser

**Tests:**

- True literal no match: `{{true}}` with `{true: 'foo'}` → `''` (empty - string "true" != boolean true)
- True literal string match: `{{true}}` with `{"true": 'foo'}` → `'foo'` (matches string key)
- False literal: `{{false}}` with `{false: 'foo'}` → `'foo'` (matches property false)
- Empty context: `{{true}}` with no properties → `''`
- Boolean in subexpression: `{{foo (false)}}` → Pass false to helper
- Note: Boolean context keys are rare but must be supported for spec compliance

**Deliverable:** Boolean literal context support in parser

**Tests:**

- True literal: `{{true}}` with `{true: 'foo'}` → Should return `''` (spec behavior)
- False literal: `{{false}}` with `{false: 'foo'}` → `'foo'`
- Boolean in subexpression: `{{foo (false)}}` → Pass false to helper

---

## Feature 7.5: Hyphenated Identifiers

**Goal:** Parse `{{foo-bar}}` as a single identifier, not as `foo minus bar`

### Task C7-F5-T1: Modify Lexer to Handle Hyphens in Identifiers

**Status:** `[ ]` Not Started

- In identifier scanning (lexer):
  - After scanning initial identifier characters `[a-zA-Z_$]`
  - Continue scanning if next char is `-` followed by more identifier chars
  - Include hyphens in the `ID` token value
  - Example: `foo-bar-baz` → Single `ID` token with value `"foo-bar-baz"`
- Do NOT treat `-` as separate `MINUS` token when inside identifier

**Deliverable:** Modified identifier scanning in `src/lexer/lexer.ts`

**Tests:**

- Tokenize `{{foo-bar}}` → `OPEN_MUSTACHE`, `ID('foo-bar')`, `CLOSE_MUSTACHE`
- Multiple hyphens: `{{foo-bar-baz}}` → Single token `'foo-bar-baz'`
- Leading hyphen: `{{-foo}}` → Should not be valid identifier (starts with hyphen)
- Trailing hyphen: `{{foo-}}` → Should not be valid identifier (ends with hyphen)

### Task C7-F5-T2: Test Hyphenated Identifier Resolution

**Status:** `[ ]` Not Started

- Parser should already handle hyphenated IDs correctly once lexer is fixed
- Path resolution should work with hyphenated property names
- Test integration with:
  - Simple paths: `{{foo-bar}}`
  - Nested paths: `{{foo.foo-bar}}`
  - Paths with `/` separator: `{{foo/foo-bar}}`

**Deliverable:** Integration tests for hyphenated identifiers

**Tests:**

- Simple hyphen: `{{foo-bar}}` with `{'foo-bar': 'baz'}` → `'baz'`
- Nested hyphen: `{{foo.foo-bar}}` with `{foo: {'foo-bar': 'baz'}}` → `'baz'`
- Path separator: `{{foo/foo-bar}}` with `{foo: {'foo-bar': 'baz'}}` → `'baz'`

---

## Feature 7.6: Whitespace Control

**Goal:** Parse and implement `{{~` syntax to trim whitespace from adjacent content

### Task C7-F6-T1: Add Whitespace Control Tokens to Lexer

**Status:** `[ ]` Not Started

- Detect `~` character immediately after `{{` or `{{!` or `{{!--`
- Detect `~` character immediately before `}}` or `--}}`
- Create token flags or special tokens:
  - `OPEN_MUSTACHE` with `stripLeft: true` for `{{~`
  - `CLOSE_MUSTACHE` with `stripRight: true` for `~}}`
  - Same for comments: `{{~!` and `!~}}`
- Store whitespace control flags on statement nodes

**Deliverable:** Modified lexer with whitespace control token support

**Tests:**

- Tokenize `{{~foo~}}` → OPEN_MUSTACHE (stripLeft), ID, CLOSE_MUSTACHE (stripRight)
- Tokenize `{{~foo}}` → Only stripLeft
- Tokenize `{{foo~}}` → Only stripRight
- Comment whitespace: `{{~! comment ~}}` → Strip both sides

### Task C7-F6-T2: Implement Whitespace Stripping in Interpreter

**Status:** `[ ]` Not Started

- Add `strip` flags to AST nodes:
  - `MustacheStatement.strip?: {left?: boolean, right?: boolean}`
  - `CommentStatement.strip?: {left?: boolean, right?: boolean}`
- In interpreter, when evaluating statements:
  - If `node.strip.left === true`: Trim trailing whitespace from previous ContentStatement
  - If `node.strip.right === true`: Trim leading whitespace from next ContentStatement
- Modify adjacent ContentStatements directly in evaluation
- Handle edge cases:
  - First statement in program (no previous content)
  - Last statement in program (no next content)
  - Multiple consecutive strip directives

**Deliverable:** Whitespace stripping in `src/interpreter/interpreter.ts`

**Tests:**

- Strip right: `{{! comment ~}}      blah` → `'blah'`
- Strip left: `    {{~! comment}}blah` → `'blah'`
- Strip both: `    {{~! comment ~}}      blah` → `'blah'`
- Strip on mustache: `    {{~foo~}}    ` → No surrounding spaces
- Multiple strips: Consecutive whitespace control directives work correctly

---

## Feature 7.7: SafeString Support

**Goal:** Define SafeString class/interface that bypasses HTML escaping

### Task C7-F7-T1: Define SafeString Class

**Status:** `[ ]` Not Started

- Create `SafeString` class:
  - Constructor: `constructor(string: string)`
  - Store the unescaped HTML string
  - Method: `toHTML(): string` or `toString(): string` returns the stored string
  - Property or method to identify as SafeString
- Export SafeString from template engine for user code
- SafeStrings can be returned from helper functions

**Deliverable:** `src/runtime/safe-string.ts` with SafeString class

**Tests:**

- Create SafeString: `new SafeString('<b>bold</b>')` → Stores string
- Call toHTML: `safeString.toHTML()` → Returns original string
- Type check: `value instanceof SafeString` → true

### Task C7-F7-T2: Bypass Escaping for SafeStrings

**Status:** `[ ]` Not Started

- In `evaluateMustache()` after resolving value:
  - Check if `value instanceof SafeString`
  - If SafeString and `node.escaped === true`:
    - Skip `escapeExpression()`
    - Use `value.toString()` or `value.toHTML()` directly
  - If `node.escaped === false` (triple-stash):
    - Already unescaped, use value as-is
- Functions returning SafeStrings get automatic no-escape treatment

**Deliverable:** SafeString detection in interpreter

**Tests:**
### Task C7-F7-T3: Export SafeString from Template Engine

**Status:** `[ ]` Not Started

- Export SafeString class from main template engine module
- Make it available via:
  - Named export: `import { SafeString } from '@wonder/templates'`
  - **CRITICAL**: Tests use `Handlebars.SafeString` - need to ensure compatibility:
    - Export as `SafeString` from main module
    - Test helper likely provides `Handlebars` namespace with `SafeString` property
    - Verify test setup provides `new Handlebars.SafeString(...)` access
- Document SafeString usage in README
- Update TypeScript types

**Deliverable:** SafeString exported from `src/index.ts`

**Tests:**

- Import SafeString: `import { SafeString } from '@wonder/templates'` → Works
- Create and use: User code can create SafeString instances
- Test compatibility: `new Handlebars.SafeString(...)` works in test context
- Integration: SafeStrings work in templatesrc/index.ts`

**Tests:**

- Import SafeString: `import { SafeString } from '@wonder/templates'` → Works
- Create and use: User code can create SafeString instances
- Integration: SafeStrings work in templates

---

## Feature 7.8: Map Object Support

**Goal:** Resolve properties from JavaScript Map objects using `.get()` instead of property access

### Task C7-F8-T1: Detect Map Objects in Path Resolution

**Status:** `[ ]` Not Started

- In `resolvePath()` function:
  - After getting `current` object for a path part
  - Check if `current instanceof Map`
  - If Map:
    - Use `current.get(part)` instead of `lookupProperty(current, part)`
    - Continue with resolved value
  - If not Map:
    - Continue with normal `lookupProperty()` access

**Deliverable:** Modified `resolvePath()` in `src/interpreter/path-resolver.ts`

**Tests:**

- Simple Map: `{{alan/expression}}` with `{alan: new Map([['expression', 'beautiful']])}` → `'beautiful'`
- Nested Map keys: Map with nested property paths
- Map in array: Array containing Map objects
- Missing Map key: `map.get('missing')` → `undefined` → `''`

### Task C7-F8-T2: Handle Map Edge Cases

**Status:** `[ ]` Not Started

- Maps with non-string keys:
  - Map keys can be any type (objects, numbers, etc.)
  - Try string key first: `map.get(part)`
  - If undefined, try number conversion: `map.get(Number(part))`
- Empty Maps: Return undefined for any key
- Map as root context: Context itself is a Map object
- Nested Maps: Map containing other Maps

**Deliverable:** Robust Map support in path resolution

**Tests:**

- Map with number keys: `new Map([[1, 'value']])` with `{{1}}` → `'value'`
- Map with object keys: Maps with non-primitive keys
- Empty Map: All lookups return empty string
- Root Map context: Template with Map as root → Works correctly

---

## Feature 7.9: Complex Backslash Escaping

**Goal:** Handle `\\{{`, `\\\\{{`, and other backslash escaping edge cases correctly

### Task C7-F9-T1: Review Current Backslash Escaping

**Status:** `[ ]` Not Started

- Document current lexer behavior:
  - `\{{` → Should output literal `{{` (backslash escapes the mustache)
  - `\\{{` → Should output literal `\` followed by evaluated mustache
  - `\\\\{{` → Should output `\\` followed by evaluated mustache
  - `\\\\ ` → Should output `\\ ` (no mustache, literal backslashes)
- Compare with Handlebars spec test expectations
- Identify specific failing patterns

**Deliverable:** Documentation of current vs expected behavior

**Tests:**

- Single escape: `\{{foo}}` → `'{{foo}}'` (literal mustache syntax)
- Double escape: `\\{{foo}}` with `{foo: 'food'}` → `'\food'` (backslash + value)
- Quad escape: `\\\\{{foo}}` with `{foo: 'food'}` → `'\\food'` (two backslashes + value)
- No mustache: `\\\\ ` → `'\\\\ '` (literal backslashes)

### Task C7-F9-T2: Fix Lexer Backslash Handling

**Status:** `[ ]` Not Started

- In lexer content scanning:
  - Track backslash count before `{{`
  - Even number of backslashes: Half go to output, mustache is processed
  - Odd number of backslashes: Half (rounded down) go to output, mustache is literal
- Examples:
  - `\{{` → 1 backslash (odd) → Output `{{` as content, no mustache
  - `\\{{` → 2 backslashes (even) → Output `\`, process mustache
  - `\\\\{{` → 4 backslashes (even) → Output `\\`, process mustache
  - `\\\{{` → 3 backslashes (odd) → Output `\{{`, no mustache

**Deliverable:** Modified content scanning in lexer

**Tests:**

- All backslash patterns from basic.test.ts:
  - `\{{foo}}` → `'{{foo}}'`
  - `content \{{foo}}` → `'content {{foo}}'`
  - `\\{{foo}}` → `'\food'`
  - `content \\{{foo}}` → `'content \food'`
  - `\\\\ {{foo}}` → `'\\\\ food'`
- Edge cases: Backslashes at start/end of content, multiple mustaches

### Task C7-F9-T3: Test Backslash Integration

**Status:** `[ ]` Not Started

- Run full basic spec tests for escaping section
- Verify all patterns work correctly:
  - Escaped mustache syntax
  - Backslash before variables
  - Multiple consecutive backslashes
  - Backslashes in various positions
- Test interaction with other features:
  - Backslashes + whitespace control
  - Backslashes + comments
---

## Feature 7.10: This Keyword Validation

**Goal:** Enforce Handlebars rules for `this` keyword placement in paths

### Task C7-F10-T1: Validate This Keyword in Parser

**Status:** `[ ]` Not Started

- In `parsePathExpression()` when building path parts:
  - Track if `this` keyword appears in path
  - `this` is ONLY valid:
    - At start of path: `{{this}}`, `{{this.prop}}`, `{{this/prop}}`
    - Inside brackets: `{{[this]}}`, `{{foo/[this]/bar}}`
  - `this` is INVALID:
    - After separator: `{{foo/this}}`, `{{foo.this.bar}}`, `{{text/this/foo}}`
    - In middle without brackets: Any position after first segment
  - When invalid `this` detected:
    - Throw error with message: `Invalid path: {path} - {line}:{column}`
    - Include full path in error for debugging

**Detection rules:**

- If parsing path part and it's `ID("this")`:
  - If it's the first part → Valid
  - If it's inside bracket literal `[this]` → Valid (handled as literal string)
  - If it's after a separator (depth > 0 or parts.length > 0) → Invalid

**Deliverable:** Path validation in `src/parser/parser.ts`

**Tests:**

- Valid this: `{{this}}`, `{{this.foo}}`, `{{this/foo}}` → Parse successfully
- Valid bracket this: `{{[this]}}`, `{{foo/[this]}}` → Parse successfully
- Invalid middle this: `{{text/this/foo}}` → Throw `Error: Invalid path: text/this - 1:13`
- Invalid nested this: `{{foo.this.bar}}` → Throw error
- In helper context: `{{foo this}}` → Valid (this as param, not in path)
- In helper param path: `{{foo text/this/bar}}` → Throw `Error: Invalid path: text/this - 1:17`

### Task C7-F10-T2: Test This Validation Integration

**Status:** `[ ]` Not Started

- Verify error messages match Handlebars format
- Test this validation in all contexts:
  - Mustache statements: `{{foo/this}}`
  - Block statements: `{{#foo/this}}...{{/foo/this}}`
  - Helper parameters: `{{helper foo/this}}`
  - Subexpressions: `{{helper (foo/this)}}`
- Ensure bracket syntax bypasses validation: `{{[this]}}` is literal string lookup

**Deliverable:** Integration tests for this validation

**Tests:**

- All invalid patterns throw correct errors
## Completion Criteria

Capability 7 is complete when:

- [ ] All 10 features implemented
- [ ] All tests in `packages/templates/test/validation/handlebars-spec/basic.test.ts` pass (100% success rate)
- [ ] No TypeScript errors in codebase
- [ ] Performance impact < 10% on hot paths
- [ ] Documentation updated with SafeString API
- [ ] Examples added for advanced features
- [ ] Block function `options` object matches Handlebars structure
- [ ] This keyword validation matches Handlebars error messages
The features should be implemented in this order for maximum efficiency:

1. **Feature 7.10** (This Validation) - Parser validation, prevents bad paths early
2. **Feature 7.1** (Context Functions) - Fastest win, modifies interpreter only
3. **Feature 7.2** (Implicit Blocks) - Interpreter changes, builds on 7.1
4. **Feature 7.4** (Literal Value Keys) - Parser changes for literals
5. **Feature 7.5** (Hyphenated IDs) - Lexer/parser changes
6. **Feature 7.8** (Map Support) - Simple path resolver change
7. **Feature 7.7** (SafeString) - New class + interpreter changes
8. **Feature 7.3** (Bracket Syntax) - More complex parser changes
9. **Feature 7.6** (Whitespace Control) - Lexer + interpreter changes
10. **Feature 7.9** (Backslash Escaping) - Complex lexer changesficiency:

1. **Feature 7.1** (Context Functions) - Fastest win, modifies interpreter only
2. **Feature 7.2** (Implicit Blocks) - Interpreter changes, builds on 7.1
3. **Feature 7.4** (Literal Value Keys) - Parser changes for literals
4. **Feature 7.5** (Hyphenated IDs) - Lexer/parser changes
5. **Feature 7.8** (Map Support) - Simple path resolver change
6. **Feature 7.7** (SafeString) - New class + interpreter changes
**Parallel work possible:**

- Features 7.1, 7.2, 7.7, 7.8 can be worked on in parallel (interpreter changes)
- Features 7.3, 7.4, 7.5, 7.6, 7.9, 7.10 can be worked on in parallel (lexer/parser changes)

**Critical Implementation Details:**

1. **Block Functions (7.2-T2)**: Options object must have working `fn()` and `inverse()` closures that maintain interpreter state
2. **Boolean Literals (7.4-T3)**: `{{true}}` looks up STRING key `"true"`, not boolean - verify lookup behavior
3. **SafeString Export (7.7-T3)**: Ensure test harness provides `Handlebars.SafeString` compatibility
4. **This Validation (7.10)**: Error messages must match format: `Invalid path: {path} - {line}:{column}`
### Testing Strategy

After each feature:

1. Run `pnpm run test:spec` to check basic.test.ts
2. Note which tests now pass
3. Fix any type errors immediately using `get_errors` tool
4. Commit working state before next feature

### Performance Considerations

**Hot path impact:**

- Feature 7.1 (Functions): One `typeof` check per mustache evaluation
- Feature 7.8 (Maps): One `instanceof` check per path segment
- Feature 7.7 (SafeString): One `instanceof` check per escaped output
- Minimize instanceof checks by caching or early returns

### Handlebars Compatibility

**Critical compatibility points:**

- Context functions vs helpers: Helpers take precedence (already implemented)
- Implicit blocks: Only for simple names, not pathed expressions
- Literal syntax: Must support all literal types (string, number, boolean, bracket)
- Whitespace control: Must match exact Handlebars stripping behavior
- SafeString: Must be compatible with Handlebars.SafeString API

### Security Considerations

**Security requirements:**

- Map support: Use `.get()` method, safe from prototype pollution
- Function invocation: Functions called with controlled context only
- SafeString: User responsibility to not create SafeStrings from untrusted input
- All other features maintain existing `lookupProperty()` security

---

## Completion Criteria

Capability 7 is complete when:

- [ ] All 9 features implemented
- [ ] All tests in `packages/templates/test/validation/handlebars-spec/basic.test.ts` pass (100% success rate)
- [ ] No TypeScript errors in codebase
- [ ] Performance impact < 10% on hot paths
- [ ] Documentation updated with SafeString API
- [ ] Examples added for advanced features

---

## Dependencies

**Required capabilities:**

- Capability 4: Context Resolution (✅ Complete) - Path resolution and stacks
- Capability 5: Block Helpers (✅ Complete) - Block evaluation logic
- Capability 6: Helpers & Subexpressions (✅ Complete) - Helper vs variable detection

**Blocks other capabilities:**

- None - This is an extension capability

**Parallel work possible:**

- Features 7.1, 7.2, 7.7, 7.8 can be worked on in parallel (interpreter changes)
- Features 7.3, 7.4, 7.5, 7.6, 7.9 can be worked on in parallel (lexer/parser changes)
