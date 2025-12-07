# Failing Tests - Prioritized Action Plan

**Test Status Summary:**

- ✅ **189 passing** (58.9%)
- ❌ **34 failing** (10.6%)
- ⏭️ **98 skipped** (30.5%)
- **Total: 321 tests**

**Recent Progress:**

- Session improvement: +6 tests passing (-6 failures)
- Completed: Block parameters (as |param1 param2|) - P1.6
- Fixed: Parser supports `as |param|` syntax with PIPE tokens
- Fixed: Interpreter binds block params to shadow context/helpers
- Fixed: Block params work with #each (item, index), #with, custom helpers
- Note: 1 edge case remaining (chained helper in else clause with block params)

---

## Priority 0: Critical Blockers (Must Fix for V1)

### ✅ P0.1 - Missing `lookup` Built-in Helper - COMPLETED

**Status:** ✅ Fixed - Added lookup helper using secure lookupProperty()
**Tests Fixed:** 6 security tests now passing

---

### ✅ P0.3 - Block Helper `options.fn()` Not Working - COMPLETED

**Status:** ✅ Fixed - Implemented evaluateCustomBlockHelper() with proper options object
**Tests Fixed:** 13 tests now passing (all core block helper tests)

---

### ✅ P0.4 - Dangerous Property Access (Security) - COMPLETED

**Status:** ✅ Fixed - Implemented comprehensive security blocking:

- lookupProperty() blocks dangerous properties (constructor, **proto**, etc.)
- Exception for constructor when it's an own property
- lookupHelper() uses lookupProperty() to prevent prototype access
- helperMissing/blockHelperMissing explicit call blocking
  **Tests Fixed:** All 17 P0.4 security tests now passing

---

### ✅ P0.2 - Hash Arguments Parsing - COMPLETED

**Status:** ✅ Fixed - Implemented complete hash argument support:

- Added EQUALS token type to lexer
- Modified parser to detect `key=value` patterns in both mustache and block statements
- Created HashPair nodes from evaluated expressions
- Updated interpreter to evaluate hash and pass to helpers via options.hash
  **Tests Fixed:** 5 hash tests now passing

---

## Priority 1: Important Features (Needed for Robust V1)

### ✅ P1.0a - Built-in Helpers Function Resolution - COMPLETED

**Status:** ✅ Fixed - #if, #unless, #each, #with now call functions to get actual values
**Tests Fixed:** 3 "function argument" tests now passing

---

### ✅ P1.0b - Map/Set Iteration Support - COMPLETED

**Status:** ✅ Fixed - #each now supports Map and Set collections

- Map: iterates [key, value] pairs with @key/@index/@first/@last
- Set: iterates values with @key/@index/@first/@last
  **Tests Fixed:** 2 Map/Set tests now passing

---

### ✅ P1.1 - Whitespace Control `~` Syntax - COMPLETED

**Status:** ✅ Fixed - Implemented complete whitespace control support

**Implementation:**

- Lexer recognizes `~` as STRIP token
- Parser sets strip flags on MustacheStatement and BlockStatement nodes
- Interpreter applies whitespace control in `applyWhitespaceControl()` and `evaluateProgram()`
- Fixed parser bug: `{{^~}}` now correctly parses as close strip, not open strip
- Fixed interpreter logic: conditional helpers now correctly handle strip flags for main/inverse programs

**Tests Fixed:** 5 whitespace control tests (all passing)

---

### P1.2 - Tokenizer Escape Handling (5 failures)

**Impact:** MEDIUM - Affects escape sequences in templates

**Failing Tests:**

- `tokenizer.test.ts`:
  - "supports escaping delimiters" - wrong token count
  - "supports escaping multiple delimiters" - wrong token count
  - "supports escaping a triple stash" - wrong token count
  - "supports escaped mustaches after escaped escape characters" - wrong token count
  - "supports escaped escape characters after escaped mustaches" - wrong token count

**Root Cause:** Escape sequences handled at wrong stage (preprocessor vs lexer)

