# Capability 4: Context Resolution & Interpreter

**Status:** `[~]` **IN PROGRESS**

**Goal:** Evaluate PathExpressions by traversing context scopes and data frames. This capability implements the core interpreter logic that resolves variables and navigates the context/data stacks.

**Reference:** Handlebars `runtime.js` implementation, specifically context resolution and scope chain management

**Summary:**

- Feature 4.1: Simple Path Resolution - Path walking with lookupProperty
- Feature 4.2: Depth-based Context Lookup - Parent scope access via `../`
- Feature 4.3: Data Variable Management - Loop metadata (@index, @first, etc.)
- Feature 4.4: Interpreter Core - AST traversal and evaluation

**Dependencies:**

- Capability 1: Lexer (✅ Complete)
- Capability 2: Parser & AST (✅ Complete)
- Capability 3: Runtime Utilities (✅ Complete)

---

## Feature 4.1: Simple Path Resolution

**Goal:** Walk path parts using `lookupProperty()` to resolve nested property access like `foo.bar.baz`

### Task C4-F1-T1: Implement resolvePath Function

**Status:** `[x]` Complete ✅

- Create `resolvePath()` function with signature:
  - `resolvePath(context: any, parts: string[]): any`
- Walk path parts sequentially:
  - Start with `context` as current object
  - For each part in `parts`:
    - Use `lookupProperty(current, part)` for security
    - If result is `null` or `undefined`, return `undefined`
    - Otherwise, set `current = result` and continue
  - Return final `current` value
- Handle empty parts array:
  - Empty parts means `{{this}}` — return context as-is

**Security Critical:** Must use `lookupProperty()` for all property access to prevent prototype pollution.

**Deliverable:** `src/interpreter/path-resolver.ts` with `resolvePath()` function

**Tests:**

- Single property: `resolvePath({foo: 'bar'}, ['foo'])` → `'bar'`
- Nested property: `resolvePath({a: {b: {c: 1}}}, ['a', 'b', 'c'])` → `1`
- Missing property: `resolvePath({foo: 'bar'}, ['baz'])` → `undefined`
- Missing intermediate: `resolvePath({foo: null}, ['foo', 'bar'])` → `undefined`
- Empty parts: `resolvePath({foo: 'bar'}, [])` → `{foo: 'bar'}`
- Array index access: `resolvePath({items: ['a', 'b']}, ['items', '0'])` → `'a'`
- Deep nesting: 5+ levels of property access
- Null context: `resolvePath(null, ['foo'])` → `undefined`
- Undefined context: `resolvePath(undefined, ['foo'])` → `undefined`

### Task C4-F1-T2: Handle Array Index Access

**Status:** `[x]` Complete ✅

- Array indices as string keys:
  - `['items', '0']` accesses `items[0]`
  - `['items', '1']` accesses `items[1]`
- Use `lookupProperty()` for array access:
  - Arrays have numeric indices as own properties
  - `lookupProperty(array, '0')` returns first element
- Handle out-of-bounds indices:
  - Return `undefined` for indices beyond array length
  - Return `undefined` for negative indices

**Deliverable:** Array index support in `resolvePath()`

**Tests:**

- Access first element: `['items', '0']` on `{items: ['a', 'b']}` → `'a'`
- Access second element: `['items', '1']` → `'b'`
- Out of bounds: `['items', '99']` → `undefined`
- Negative index: `['items', '-1']` → `undefined`
- Array of objects: `['items', '0', 'name']` → Access property of first item
- Sparse array: `[1, , 3]` with index '1' → `undefined`
- Nested arrays: `['matrix', '0', '1']` → Access [0][1]

### Task C4-F1-T3: Handle Edge Cases

**Status:** `[x]` Complete ✅

- Primitive context values:
  - String, number, boolean primitives → return `undefined` for any path
  - Don't attempt property access on primitives
