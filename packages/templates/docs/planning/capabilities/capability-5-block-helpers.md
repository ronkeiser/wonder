# Capability 5: Built-in Block Helpers

**Status:** `[ ]` **IN PROGRESS** 🔄

**Goal:** Implement the four core Handlebars block helpers: `#if`, `#unless`, `#each`, and `#with`. These helpers enable conditional rendering, iteration, and context manipulation, forming the backbone of dynamic template logic.

**Reference:** Handlebars `helpers/block-helpers.js` implementation

**Summary:**

- Feature 5.1: #if and #unless Helpers - Conditional rendering
- Feature 5.2: (Reserved - may merge with 5.3/5.4)
- Feature 5.3: #each Helper (Arrays) - Array iteration with loop metadata
- Feature 5.4: #each Helper (Objects) - Object iteration with key access
- Feature 5.5: #with Helper - Context pushing
- Feature 5.6: Nested Block Integration - Complex nesting scenarios

**Dependencies:**

- Capability 1: Lexer (✅ Complete)
- Capability 2: Parser & AST (✅ Complete)
- Capability 3: Runtime Utilities (✅ Complete)
- Capability 4: Context Resolution & Interpreter (✅ Complete)

---

## Feature 5.1: #if and #unless Helpers

**Goal:** Implement conditional rendering based on Handlebars truthiness semantics

**Status:** `[x]` **COMPLETE** ✅

### Task C5-F1-T1: Implement #if Helper

**Status:** `[x]` Complete ✅

- Create `evaluateIfHelper()` method in interpreter:
  - Signature: `evaluateIfHelper(node: BlockStatement): string`
  - Validate exactly 1 parameter (the condition)
  - Evaluate condition expression
  - Use `isEmpty()` for Handlebars truthiness:
    - Falsy: `null`, `undefined`, `false`, `""`, `[]`
    - Truthy: everything else including `0` and `{}`
  - Render `node.program` if truthy
  - Render `node.inverse` if falsy (else block)

**Security Critical:** Must use `isEmpty()` for truthiness, NOT JavaScript falsy semantics (0 is truthy in Handlebars)

**Deliverable:** `evaluateIfHelper()` method in `src/interpreter/interpreter.ts`

**Tests:**

- Truthy values (7 tests):
  - Non-empty string: `{{#if name}}Hello{{/if}}` with `{name: "World"}` → `"Hello"`
  - Number (including 0): `{{#if count}}Count{{/if}}` with `{count: 0}` → `"Count"` (0 is truthy!)
  - True boolean: `{{#if active}}Active{{/if}}` with `{active: true}` → `"Active"`
  - Non-empty array: `{{#if items}}Has items{{/if}}` with `{items: [1]}` → `"Has items"`
  - Non-empty object: `{{#if user}}Has user{{/if}}` with `{user: {name: "A"}}` → `"Has user"`
  - Empty object: `{{#if obj}}Has obj{{/if}}` with `{obj: {}}` → `"Has obj"` (empty {} is truthy!)
  - Function: `{{#if fn}}Has fn{{/if}}` with `{fn: () => {}}` → `"Has fn"`

- Falsy values (6 tests):
  - Empty string: `{{#if name}}Name{{/if}}` with `{name: ""}` → `""`
  - False: `{{#if active}}Active{{/if}}` with `{active: false}` → `""`
  - Null: `{{#if value}}Value{{/if}}` with `{value: null}` → `""`
  - Undefined: `{{#if value}}Value{{/if}}` with `{value: undefined}` → `""`
  - Empty array: `{{#if items}}Items{{/if}}` with `{items: []}` → `""` (empty [] is falsy!)
  - Missing property: `{{#if missing}}Missing{{/if}}` with `{}` → `""`

- With else blocks (7 tests):
  - Truthy with else: `{{#if x}}A{{else}}B{{/if}}` with `{x: 1}` → `"A"`
  - Falsy with else: `{{#if x}}A{{else}}B{{/if}}` with `{x: false}` → `"B"`
  - Empty string with else: `{{#if x}}A{{else}}B{{/if}}` with `{x: ""}` → `"B"`
  - Zero with else: `{{#if x}}A{{else}}B{{/if}}` with `{x: 0}` → `"A"` (0 is truthy!)
  - Empty array with else: `{{#if x}}A{{else}}B{{/if}}` with `{x: []}` → `"B"`
  - Empty object with else: `{{#if x}}A{{else}}B{{/if}}` with `{x: {}}` → `"A"` (empty {} is truthy!)
  - Null with else: `{{#if x}}A{{else}}B{{/if}}` with `{x: null}` → `"B"`

- Nested conditions (2 tests):
  - Nested #if: `{{#if outer}}{{#if inner}}Both{{/if}}{{/if}}` → various outputs
  - Nested #if with else: Complex nesting with else clauses

- With content and variables (2 tests):
  - Variable interpolation: `{{#if show}}Hello {{name}}{{/if}}`
  - Multiple variables: `{{#if show}}{{first}} {{last}}{{/if}}`

- Edge cases (2 tests):
  - Nested property: `{{#if user.active}}Active{{/if}}`
  - This context: `{{#if this}}Has this{{/if}}`