**Impact:** Low - escape sequences work in runtime, just token representation differs

---

### P1.3 - Comment Token Text (3 failures)

**Impact:** LOW - Comments work, just token text differs

**Failing Tests:**

- `tokenizer.test.ts`:
  - "tokenizes a comment as COMMENT" - returns content only, not full `{{! ... }}`
  - "tokenizes a block comment as COMMENT" - returns content only
  - "tokenizes a block comment with whitespace as COMMENT" - returns content only

**Root Cause:** Lexer returns comment content only, not full token text

**Impact:** Low - comments work correctly, just internal token representation differs

---

### P1.4 - Bracket Literal Tokens (3 failures)

**Impact:** LOW - Reserved words work, just token type differs

**Failing Tests:**

- `tokenizer.test.ts`:
  - "allows path literals with []" - returns `BRACKET_LITERAL` instead of `ID`
  - "allows multiple path literals on a line with []" - returns `BRACKET_LITERAL` instead of `ID`
  - "allows escaped literals in []" - wrong token count

**Root Cause:** Lexer has separate `BRACKET_LITERAL` token type

**Impact:** Low - bracket literals work correctly, just different token type

---

### P1.5 - Inverse Section Tokenization (1 failure)

**Impact:** MEDIUM - Affects `{{^}}` inverse sections

**Failing Tests:**

- `tokenizer.test.ts`:
  - "tokenizes inverse sections as INVERSE" - returns 2 tokens instead of 1

**Root Cause:** Lexer tokenizes `{{^}}` as separate tokens

**Impact:** Medium - may affect inverse section parsing

---

### P1.6 - Subexpression Tokenization (1 failure)

**Impact:** LOW - Subexpressions not in V1 requirements

**Failing Tests:**

- `tokenizer.test.ts`:
  - "tokenizes subexpressions" - missing CLOSE token

**Root Cause:** Parser/lexer interaction for nested parens

---

### ✅ P1.7 - Data Variables (@foo, @root, etc.) - COMPLETED

**Status:** ✅ Fixed - Implemented complete data variable support

**Implementation:**

- Added `data` parameter to RenderOptions for user-provided data variables
- Updated Interpreter.evaluate() to merge user data into root data frame with @ prefix
- Data variables accessible via @foo, @bar, etc. in templates
- @root automatically set to root context
- @index, @key, @first, @last already working in #each helper
- Added validation to prevent @foo/../name (data variables cannot use parent scope)
- Data variables can be functions (called on access like regular helpers)

**Tests Fixed:** 5 data variable tests (6 total - 1 has test harness issue)

---

### ✅ P1.6 - Block Parameters (as |param1 param2|) - COMPLETED

**Status:** ✅ Fixed - Implemented block parameter support (6 of 7 tests passing)

**Implementation:**

**Lexer:**

- Added PIPE token type (`|`) for block parameter delimiters
- Tokenizes `as |foo bar|` correctly

**Parser:**

- Updated BlockStatement AST node to include optional `blockParams?: string[]` field
- Modified `parseParamsAndHash()` to stop before "as" keyword
- Added block parameter parsing: `as |param1 param2|` after params/hash
- Stores parameter names in `blockParams` array on BlockStatement
- Supports block params on both regular and inverse block statements

**Interpreter:**

- Added `blockParamsStack` to track nested block parameter scopes
- Block params shadow simple identifiers (not pathed with ./ or @)
- Block params shadow both context values AND helpers
- Pathed lookups like `{{./value}}` explicitly skip block params
- Multi-part paths like `{{foo.bar}}` can start with block param `foo`
- Updated `evaluatePathExpression()` to check block params before context/helpers
- Updated `isHelperCall()` to check block params before helpers
- Updated built-in helpers to support block params:
  - `#with person as |foo|` - binds person to foo
  - `#each items as |item index|` - binds item and index
- Custom helpers receive `options.fn.blockParams` (count) and pass values via `options.fn(ctx, { blockParams: [val1, val2] })`