- Function context:
  - Functions can have properties
  - Use `lookupProperty()` to check for own properties
- Objects with null prototype:
  - `Object.create(null)` objects work correctly
  - `lookupProperty()` handles them safely
- Property names with special characters:
  - Properties can contain dots, spaces, etc.
  - Path parts are pre-split, so special chars in names work

**Deliverable:** Robust `resolvePath()` with edge case handling

**Tests:**

- String context: `resolvePath('hello', ['length'])` → `undefined` (primitives have no accessible properties)
- Number context: `resolvePath(42, ['toString'])` → `undefined`
- Boolean context: `resolvePath(true, ['valueOf'])` → `undefined`
- Function with property: `resolvePath(fn, ['customProp'])` → Returns value if own property
- Null prototype object: `resolvePath(Object.create(null), ['key'])` → Works correctly
- Property with spaces: `resolvePath({'my key': 'value'}, ['my key'])` → `'value'`
- Property with dots: `resolvePath({'key.with.dots': 'value'}, ['key.with.dots'])` → `'value'`
- Numeric string key: `resolvePath({'123': 'value'}, ['123'])` → `'value'`

---

## Feature 4.2: Depth-based Context Lookup

**Goal:** Handle parent scope access via `../` by maintaining context and data stacks

### Task C4-F2-T1: Implement Context Stack

**Status:** `[x]` Complete ✅

- Create context stack structure:
  - Array of context objects: `[rootContext, level1Context, currentContext]`
  - Innermost context at end of array (highest index)
  - Root context at index 0
- Create `ContextStack` class or structure:
  - `push(context: any): void` — Add new context level
  - `pop(): any` — Remove and return current context
  - `getCurrent(): any` — Get current context (last in array)
  - `getAtDepth(depth: number): any` — Get context N levels up
    - `depth: 0` → current context
    - `depth: 1` → parent context (`../`)
    - `depth: 2` → grandparent context (`../../`)
  - `getRoot(): any` — Get root context (index 0)
  - `size(): number` — Current stack depth

**Deliverable:** `src/interpreter/context-stack.ts` with context stack implementation

**Tests:**

- Push and pop contexts
- `getCurrent()` returns last pushed context
- `getAtDepth(0)` returns current
- `getAtDepth(1)` returns parent
- `getAtDepth(2)` returns grandparent
- `getRoot()` always returns first context
- `size()` returns correct depth
- Out-of-bounds depth returns root context (not undefined)
- Empty stack (before first push) returns undefined or throws

### Task C4-F2-T2: Implement Data Stack

**Status:** `[x]` Complete ✅

- Create data stack structure:
  - Array of data frames: `[rootData, level1Data, currentData]`
  - Each frame contains metadata like `@index`, `@first`, `@last`, `@key`
  - Frames created with `createFrame()` to inherit parent data
- Create `DataStack` class or structure:
  - `push(frame: any): void` — Add new data frame
  - `pop(): any` — Remove and return current frame
  - `getCurrent(): any` — Get current data frame
  - `getAtDepth(depth: number): any` — Get frame N levels up
  - `getRoot(): any` — Get root data frame
  - `size(): number` — Current stack depth
- Root data frame contains:
  - `@root` — Reference to root context (set once at initialization)

**Deliverable:** `src/interpreter/data-stack.ts` with data stack implementation

**Tests:**

- Push and pop data frames
- `getCurrent()` returns last pushed frame
- Each frame inherits from parent via `_parent` reference
- `@root` accessible at any depth
- Frames maintain separate `@index`, `@first`, `@last` values
- Out-of-bounds depth returns root frame
- Empty stack returns undefined or throws

### Task C4-F2-T3: Implement resolvePathExpression Function

**Status:** `[x]` Complete ✅

- Create `resolvePathExpression()` function with signature:
  - `resolvePathExpression(pathExpr: PathExpression, contextStack: ContextStack, dataStack: DataStack): any`
