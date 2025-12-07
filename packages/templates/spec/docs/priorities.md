# Failing Tests - Prioritized Action Plan

**Test Status Summary:**

- ✅ **161 passing** (50.5%)
- ❌ **60 failing** (18.8%)
- ⏭️ **98 skipped** (30.7%)
- **Total: 319 tests**

**Recent Progress:**

- Session improvement: +18 tests passing (-18 failures)
- Completed: P0.1 (lookup helper), P0.3 (block helpers), P0.4 (security), function resolution, Map/Set iteration

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

### P0.2 - Hash Arguments Parsing (11 failures)

**Impact:** HIGH - Hash arguments are core Handlebars feature

**Failing Tests:**

- `helpers.test.ts`: All hash tests fail with "Unexpected token CONTENT"
  - "helpers can take an optional hash"
  - "helpers can take an optional hash with booleans"
  - "block helpers can take an optional hash"
  - "block helpers can take an optional hash with single quoted strings"
  - "block helpers can take an optional hash with booleans"
- `helpers.test.ts`: All block params tests fail with same error (5 tests)
  - "should take precedence over context values"
  - "should take precedence over helper values"
  - "should not take precedence over pathed values"
  - "should take precedence over parent block params"
  - "should allow block params on chained helpers"

**Root Cause:** Parser doesn't recognize `key=value` syntax in expressions

**Fix:** Add hash parsing to `Parser.parseExpression()`:

- Detect `EQUALS` token after ID
- Parse hash pairs: `key=value`
- Add to AST as `hash` property on helper calls

---

### P0.3 - Block Helper `options.fn()` Not Working (10 failures)

**Impact:** HIGH - Block helpers completely broken

**Failing Tests:**

- `helpers.test.ts`:
  - "block helper" - returns empty instead of calling fn()
  - "block helper staying in the same context" - returns empty
  - "block helper should have context in this" - returns empty li tags
  - "block helper passing a new context" - returns empty
  - "block helper passing a complex path context" - returns empty
  - "nested block helpers" - returns empty
  - "the helpers hash is available in nested contexts" - returns empty
  - "block multi-params work" - only shows "Message: "
  - "helpers take precedence over same-named context properties" - missing GOODBYE
  - "Scoped names take precedence over block helpers" - missing GOODBYE

**Root Cause:** Block helper `options.fn()` not calling the block content

**Fix:** Check `Interpreter.evaluateBlockStatement()`:

- Ensure `options.fn()` properly evaluates the block program
- Verify context is passed correctly to block content
- Check that helper return values are captured

---

### P0.4 - Dangerous Property Access (Security) (6 failures)

**Impact:** HIGH - Security vulnerability

**Failing Tests:**

- `security.test.ts`: GH-1595 tests
  - "access should be denied to {{constructor}}" - returns `[object Object]` instead of empty
  - "access should be denied to {{__defineGetter__}}" - TypeError thrown
  - "access should be denied to {{__defineSetter__}}" - TypeError thrown
  - "access should be denied to {{__proto__}}" - TypeError: not a function
  - "should throw an exception when calling {{helperMissing}}" - doesn't throw
  - "should throw an exception when calling {{#helperMissing}}" - doesn't throw

**Root Cause:**

1. `lookupProperty()` not blocking dangerous properties
2. Prototype methods being called as helpers
3. `helperMissing` not preventing explicit calls

**Fix:** Add hash parsing to `Parser.parseExpression()`

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

### P1.1 - Whitespace Control `~` Syntax (5 failures)

**Impact:** MEDIUM - Clean output, not critical

**Failing Tests:**

- `whitespace-control.test.ts`: All tests return `undefined`
  - "should strip whitespace around mustache calls"
  - "should strip whitespace around simple block calls"
  - "should strip whitespace around inverse block calls"
  - "should strip whitespace around complex block calls" (parse error)
  - "should only strip whitespace once"

**Root Cause:** Lexer doesn't recognize `~` tokens

**Fix:** Add to `Lexer`:

- Recognize `{{~` and `~}}` as whitespace control markers
- Set flags on tokens to indicate whitespace stripping
- Update AST nodes to include whitespace control flags
- Implement whitespace stripping in interpreter output

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

### P1.7 - Helper Options Hash Edge Case (2 failures)

**Impact:** LOW - Edge cases with options hash

**Failing Tests:**

- `helpers.test.ts`:
  - "if a context is not found, custom helperMissing is used" - throws "Unknown helper"
  - "if a value is not found, custom helperMissing is used" - returns empty

**Root Cause:** `helperMissing` not being called when helper not found

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
