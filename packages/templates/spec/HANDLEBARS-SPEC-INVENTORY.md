# Handlebars Spec Test Inventory

Total: **520 test cases** across 20 spec files (7,338 lines)

## Relevance Grouping for Wonder

### Group A: Critical (Must Have for V1)
**Use case**: Core prompt template features - variables, paths, loops, conditionals

- **basic.js** (39 tests) - Variables, paths, escaping, literals
- **builtins.js** (42 tests) - #if, #each, #with, #lookup
- **data.js** (21 tests) - @root, @index, @first, @last, @key
- **security.js** (33 tests) - Prototype pollution protection

**Subtotal: 135 tests** | **Current status: 34/39 basic.js passing (87%)**

### Group B: Important (Needed for Robust V1)
**Use case**: Proper helper system, error handling, whitespace control

- **helpers.js** (~40 of 81 tests) - Helper invocation, params, hash, options object
- **blocks.js** (~20 of 34 tests) - Inverted sections, basic block params
- **tokenizer.js** (55 tests) - Lexer validation
- **whitespace-control.js** (6 tests) - Clean prompt output

**Subtotal: ~120 tests**

### Group C: Nice to Have (Post-V1)
**Use case**: Advanced features, edge cases

- **subexpressions.js** (12 tests) - Nested helper calls
- **helpers.js** (~40 remaining tests) - Advanced helper features
- **strict.js** (18 tests) - Development mode validation
- **regressions.js** (~15 relevant tests) - Known edge cases
- **blocks.js** (~14 remaining tests) - Advanced block features

**Subtotal: ~100 tests**

### Group D: Skip (Not Relevant)
**Use case**: Features we won't implement or are internal

- **partials.js** (60 tests) - Not in requirements
- **precompiler.js** (33 tests) - We use interpreter
- **compiler.js** (13 tests) - Internal compiler details
- **ast.js** (13 tests) - Internal parser details
- **javascript-compiler.js** (7 tests) - We don't generate JS code
- **runtime.js** (3 tests) - Internal runtime
- **source-map.js** (2 tests) - Not needed
- **utils.js** (12 tests) - Internal utilities
- **spec.js** (1 test) - Meta testing
- **require.js** (2 tests) - Module loading
- **regressions.js** (~19 tests) - Irrelevant edge cases

**Subtotal: ~165 tests to skip**

---

## Recommended Triage Order

