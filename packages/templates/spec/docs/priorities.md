# Failing Tests - Prioritized Action Plan

**Test Status Summary:**
- ✅ **127 passing** (40%)
- ❌ **94 failing** (29%)
- ⏭️ **98 skipped** (31%)
- **Total: 319 tests**

---

## Priority 0: Critical Blockers (Must Fix for V1)

### P0.1 - Missing `lookup` Built-in Helper (11 failures)
**Impact:** HIGH - Security tests and dynamic property access broken

**Failing Tests:**
- `security.test.ts`: All GH-1495 and GH-1595 tests using `{{lookup}}`
  - "should not allow constructors to be accessed"
  - "should allow constructor property if ownProperty" (2 tests)
  - All `{{lookup this "constructor"}}` tests (5 tests)
  
**Root Cause:** `lookup` helper not implemented in built-in helpers

**Fix:** Implement `lookup` helper in `src/helpers/builtins.ts`:
```typescript
lookup: (obj: any, field: any) => {
  if (obj == null) return undefined;
  return lookupProperty(obj, String(field));
}
```

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

**Fix:**
1. Update `lookupProperty()` to reject: `constructor`, `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`
2. Add validation before calling helpers to check if value is actually a function
3. Add explicit check to prevent calling `helperMissing` and `blockHelperMissing` directly

---

## Priority 1: Important Features (Needed for Robust V1)

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

### Priority 0 (Must Fix) - 38 failures
1. **Missing `lookup` helper** - 11 failures → ~2 hours
2. **Hash arguments parsing** - 11 failures → ~8 hours
3. **Block helper options.fn()** - 10 failures → ~4 hours
4. **Security property blocking** - 6 failures → ~4 hours

**Estimated P0 work: ~18 hours**

### Priority 1 (Should Fix) - 21 failures
1. **Whitespace control** - 5 failures → ~6 hours
2. **Escape handling** - 5 failures → ~2 hours
3. **Comment tokens** - 3 failures → ~1 hour
4. **Bracket literals** - 3 failures → ~1 hour
5. **Various edge cases** - 5 failures → ~3 hours

**Estimated P1 work: ~13 hours**

### Priority 2 (Nice to Have) - 35 failures
Tokenizer implementation differences that don't affect functionality

**Total estimated work: ~31 hours**

---

## Recommended Fix Order

1. **P0.1 - Implement `lookup` helper** (2h) - Easiest, unblocks 11 tests
2. **P0.4 - Fix security property blocking** (4h) - Critical security issue
3. **P0.3 - Fix block helper options.fn()** (4h) - Core functionality
4. **P0.2 - Implement hash arguments** (8h) - Complex but essential
5. **P1.1 - Add whitespace control** (6h) - Clean output
6. **P1.7-P1.10 - Fix remaining edge cases** (5h) - Polish

**After these fixes: Estimated 85-90% test pass rate**
