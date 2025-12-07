# Group B Test-by-Test Triage

**Goal**: Robust V1 - proper helper system, error handling, whitespace control

**Total estimated**: ~120 tests across 4 files

---

## helpers.js (81 tests total)

### Phase 1: Core Helper Invocation (~25 tests) - KEEP

**Why**: Essential for any helper system to work

1. ✅ **helper with complex lookup** - `{{helper foo.bar}}`
2. ❌ **helper for raw block gets raw content** - SKIP (raw blocks not in requirements)
3. ❌ **helper for raw block gets parameters** - SKIP (raw blocks)
4. ❌ **raw block parsing** (5 tests) - SKIP (raw blocks `{{{{raw}}}}`)
5. ✅ **helper block with identical context** - Block helper basics
6. ✅ **helper block with complex lookup expression** - Nested paths
7. ✅ **helper with complex lookup and nested template** - Context switching
8. ✅ **helper with complex lookup and nested template in VM+Compiler** - Validation
9. ✅ **helper returning undefined value** - Edge case handling
10. ✅ **block helper** - Basic block helper `{{#helper}}{{/helper}}`
11. ✅ **block helper staying in the same context** - Context preservation
12. ✅ **block helper should have context in this** - `this` binding
13. ✅ **block helper for undefined value** - Falsy handling
14. ✅ **block helper passing a new context** - `options.fn(newContext)`
15. ✅ **block helper passing a complex path context** - `options.fn(foo.bar)`
16. ✅ **nested block helpers** - Multiple levels
17. ✅ **block helper inverted sections** - `{{else}}` support
18. ✅ **pathed lambdas with parameters** - Function properties with args

**Subtotal Phase 1: 18 keep, 7 skip**

---

### Phase 2: Helper Registration & Hash (~15 tests) - KEEP

**Why**: Required for runtime helper system

**helpers hash** (4 tests):

1. ✅ **providing a helpers hash** - Runtime helpers object
2. ✅ **in cases of conflict, helpers win** - Precedence rules
3. ✅ **the helpers hash is available is nested contexts** - Scope
4. ✅ **the helper hash should augment the global hash** - Merging

**registration** (3 tests): 5. ✅ **unregisters** - Remove helpers 6. ✅ **allows multiple globals** - Batch registration 7. ✅ **fails with multiple and args** - Error validation

**hash parameters** (5 tests): 8. ✅ **helpers can take an optional hash** - `{{helper key=value}}` 9. ✅ **helpers can take an optional hash with booleans** - `{{helper flag=true}}` 10. ✅ **block helpers can take an optional hash** - Block version 11. ✅ **block helpers can take an optional hash with single quoted strings** - `key='value'` 12. ✅ **block helpers can take an optional hash with booleans** - Block booleans

**multiple parameters** (2 tests): 13. ✅ **simple multi-params work** - `{{helper arg1 arg2}}` 14. ✅ **block multi-params work** - Block version

**Subtotal Phase 2: 14 keep**

---

### Phase 3: String/Number Literals (~8 tests) - KEEP

**Why**: Already working, need validation

1. ✅ **decimal number literals work** - `{{helper 1.5}}`
2. ✅ **negative number literals work** - `{{helper -5}}`
3. ✅ **negative number literals work** (duplicate test)

**String literal parameters** (5 tests): 4. ✅ **simple literals work** - `{{helper "string"}}` 5. ✅ **using a quote in the middle of a parameter raises an error** - Parse error 6. ✅ **escaping a String is possible** - `{{helper "a\"b"}}` 7. ✅ **it works with ' marks** - `{{helper 'string'}}`

**Subtotal Phase 3: 7 keep (1 duplicate)**

---

### Phase 4: Advanced Features (~33 tests) - MIXED

**helperMissing** (3 tests):

1. ✅ **if a context is not found, helperMissing is used** - Fallback behavior
2. ✅ **if a context is not found, custom helperMissing is used** - Custom handler
3. ✅ **if a value is not found, custom helperMissing is used** - Value lookup
   **Status**: KEEP (3) - Important for error handling