### Phase 1: Complete Group A (Critical - 135 tests)
1. ✅ **basic.js** - Fix remaining 5 failures (comments, options hash, hyphens, bracket literals)
2. **builtins.js** - Import all 42 tests (#if, #each, #with, #lookup)
3. **data.js** - Import all 21 tests (@root, @index, @first, @last, @key)
4. **security.js** - Import all 33 tests (prototype protection)

**Target: 135/135 Group A tests passing**

### Phase 2: Add Group B (Important - ~120 tests)
Focus on tests that improve robustness:
5. **helpers.js** - Import ~40 core tests (skip advanced features)
6. **tokenizer.js** - Import all 55 tests (validate lexer)
7. **blocks.js** - Import ~20 core tests (inverted sections, basic block params)
8. **whitespace-control.js** - Import all 6 tests (clean output)

**Target: 255/255 Group A+B tests passing**

### Phase 3: Evaluate Group C (Post-V1)
Defer until Groups A & B are solid

---

## Group A: Critical Files - Detailed Breakdown

### basic.js (39 tests) - STATUS: 34/39 passing

**Essential for prompts:**
- ✅ Variables: `{{foo}}`, `{{foo.bar}}`
- ✅ Paths: dot notation, slash notation, parent paths
- ✅ Escaping: `\{{`, literal braces in prompts
- ✅ Boolean/null/undefined handling
- ✅ Literal values: strings, numbers, booleans
- ❌ Comments with whitespace control: `{{~! comment ~}}`
- ❌ Helper options hash (missing in our implementation)
- ❌ Hyphenated identifiers: `{{foo-bar}}`
- ❌ Bracket literals for reserved words: `{{[this]}}`

**Why we need this:** Every prompt needs variables and paths

---

### builtins.js (42 tests) - STATUS: Not yet imported

**Essential helpers:**
- `#if` / `#unless` - Conditional prompt sections
- `#each` - Loop over arrays/objects (multi-shot examples, iterating context)
- `#with` - Change context (nested data structures)
- `#lookup` - Dynamic property access

**Why we need this:** Prompts need conditionals and loops for dynamic content

---

### data.js (21 tests) - STATUS: Not yet imported

**Essential data variables:**
- `@root` - Access root context from nested blocks
- `@index` - Current iteration index (numbering examples)
- `@first` / `@last` - Special handling for first/last items
- `@key` - Object property names when iterating

**Why we need this:** Critical for loops - numbering examples, handling first/last differently

---

### security.js (33 tests) - STATUS: Not yet imported

**Security features:**
- Prototype pollution protection
- `__proto__` access prevention
- Constructor access prevention
- Dangerous property blocking

**Why we need this:** Users will provide context data - must protect against injection

---

## Test Files by Category

### Core Template Execution

#### **basic.js** (39 tests, 581 lines)

- Basic mustache variables
- Path expressions (dot notation, slash notation)
- Parent paths (`../`)
- Escaping text and expressions
- Boolean/null/undefined handling
- Comments (standard and long-form)
- Literal values (strings, numbers, booleans)
- Keywords: `this`, `true`, `false`, `null`, `undefined`

**Relevance**: HIGH - Core template functionality

---

#### **tokenizer.js** (55 tests, 796 lines)

- Token recognition (OPEN, CLOSE, ID, SEP, etc.)
- Path parsing (dot, slash, parent)
- Whitespace handling
- Data variables (`@root`, `@index`)
- Literals (strings, numbers, booleans)
- Hash arguments
- Block structures
- Subexpressions
- Comments
- Special characters

**Relevance**: HIGH - Validates lexer correctness

---

#### **blocks.js** (34 tests, 456 lines)

- Inverted sections (`{{^}}`)
- Standalone sections
- Block parameters (`as |item|`)
- Decorators
- Compat mode behaviors

**Relevance**: MEDIUM - Block helpers core, decorators LOW

---

### Helpers & Built-ins

#### **helpers.js** (81 tests, 1,047 lines)

- Helper registration
- Parameter passing (positional, hash)
- String/number/boolean literals as params
- Helper options object
- `helperMissing` behavior
- `blockHelperMissing` behavior
- Helper name conflicts with properties
- Block parameters
- Raw blocks
- `lookupProperty` option

**Relevance**: HIGH - Core helper functionality, some edge cases MEDIUM

---

#### **builtins.js** (42 tests, 812 lines)

- `#if` helper (all variants)
- `#with` helper
- `#each` helper (arrays, objects)
- `#log` helper
- `#lookup` helper

**Relevance**: HIGH - Essential built-in helpers

---

### Data & Context

#### **data.js** (21 tests, 278 lines)

- `@root` variable
- `@first`, `@last`, `@index` in loops
- `@key` in object iteration
- Nested data variable access
- Private data variables

**Relevance**: HIGH - Essential for loops and context tracking

---

#### **subexpressions.js** (12 tests, 218 lines)

- Basic subexpressions: `{{helper (subhelper)}}`
- Nested subexpressions
- Subexpressions with hash args
- Path expressions in subexpressions

**Relevance**: MEDIUM - Nice to have, not critical initially

---

### Advanced Features

#### **partials.js** (60 tests, 680 lines)

- Partial registration and invocation
- Partial blocks
- Inline partials
- Dynamic partials
- Partial context
- Partial parameters

**Relevance**: LOW - Not in initial requirements

---

#### **whitespace-control.js** (6 tests, 147 lines)

- `{{~` and `~}}` syntax
- Whitespace stripping in blocks
- Standalone line handling

**Relevance**: MEDIUM - Nice for clean output, not critical

---

### Strict Mode & Security

#### **strict.js** (18 tests, 164 lines)

- Strict mode behaviors
- Undefined variable handling
- Missing helper/partial errors

**Relevance**: MEDIUM - Good for development, not critical

---

#### **security.js** (33 tests, 428 lines)

- Prototype pollution protection
- Constructor access prevention
- Dangerous property access
- `allowProtoPropertiesByDefault` option
- `allowProtoMethodsByDefault` option

**Relevance**: HIGH - Security is critical for user templates

---

### Compilation & Output

#### **compiler.js** (13 tests, 205 lines)

- Compiler options
- AST manipulation
- Compilation edge cases

**Relevance**: LOW - Internal compiler details

---

#### **ast.js** (13 tests, 184 lines)

- AST structure validation
- AST node types
- AST visitor patterns

**Relevance**: LOW - Internal parser details

---

#### **precompiler.js** (33 tests, 408 lines)

- Template precompilation
- Precompiled template execution
- Source map generation

**Relevance**: MEDIUM - Optimization, not critical initially

---

#### **javascript-compiler.js** (7 tests, 121 lines)

- JavaScript code generation
- Compilation output format

**Relevance**: LOW - We use interpreter, not compiler

---

### Edge Cases & Compatibility

#### **regressions.js** (34 tests, 506 lines)

- Bug fixes from past issues
- Edge cases discovered in production
- GitHub issue reproductions

**Relevance**: MEDIUM - Learn from Handlebars' mistakes

---

#### **utils.js** (12 tests, 106 lines)

- Utility function tests
- Internal helper tests

**Relevance**: LOW - Internal implementation

---

#### **runtime.js** (3 tests, 76 lines)

- Runtime environment setup
- Template execution contexts

**Relevance**: LOW - Internal runtime

---

#### **source-map.js** (2 tests, 56 lines)

- Source map generation
- Error location mapping

**Relevance**: LOW - Nice for debugging, not critical

---

#### **spec.js** (1 test, 46 lines)

- Test harness verification

**Relevance**: LOW - Meta-testing

---

#### **require.js** (2 tests, 23 lines)

- Module loading tests

**Relevance**: LOW - Environment-specific

---

## Priority Triage

### P0 - Must Have (Core Functionality)

- **basic.js** (39 tests) - Variables, paths, escaping, keywords
- **builtins.js** (42 tests) - #if, #each, #with
- **data.js** (21 tests) - @root, @index, @first, @last, @key
- **helpers.js** (partial: ~40 tests) - Basic helper invocation, params, hash, options
- **security.js** (33 tests) - Prototype protection

**Subtotal: ~175 tests**

### P1 - Should Have (Enhanced Functionality)

- **tokenizer.js** (55 tests) - Lexer validation
- **blocks.js** (partial: ~20 tests) - Inverted sections, block params
- **helpers.js** (remaining: ~40 tests) - Advanced helper features
- **whitespace-control.js** (6 tests) - Clean output

**Subtotal: ~120 tests**

### P2 - Nice to Have (Advanced Features)

- **subexpressions.js** (12 tests) - Nested expressions
- **strict.js** (18 tests) - Development mode
- **regressions.js** (partial: ~15 tests) - Known edge cases

**Subtotal: ~45 tests**

### P3 - Future/Skip

- **partials.js** (60 tests) - Not needed
- **precompiler.js** (33 tests) - Optimization
- **compiler.js** (13 tests) - Internal
- **ast.js** (13 tests) - Internal
- **javascript-compiler.js** (7 tests) - Not using
- **runtime.js**, **utils.js**, **source-map.js**, **spec.js**, **require.js** - Internal/meta

**Subtotal: ~175 tests to skip**

## Recommended Approach

1. **Start with P0**: Import and adapt ~175 critical tests
2. **Fix systematically**: Get all P0 passing before moving to P1
3. **Document deviations**: When we intentionally differ from Handlebars
4. **Add P1 gradually**: Only after P0 is solid
5. **Skip P3 entirely**: Not relevant to our use case

## Current Status

- We have 39/39 basic.js tests imported
- Passing: 34/39 (87%)
- Remaining P0 tests to import: ~136
- Estimated total P0+P1 work: ~295 tests