### Task C5-F1-T2: Implement #unless Helper

**Status:** `[x]` Complete ✅

- Create `evaluateUnlessHelper()` method in interpreter:
  - Signature: `evaluateUnlessHelper(node: BlockStatement): string`
  - Validate exactly 1 parameter (the condition)
  - Evaluate condition expression
  - Use `isEmpty()` for truthiness check
  - **Inverse of #if:** Render `node.program` if FALSY
  - Render `node.inverse` if truthy (else block)

**Deliverable:** `evaluateUnlessHelper()` method in `src/interpreter/interpreter.ts`

**Tests:**

- Truthy values (4 tests):
  - String: `{{#unless name}}Empty{{/unless}}` with `{name: "Bob"}` → `""`
  - Number: `{{#unless count}}No count{{/unless}}` with `{count: 5}` → `""`
  - Zero: `{{#unless count}}No count{{/unless}}` with `{count: 0}` → `""` (0 is truthy!)
  - Empty object: `{{#unless obj}}No obj{{/unless}}` with `{obj: {}}` → `""` (empty {} is truthy!)

- Falsy values (5 tests):
  - Empty string: `{{#unless name}}Empty{{/unless}}` with `{name: ""}` → `"Empty"`
  - False: `{{#unless active}}Inactive{{/unless}}` with `{active: false}` → `"Inactive"`
  - Null: `{{#unless value}}None{{/unless}}` with `{value: null}` → `"None"`
  - Undefined: `{{#unless value}}None{{/unless}}` with `{value: undefined}` → `"None"`
  - Empty array: `{{#unless items}}No items{{/unless}}` with `{items: []}` → `"No items"`

- With else blocks (3 tests):
  - Truthy with else: `{{#unless x}}A{{else}}B{{/unless}}` with `{x: 1}` → `"B"`
  - Falsy with else: `{{#unless x}}A{{else}}B{{/unless}}` with `{x: false}` → `"A"`
  - Empty array with else: `{{#unless x}}A{{else}}B{{/unless}}` with `{x: []}` → `"A"`

- Nested with #if (2 tests):
  - `{{#unless disabled}}{{#if active}}Active{{/if}}{{/unless}}`
  - Complex nesting scenarios

- With content and variables (2 tests):
  - Variable interpolation: `{{#unless hidden}}Hello {{name}}{{/unless}}`
  - Multiple variables: `{{#unless hidden}}{{first}} {{last}}{{/unless}}`

### Task C5-F1-T3: Update evaluateBlock Dispatcher

**Status:** `[x]` Complete ✅

- Modify `evaluateBlock()` to route to helpers:
  ```typescript
  private evaluateBlock(node: BlockStatement): string {
    const helperName = node.path.original;
    switch (helperName) {
      case 'if': return this.evaluateIfHelper(node);
      case 'unless': return this.evaluateUnlessHelper(node);
      case 'each': return this.evaluateEachHelper(node);  // stub for now
      case 'with': return this.evaluateWithHelper(node);  // stub for now
      default: throw new Error(`Unknown block helper: ${helperName}`);
    }
  }
  ```
- Add stubs for `each` and `with` that throw "not yet implemented"

**Deliverable:** Updated dispatcher in `src/interpreter/interpreter.ts`

---

## Feature 5.3: #each Helper (Arrays)

**Goal:** Iterate over arrays with loop metadata

**Status:** `[x]` **COMPLETE** ✅

### Task C5-F3-T1: Implement Array Iteration

**Status:** `[x]` Complete ✅

- Create `evaluateEachHelper()` method:
  - Check parameter is array
  - Create new data frame with loop variables
  - Iterate array indices:
    - Set `@index` to current index (0-based)
    - Set `@first` to `true` for first iteration
    - Set `@last` to `true` for last iteration
    - Push array item as new context
    - Evaluate `node.program` and accumulate output
  - Handle empty arrays:
    - Render `node.inverse` (else block)

**Deliverable:** `evaluateEachHelper()` and `evaluateEachArray()` methods in `src/interpreter/interpreter.ts`

**Tests:** 35 tests passing

- Basic iteration: `{{#each items}}{{this}}{{/each}}`
- Access @index: `{{#each items}}{{@index}}: {{this}}{{/each}}`
- Access @first: `{{#each items}}{{#if @first}}First{{/if}}{{/each}}`
- Access @last: `{{#each items}}{{#if @last}}Last{{/if}}{{/each}}`
- Empty array: `{{#each items}}Item{{else}}Empty{{/each}}` with `{items: []}`
- Nested properties: `{{#each users}}{{name}}{{/each}}`
- Parent access: `{{#each items}}{{../title}}: {{this}}{{/each}}`

### Task C5-F3-T2: Handle Sparse Arrays

**Status:** `[x]` Complete ✅

- Skip holes in sparse arrays:
  - Use `i in collection` check before iteration
  - Don't render program for missing indices
- Update @first/@last correctly:
  - Find first and last existing indices before iteration
  - @first and @last set based on actual existing elements
- @index reflects actual array index, not iteration count

**Deliverable:** Sparse array handling in `evaluateEachArray()`