**knownHelpers** (8 tests): 4. ❌ **Known helper should render helper** - SKIP (compile-time optimization) 5. ❌ **Unknown helper in knownHelpers only mode** - SKIP 6. ❌ **Builtin helpers available in knownHelpers only mode** - SKIP 7. ❌ **Field lookup works in knownHelpers only mode** - SKIP 8. ❌ **Conditional blocks work in knownHelpers only mode** - SKIP 9. ❌ **Invert blocks work in knownHelpers only mode** - SKIP 10. ❌ **Functions are bound in knownHelpers only mode** - SKIP 11. ❌ **Unknown helper call in knownHelpers only mode should throw** - SKIP
**Status**: SKIP (8) - Compile-time optimization not needed for interpreter

**blockHelperMissing** (2 tests): 12. ✅ **lambdas are resolved by blockHelperMissing** - Function handling 13. ✅ **lambdas resolved by blockHelperMissing are bound to the context** - Context binding
**Status**: KEEP (2)

**name field** (8 tests): 14. ❌ **should include in ambiguous mustache calls** - SKIP (debug info) 15. ❌ **should include in helper mustache calls** - SKIP 16. ❌ **should include in ambiguous block calls** - SKIP 17. ❌ **should include in simple block calls** - SKIP 18. ❌ **should include in helper block calls** - SKIP 19. ❌ **should include in known helper calls** - SKIP 20. ❌ **should include full id** - SKIP 21. ❌ **should include full id if a hash is passed** - SKIP
**Status**: SKIP (8) - Debug metadata not critical

**name conflicts** (4 tests): 22. ✅ **helpers take precedence over same-named context properties** - Precedence 23. ✅ **helpers take precedence over same-named context properties$** - Validation 24. ✅ **Scoped names take precedence over helpers** - `{{foo.bar}}` vs helper 25. ✅ **Scoped names take precedence over block helpers** - Block version
**Status**: KEEP (4)

**block params** (5 tests): 26. ✅ **should take precedence over context values** - `{{#helper as |param|}}` 27. ✅ **should take precedence over helper values** - Precedence 28. ✅ **should not take precedence over pathed values** - `{{foo.bar}}` 29. ✅ **should take precedence over parent block params** - Nested scope 30. ✅ **should allow block params on chained helpers** - `{{else}}` with params
**Status**: KEEP (5) - Already implemented in builtins

**built-in helpers malformed arguments** (8 tests): 31. ✅ **if helper - too few arguments** - Validation 32. ✅ **if helper - too many arguments, string** - Validation 33. ✅ **if helper - too many arguments, undefined** - Validation 34. ✅ **if helper - too many arguments, null** - Validation 35. ✅ **unless helper - too few arguments** - Validation 36. ✅ **unless helper - too many arguments** - Validation 37. ✅ **with helper - too few arguments** - Validation 38. ✅ **with helper - too many arguments** - Validation
**Status**: KEEP (8) - Good validation tests

**lookupProperty option** (1 test): 39. ❌ **should be passed to custom helpers** - SKIP (internal API)
**Status**: SKIP (1)

**Subtotal Phase 4: 22 keep, 17 skip**

---

## blocks.js (34 tests total)

### Basic Block Tests (~10 tests) - KEEP

**Why**: Core block functionality already implemented

1. ✅ **array** - Array iteration `{{#array}}`
2. ✅ **array without data** - No data variables
3. ✅ **array with @index** - Index access
4. ✅ **empty block** - Empty arrays
5. ✅ **block with complex lookup** - `{{#foo.bar}}`
6. ✅ **multiple blocks with complex lookup** - Multiple blocks
7. ✅ **block with complex lookup using nested context** - Nested
8. ✅ **block with deep nested complex lookup** - Deep nesting
9. ✅ **works with cached blocks** - Reuse

**Status**: KEEP (9) - Validates #each and #if implementation

---

### Inverted Sections (~7 tests) - KEEP

**Why**: {{else}} and {{^unless}} patterns

1. ✅ **inverted sections with unset value** - `{{^foo}}`
2. ✅ **inverted section with false value** - Falsy handling
3. ✅ **inverted section with empty set** - Empty arrays
4. ✅ **block inverted sections** - `{{#if}}{{else}}{{/if}}`
5. ✅ **chained inverted sections** - `{{else if}}`
6. ✅ **chained inverted sections with mismatch** - Error handling
7. ✅ **block inverted sections with empty arrays** - Edge case

**Status**: KEEP (7)

---