- Handle data variables (`pathExpr.data === true`):
  - Start with data frame at specified depth
  - If `pathExpr.depth > 0`, use `dataStack.getAtDepth(depth)`
  - Otherwise use `dataStack.getCurrent()`
  - Walk `pathExpr.parts` using `resolvePath()`
- Handle regular variables (`pathExpr.data === false`):
  - Start with context at specified depth
  - If `pathExpr.depth > 0`, use `contextStack.getAtDepth(depth)`
  - Otherwise use `contextStack.getCurrent()`
  - Walk `pathExpr.parts` using `resolvePath()`
- Handle `{{this}}` (empty parts):
  - Return context/data at specified depth
  - No path walking needed
- Handle `{{..}}` (empty parts, depth > 0):
  - Return parent context at specified depth
  - No path walking needed

**Deliverable:** `src/interpreter/path-resolver.ts` with `resolvePathExpression()` function

**Tests:**

- Simple variable: `{{foo}}` with depth 0 → current context
- Parent variable: `{{../parent}}` with depth 1 → parent context
- Grandparent: `{{../../grand}}` with depth 2 → grandparent context
- Data variable: `{{@index}}` with depth 0, data: true → current data frame
- Root data: `{{@root.value}}` → root context via data frame
- Empty parts: `{{this}}` → current context object
- Parent context: `{{..}}` with depth 1, empty parts → parent context
- Nested property with depth: `{{../user.name}}` → parent context's user.name
- Out-of-bounds depth uses root: depth 99 → root context

---

## Feature 4.3: Data Variable Management

**Goal:** Maintain data frame stack with loop metadata for `#each` helper

### Task C4-F3-T1: Implement createDataFrame Function

**Status:** `[x]` Complete ✅

- Create `createDataFrame()` function with signature:
  - `createDataFrame(parentFrame: any, metadata: Partial<DataFrameMetadata>): any`
- Use `createFrame(parentFrame)` from runtime utilities:
  - Creates new object with `_parent` reference
  - Inherits all properties from parent
- Add metadata to new frame:
  - `@index?: number` — Zero-based position
  - `@first?: boolean` — True for first iteration
  - `@last?: boolean` — True for last iteration
  - `@key?: string` — Property name (for object iteration)
- Root frame special case:
  - `@root` — Reference to root context (set once, never changes)
  - All child frames inherit `@root` via `_parent` chain

**Deliverable:** `src/interpreter/data-frame.ts` with data frame creation

**Tests:**

- Create frame with `@index` metadata
- Create frame with `@first` and `@last` flags
- Create frame with `@key` for object iteration
- Child frame inherits parent's `@root`
- Child frame can override parent's `@index`
- Multiple levels of frames maintain `_parent` chain
- Root frame initialization with `@root` reference

### Task C4-F3-T2: Implement Data Frame Metadata Types

**Status:** `[x]` Complete ✅

- Define TypeScript interfaces for data frame structure:
  ```typescript
  interface DataFrameMetadata {
    '@index'?: number;
    '@first'?: boolean;
    '@last'?: boolean;
    '@key'?: string;
    '@root'?: any;
    _parent?: DataFrameMetadata;
    [key: string]: any; // Allow additional properties
  }
  ```
- Document data variable semantics:
  - `@index` — Zero-based, set by `#each` for both arrays and objects
  - `@first` — Boolean, true only for first iteration
  - `@last` — Boolean, true only for last iteration (requires lookahead)
  - `@key` — String, property name during object iteration
  - `@root` — Always references root context, never changes

**Deliverable:** Type definitions and documentation

**Tests:**

- TypeScript compilation with proper types
- Type checking catches invalid metadata
- Type inference works for data frame access

### Task C4-F3-T3: Implement Data Frame Access Helpers

**Status:** `[x]` Complete ✅