**Tests:** 4 tests passing

- Sparse array: `{items: [1, , 3]}` skips middle item
- Correct indices: Indices reflect array positions, not iteration count
- @first correct for first existing element
- @last correct for last existing element

---

## Feature 5.4: #each Helper (Objects)

**Goal:** Iterate over object properties with key access

**Status:** `[x]` COMPLETE ✅

### Task C5-F4-T1: Implement Object Iteration

**Status:** `[x]` COMPLETE

**Deliverable:** `evaluateEachObject()` method with full loop metadata support

**Implementation:**

- Uses `Object.keys()` for consistent iteration order (ES6+ insertion order)
- Creates data frame with `@key` (property name), `@index`, `@first`, `@last`
- Property value pushed as new context (becomes `this`)
- Empty objects render inverse block
- Supports parent context access via `../`

**Tests:** 15 tests passing

**Test Coverage:**

- Basic iteration (3 tests): simple properties, single property, formatted output
- @key access (3 tests): key output, key+index, key in nested content
- Loop metadata (4 tests): @first detection, @last detection, combined metadata, single property edge case
- Context access (3 tests): nested object values, parent access, nested properties
- Else blocks (2 tests): empty object, else with context variables

---

## Feature 5.5: #with Helper

**Goal:** Push new context from path resolution

**Status:** `[ ]` Not Started

### Task C5-F5-T1: Implement Context Pushing

- Create `evaluateWithHelper()` method:
  - Validate exactly 1 parameter
  - Evaluate parameter expression (resolve path)
  - If result is empty/null:
    - Render `node.inverse` (else block)
  - Otherwise:
    - Push result as new context
    - Create new data frame
    - Evaluate `node.program`
    - Pop context

**Tests:**

- Basic usage: `{{#with user}}{{name}}{{/with}}`
- Nested properties: `{{#with user.profile}}{{bio}}{{/with}}`
- Parent access: `{{#with settings}}{{name}}: {{../user.name}}{{/with}}`
- Empty/null: `{{#with missing}}Content{{else}}Empty{{/with}}`
- Null value: `{{#with value}}Content{{else}}Null{{/with}}` with `{value: null}`
- This context: `{{#with user}}{{this.name}}{{/with}}`

---

## Feature 5.6: Nested Block Integration

**Goal:** Comprehensive testing of nested block helpers

**Status:** `[ ]` Not Started

### Task C5-F6-T1: Test Deep Nesting

- Multiple levels of nesting:
  - `{{#each items}}{{#if active}}{{#with user}}...{{/with}}{{/if}}{{/each}}`
- Context stack correctness:
  - Verify `../` access through multiple levels
  - Verify `@root` access from deep nesting
- Data frame scoping:
  - Verify `@index` from outer `#each` visible in inner blocks
  - Verify `@key` correctly scoped

**Tests:**

- 3-level nesting: `#each` → `#if` → `#with`
- Parent access through levels: `{{../../grandparent}}`
- Data variable access: `{{@../index}}` from nested each
- Root access: `{{@root.title}}` from deep nesting
- Multiple #each nesting: `{{#each rows}}{{#each cols}}{{@../index}}.{{@index}}{{/each}}{{/each}}`

---

## Integration Tests

### Test Suite: Block Helpers End-to-End

- Conditional rendering with real data
- List rendering with complex objects
- Nested lists with parent references
- Combined conditions and iterations
- Edge cases: empty lists, null values, missing properties

---

## Notes

- **Handlebars Truthiness:** Critical difference from JavaScript
  - `0` is **truthy** in Handlebars (falsy in JS)
  - `{}` is **truthy** in Handlebars (truthy in JS too, but worth noting)
  - `[]` is **falsy** in Handlebars (truthy in JS) - this is the big difference
  - Use `isEmpty()` utility from runtime/utils.ts

- **Block Helper Dispatcher:** Switch on `node.path.original` for routing

- **Test Coverage:**
  - Feature 5.1: 42 tests for #if and #unless
  - Feature 5.3: 35 tests for #each array iteration
  - Feature 5.4: 15 tests for #each object iteration
  - Total block helper tests: 92

- **Data Frame Keys:** Must be prefixed with `@` (e.g., `'@index'`, `'@first'`, `'@key'`) because path resolver adds prefix when `pathExpr.data` is true

- **Sparse Array Handling:** Pre-calculate first and last existing indices to correctly set `@first` and `@last` flags

- **Parser Test Fix:** Updated 8 parser tests to expect "Expected identifier or number after path separator" (from Capability 4 numeric path enhancement)

---

## Completion Checklist

- [x] Feature 5.1: #if and #unless helpers (42 tests passing)
- [x] Feature 5.3: #each for arrays (35 tests passing)
- [x] Feature 5.4: #each for objects (15 tests passing)
- [ ] Feature 5.5: #with helper (~8 tests)
- [ ] Feature 5.6: Nested block integration (~10 tests)
- [x] All parser tests updated for numeric path support (8 test fixes)
- [x] All tests passing (1449/1449 ✅)
- [ ] Documentation complete
- [ ] Ready for Capability 6 (Runtime Helpers)