### Standalone Sections (~4 tests) - MIXED

**Why**: Whitespace control adjacent to blocks

1. ✅ **block standalone else sections** - `{{else}}` on its own line
2. ❌ **block standalone else sections can be disabled** - SKIP (compile option)
3. ✅ **block standalone chained else sections** - Multiple `{{else if}}`
4. ✅ **should handle nesting** - Nested standalone

**Status**: KEEP (3), SKIP (1)

---

### Compat Mode (~3 tests) - SKIP

**Why**: Not implementing Mustache compatibility mode

1. ❌ **block with deep recursive lookup lookup** - SKIP (compat mode)
2. ❌ **block with deep recursive pathed lookup** - SKIP
3. ❌ **block with missed recursive lookup** - SKIP

**Status**: SKIP (3)

---

### Decorators (~10 tests) - SKIP

**Why**: Decorator syntax `{{*decorator}}` not in requirements

1. ❌ **should apply mustache decorators** - SKIP
2. ❌ **should apply allow undefined return** - SKIP
3. ❌ **should apply block decorators** - SKIP
4. ❌ **should support nested decorators** - SKIP
5. ❌ **should apply multiple decorators** - SKIP
6. ❌ **should access parent variables** - SKIP
7. ❌ **should work with root program** - SKIP
8. ❌ **should fail when accessing variables from root** - SKIP
9. ❌ **unregisters** (decorator registration) - SKIP
10. ❌ **allows multiple globals** (decorator registration) - SKIP
11. ❌ **fails with multiple and args** (decorator registration) - SKIP

**Status**: SKIP (11) - Decorators not in V1

---

## tokenizer.js (55 tests)

### All Tests - DEFER

**Why**: Lexer/tokenizer validation - useful but not user-facing

**Status**: DEFER to internal validation - run manually when lexer changes

---

## whitespace-control.js (6 tests)

### All Tests - KEEP

**Why**: Essential for clean prompt output, already partially implemented

1. ✅ **should strip whitespace around mustache calls** - `{{~foo~}}`
2. ✅ **should strip whitespace around escapes** - `\{{~foo~}}`
3. ✅ **should strip whitespace around complex mustache calls** - Hash params
4. ✅ **should strip whitespace around block calls** - `{{~#if~}}`
5. ✅ **should strip whitespace around inverse calls** - `{{~^unless~}}`
6. ✅ **should strip whitespace around complex block calls** - Full control

**Status**: KEEP (6) - Critical for clean output

---

## Summary

### helpers.js: 61 keep, 20 skip

- Phase 1 (Core): 18 keep
- Phase 2 (Registration/Hash): 14 keep
- Phase 3 (Literals): 7 keep
- Phase 4 (Advanced): 22 keep, 17 skip

### blocks.js: 20 keep, 14 skip

- Basic blocks: 9 keep
- Inverted sections: 7 keep
- Standalone: 3 keep, 1 skip
- Compat mode: 0 keep, 3 skip
- Decorators: 0 keep, 11 skip

### tokenizer.js: 0 keep (defer), 55 skip

- All deferred to manual validation

### whitespace-control.js: 6 keep, 0 skip

- All critical for clean output

### **Group B Total: 87 tests to migrate**

- helpers.js: 61 tests
- blocks.js: 20 tests
- whitespace-control.js: 6 tests

### **Tests to skip: 89**

- Raw blocks: 7
- knownHelpers: 8
- name field debug: 8
- lookupProperty: 1
- Compat mode: 3
- Decorators: 11
- standalone compile option: 1
- tokenizer (defer): 55

---

## Migration Priority

### 1. whitespace-control.js (6 tests)

**Why first**: Small, focused, already partially working
**Depends on**: Lexer whitespace token handling
**Estimated time**: 30 min

### 2. blocks.js - inverted/standalone (10 tests)

**Why second**: Validates existing #if/#each else clauses
**Depends on**: Inverted sections already implemented
**Estimated time**: 1 hour

### 3. helpers.js - Phase 1 (18 tests)

**Why third**: Core helper system validation
**Depends on**: Helper registration system
**Estimated time**: 2 hours

### 4. helpers.js - Phase 2-4 (43 tests)

**Why last**: Advanced features, some deferred
**Depends on**: Phase 1 complete
**Estimated time**: 3 hours