- Create helper functions for accessing data variables:
  - `getDataVariable(frame: any, name: string): any`
    - Returns value from frame or `undefined` if not found
    - Uses `lookupProperty()` for security
  - `setDataVariable(frame: any, name: string, value: any): void`
    - Sets data variable on frame (own property)
    - Used when creating new frames with metadata
- Handle special `@root` access:
  - `@root` should be accessible from any frame via `_parent` chain
  - Walk chain until `@root` is found or parent is null

**Deliverable:** Data frame access helpers

**Tests:**

- Get existing data variable: `getDataVariable(frame, '@index')` → Returns index
- Get missing variable: `getDataVariable(frame, '@missing')` → `undefined`
- Set data variable: `setDataVariable(frame, '@index', 5)` → Sets on frame
- Access `@root` from child frame → Walks parent chain
- Access `@root` from deeply nested frame → Still finds root
- Set and get custom data variables

---

## Feature 4.4: Interpreter Core

**Goal:** Traverse AST and evaluate nodes using context/data stacks

### Task C4-F4-T1: Implement Interpreter Class Structure

**Status:** `[x]` Complete ✅

- Create `Interpreter` class with:
  - Constructor:
    - `constructor(ast: Program, options?: InterpreterOptions)`
    - Store AST
    - Store options (helpers, partials for future)
  - Main evaluation method:
    - `evaluate(context: any): string`
    - Initialize context stack with root context
    - Initialize data stack with root data frame (containing `@root`)
    - Traverse AST body
    - Return concatenated output
  - Node evaluation methods (private):
    - `evaluateStatement(node: Statement): string`
    - `evaluateContent(node: ContentStatement): string`
    - `evaluateMustache(node: MustacheStatement): string`
    - `evaluateBlock(node: BlockStatement): string`
    - `evaluateComment(node: CommentStatement): string`
  - Expression evaluation:
    - `evaluateExpression(expr: Expression): any`
    - `evaluatePathExpression(expr: PathExpression): any`
    - `evaluateLiteral(expr: Literal): any`

**Deliverable:** `src/interpreter/interpreter.ts` with Interpreter class

**Tests:**

- Create Interpreter with valid AST
- Evaluate simple content statement
- Evaluate program with multiple statements
- Context stack initialized correctly
- Data stack initialized with `@root`

### Task C4-F4-T2: Implement ContentStatement Evaluation

**Status:** `[ ]` Not Started

- `evaluateContent(node: ContentStatement): string`:
  - Return `node.value` as-is
  - No escaping (already literal text)
  - No variable resolution
- Handle empty content:
  - Empty string is valid content
  - Return `""` for empty value

**Deliverable:** Content evaluation logic

**Tests:**

- Plain text: `"Hello World"` → `"Hello World"`
- Empty content: `""` → `""`
- Content with newlines: `"Line 1\nLine 2"` → Preserved
- Content with special chars: `"<>&"` → Unchanged (not escaped)
- Multiple content statements concatenated

### Task C4-F4-T3: Implement MustacheStatement Evaluation

**Status:** `[ ]` Not Started

- `evaluateMustache(node: MustacheStatement): string`:
  - Resolve `node.path` using `resolvePathExpression()`
  - Get value from current context/data
  - Convert value to string:
    - `null` or `undefined` → `""`
    - Other values → `String(value)`
  - Apply escaping based on `node.escaped`:
    - If `escaped === true`, use `escapeExpression(value)`
    - If `escaped === false`, use `String(value)` (no escaping)
  - Return escaped/unescaped string
- Handle helper calls (for V1 built-in helpers):
  - If `node.params.length > 0`, this is a helper call
  - Defer helper implementation to Capability 6
  - For now, throw error if params present

**Deliverable:** Mustache evaluation with escaping

**Tests:**