**Scoping Rules:**

- Block params shadow: context values, helpers (for simple identifiers)
- Block params DON'T shadow: pathed values (`./foo`), parent values (`../foo`), data variables (`@foo`)
- Inner block params shadow outer block params (proper nesting)
- Block params work with multi-part paths: `{{foo.bar}}` where `foo` is block param

**Tests Fixed:** 6 tests passing

- ✅ should take precedence over context values
- ✅ should take precedence over helper values
- ✅ should not take precedence over pathed values (./value)
- ✅ should take precedence over parent block params
- ✅ #with provides block parameter
- ✅ #each with block params
- ❌ should allow block params on chained helpers (edge case: else clause with helper + block params)

---

### P1.8 - Malformed Input Handling (2 failures)

**Impact:** LOW - Error handling edge cases

**Failing Tests:**

- `tokenizer.test.ts`:
  - "does not time out in a mustache with a single } followed by EOF"
  - "does not time out in a mustache when invalid ID characters are used"

**Root Cause:** Error recovery in lexer differs from Handlebars

---

### P1.9 - Constructor as ownProperty (1 failure)

**Impact:** LOW - Edge case for user-defined constructor property

**Failing Tests:**

- `security.test.ts`:
  - "should allow the 'constructor' property if it is an ownProperty" - returns `[object Object]`

**Root Cause:** Need to check if `constructor` is own property before blocking

---

### P1.10 - Block Helper Inverted Section Parser (1 failure)

**Impact:** MEDIUM - Standalone inverse sections in blocks

**Failing Tests:**

- `helpers.test.ts`:
  - "block helper inverted sections" - ParserError: "Unexpected token OPEN_INVERSE in program body"

**Root Cause:** Parser doesn't support `{{^}}` standalone inverse in block helpers (needs `{{else}}`)

---

## Summary by Priority

### ✅ Priority 0 (Must Fix) - MOSTLY COMPLETED

- ✅ **P0.1 - lookup helper** - FIXED: 6 tests passing
- ✅ **P0.3 - Block helper options.fn()** - FIXED: 13 tests passing
- ✅ **P0.4 - Security property blocking** - FIXED: 17 tests passing (all security tests)
- ⏳ **P0.2 - Hash arguments parsing** - 11 failures remain → ~8 hours

**P0 Status: 36/47 tests fixed (77%)**

### Priority 1 (Should Fix) - PARTIALLY COMPLETED

- ✅ **P1.0a - Function resolution** - FIXED: 3 tests passing
- ✅ **P1.0b - Map/Set iteration** - FIXED: 2 tests passing
- ⏳ **Whitespace control** - 5 failures remain → ~6 hours
- ⏳ **Escape handling** - 5 failures remain → ~2 hours
- ⏳ **Comment tokens** - 3 failures remain → ~1 hour
- ⏳ **Bracket literals** - 3 failures remain → ~1 hour
- ⏳ **Various edge cases** - 8 failures remain → ~3 hours

**P1 Status: 5/29 tests fixed (17%)**

### Priority 2 (Nice to Have) - ~25 failures

Tokenizer implementation differences that don't affect functionality

**Overall Progress:**

- **Tests passing: 161/319 (50.5%)** ⬆️ from 127 (40%)
- **Session improvement: +34 tests total (+18 this session)**
- **Remaining P0+P1 work: ~21 hours**

---

## Recommended Next Steps

1. ✅ ~~P0.1 - Implement lookup helper~~ - COMPLETED
2. ✅ ~~P0.4 - Fix security property blocking~~ - COMPLETED
3. ✅ ~~P0.3 - Fix block helper options.fn()~~ - COMPLETED
4. ⏳ **P0.2 - Implement hash arguments** (8h) - Last critical blocker
5. **P1.1 - Add whitespace control** (6h) - Clean output
6. **P1 Edge cases** (7h) - Polish remaining features

**Target after P0.2: 172+ tests passing (54%)**
**Target after P1: 185+ tests passing (58%)**