- Simple variable: `{{foo}}` with `{foo: 'bar'}` → `"bar"`
- Escaped output: `{{html}}` with `{html: '<b>'}` → `"&lt;b&gt;"`
- Unescaped output: `{{{html}}}` with `{html: '<b>'}` → `"<b>"`
- Null value: `{{missing}}` → `""`
- Undefined value: `{{undefined}}` → `""`
- Number value: `{{count}}` with `{count: 42}` → `"42"`
- Boolean value: `{{flag}}` with `{flag: true}` → `"true"`
- Nested property: `{{user.name}}` → Resolved via path
- Parent access: `{{../parent}}` → Resolved with depth
- Data variable: `{{@index}}` → Resolved from data frame

### Task C4-F4-T4: Implement Program Evaluation

**Status:** `[ ]` Not Started

- `evaluateProgram(program: Program | null): string`:
  - Handle `null` program → return `""`
  - Iterate through `program.body`
  - Evaluate each statement
  - Concatenate results
  - Return final string
- Used for:
  - Root program evaluation
  - Block helper content evaluation (main + inverse programs)

**Deliverable:** Program evaluation logic

**Tests:**

- Null program: `evaluateProgram(null)` → `""`
- Empty body: `Program { body: [] }` → `""`
- Single statement: Evaluate and return
- Multiple statements: Concatenate in order
- Mixed content and mustaches
- Preserve whitespace between statements

### Task C4-F4-T5: Implement Expression Evaluation

**Status:** `[ ]` Not Started

- `evaluateExpression(expr: Expression): any`:
  - Check expression type using `expr.type`
  - PathExpression → `evaluatePathExpression()`
  - Literal → `evaluateLiteral()`
  - SubExpression → Defer to Capability 6
  - Return resolved value (not string, raw value)
- `evaluateLiteral(expr: Literal): any`:
  - StringLiteral → return `expr.value`
  - NumberLiteral → return `expr.value`
  - BooleanLiteral → return `expr.value`
  - NullLiteral → return `null`
  - UndefinedLiteral → return `undefined`

**Deliverable:** Expression evaluation logic

**Tests:**

- PathExpression evaluation: Returns resolved value
- StringLiteral: `"hello"` → `"hello"`
- NumberLiteral: `42` → `42`
- BooleanLiteral: `true` → `true`
- NullLiteral: → `null`
- UndefinedLiteral: → `undefined`
- Expression used in helper params (future)

---

## Integration Tests

**Goal:** Verify end-to-end path resolution with real templates

### Task C4-IT-T1: Simple Variable Resolution

**Status:** `[ ]` Not Started

**Tests:**

- Template: `"Hello {{name}}!"`
- Context: `{name: 'World'}`
- Expected: `"Hello World!"`
- Verify: Variable resolved and escaped

### Task C4-IT-T2: Nested Property Access

**Status:** `[ ]` Not Started

**Tests:**

- Template: `"{{user.profile.name}}"`
- Context: `{user: {profile: {name: 'Alice'}}}`
- Expected: `"Alice"`
- Verify: Multi-level property access works

### Task C4-IT-T3: Array Index Access

**Status:** `[ ]` Not Started

**Tests:**

- Template: `"{{items.0}} and {{items.1}}"`
- Context: `{items: ['first', 'second']}`
- Expected: `"first and second"`
- Verify: Array indices resolve correctly

### Task C4-IT-T4: Mixed Content and Variables

**Status:** `[ ]` Not Started

**Tests:**

- Template: `"Hello {{first}} {{last}}! You are {{age}} years old."`
- Context: `{first: 'John', last: 'Doe', age: 30}`
- Expected: `"Hello John Doe! You are 30 years old."`
- Verify: Multiple variables in content

### Task C4-IT-T5: HTML Escaping

**Status:** `[ ]` Not Started

**Tests:**

- Template: `"{{escaped}} vs {{{unescaped}}}"`
- Context: `{escaped: '<script>', unescaped: '<script>'}`
- Expected: `"&lt;script&gt; vs <script>"`
- Verify: Escaped vs unescaped output

### Task C4-IT-T6: Missing Variables

**Status:** `[ ]` Not Started

**Tests:**

- Template: `"Hello {{missing}}!"`
- Context: `{}`
- Expected: `"Hello !"`
- Verify: Missing variables render as empty string

### Task C4-IT-T7: Null and Undefined Values

**Status:** `[ ]` Not Started

**Tests:**

- Template: `"{{nullVal}}-{{undefinedVal}}-{{definedVal}}"`
- Context: `{nullVal: null, undefinedVal: undefined, definedVal: 'ok'}`
- Expected: `"--ok"`
- Verify: Null/undefined render as empty string

---

## Implementation Notes

### File Organization

Create interpreter module: `src/interpreter/`

```
src/interpreter/
  ├── interpreter.ts       # Main Interpreter class
  ├── context-stack.ts     # Context stack management
  ├── data-stack.ts        # Data stack management
  ├── data-frame.ts        # Data frame creation and helpers
  └── path-resolver.ts     # Path resolution functions
```

### Testing Strategy

Create comprehensive test files:

```
test/interpreter/
  ├── path-resolver.test.ts        # Path walking tests
  ├── context-stack.test.ts        # Context stack tests
  ├── data-stack.test.ts           # Data stack tests
  ├── data-frame.test.ts           # Data frame tests
  ├── interpreter.test.ts          # Core interpreter tests
  └── integration.test.ts          # End-to-end tests
```

### Performance Considerations

**Hot path optimizations:**

- Context/data stack: Use arrays for fast push/pop
- `resolvePath`: Early return on null/undefined
- `lookupProperty`: Already optimized in Capability 3
- Cache PathExpression resolution patterns if possible

### Security Considerations

**Critical security requirements:**

- All property access MUST use `lookupProperty()`
- Never access properties directly with `obj[key]`
- Context/data stacks prevent unintended scope access
- Depth calculation prevents out-of-bounds access

### Handlebars Compatibility

**Behavior must match Handlebars:**

- Out-of-bounds depth → root context (not error)
- Missing properties → `undefined` → `""`
- Data variables scoped to current frame only
- `@root` accessible from any depth
- Empty parts → `{{this}}` returns context object

### Testing Against Handlebars

Compare output with Handlebars where possible:

```typescript
import Handlebars from 'handlebars';
import { compile } from '../src/index';

const template = '{{user.name}}';
const context = { user: { name: 'Alice' } };

const hbsResult = Handlebars.compile(template)(context);
const wonderResult = compile(template).render(context);

expect(wonderResult).toBe(hbsResult);
```

---

## Success Criteria

Capability 4 is complete when:

- ✅ All path resolution functions implemented and tested
- ✅ Context stack maintains scope chain correctly
- ✅ Data stack maintains data frames correctly
- ✅ Data frames contain correct loop metadata structure
- ✅ Interpreter evaluates ContentStatement correctly
- ✅ Interpreter evaluates MustacheStatement with escaping
- ✅ PathExpression resolution works with depth
- ✅ Integration tests pass for simple templates
- ✅ Security properties verified (all access via lookupProperty)
- ✅ Performance acceptable for hot paths
- ✅ Ready for Capability 5 (Block Helpers)

**Estimated Tests:** 150-200 tests total across all features

**Estimated Time:** 4-6 hours implementation + testing

**Blocking:** Must complete before starting Capability 5 (Built-in Block Helpers)

---

## Notes

**This capability does NOT include:**

- Block helpers (`#if`, `#each`, etc.) - Capability 5
- Custom runtime helpers - Capability 6
- Subexpression evaluation - Capability 6
- Hash parameters - V2
- Partials - V2

**This capability DOES include:**

- Basic variable resolution
- Nested property access
- Parent scope access (`../`)
- Data variable access (`@index`, `@root`, etc.)
- HTML escaping vs unescaped output
- Null/undefined handling
- Array index access
