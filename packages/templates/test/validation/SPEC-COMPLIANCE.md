# Handlebars Spec Compliance Report

**Date**: December 7, 2025  
**Tests Ported**: 37 tests from spec/basic.js and spec/builtins.js  
**Pass Rate**: 16/37 (43.2%)

## Summary

Successfully imported official Handlebars spec tests and created an adapter layer to run them against our implementation. The tests reveal both strengths and gaps in our V1 implementation.

## Test Results

### ✅ Passing Tests (16/37)

**Basic Context Tests** (6/17):

- ✅ most basic
- ✅ compiling with a basic context
- ✅ compiling with an undefined context
- ✅ zeros
- ✅ false
- ✅ newlines

**Built-in Helpers Tests** (10/20):

- ✅ #if > should not change the depth list
- ✅ #with > with
- ✅ #with > with with else
- ✅ #with > with handles undefined and null
- ✅ #unless (partial - some subtests)
- ✅ #each > each
- ✅ #each > each with @index
- ✅ #each > each with @key
- ✅ #each > each with @first
- ✅ #each > each with @last
- ✅ #each > each with else

### ❌ Failing Tests (21/37)

## Failure Categories

### 1. Missing Features (Not V1 Scope)

These features are intentionally omitted from V1:

**Block Parameters (6 failures)**:

- `{{#with person as |foo|}}`
- `{{#each items as |value index|}}`
- **Reason**: Block parameter syntax (`as |var|`) not implemented in V1
- **Status**: Known limitation, documented

**Hash Parameters (3 failures)**:

- `{{#if condition includeZero=true}}`
- **Reason**: Hash syntax (`key=value`) not in V1 spec
- **Status**: Known limitation, V2 feature

**Whitespace Control (1 failure)**:

- `{{~! comment ~}}`
- **Reason**: Tilde whitespace control not implemented
- **Status**: Known limitation

**String/Number/Boolean Literals (4 failures)**:

- `{{"foo"}}`, `{{12}}`, `{{true}}`
- **Reason**: Literal values as paths not supported in V1
- **Status**: Known limitation

**Unescaped Output `{{&value}}` (1 failure)**:

- **Reason**: Ampersand syntax not implemented (use `{{{value}}}` instead)
- **Status**: Trivial to add, consider for V1.1

### 2. Real Bugs / Spec Violations (6 failures)

These reveal actual incompatibilities that should be fixed:

**Bug #1: Escape Sequence Handling (2 failures)**

```handlebars
Input: 'Awesome\\\\ foo' Expected: 'Awesome\\ foo' Actual: 'Awesome\ foo'
```

- **Issue**: Double backslash escaping not working correctly
- **Impact**: Medium - affects literal backslash rendering
- **Fix**: Review lexer escape handling

**Bug #2: Context Data Not Accessible (1 failure)**

```handlebars
Template: '{{#with foo}}{{#with bar}}{{../value}}{{/with}}{{/with}}'
Expected: 'test'
Actual:   ''
```

- **Issue**: Parent context lookup failing in nested #with
- **Impact**: High - breaks documented ../path feature
- **Fix**: Review context stack in interpreter

**Bug #3: Function Values Not Evaluated (2 failures)**

```handlebars
# When value is a function returning false Expected: if shows else block Actual: if shows main block
```

- **Issue**: Functions in context should be called automatically
- **Impact**: High - breaks Handlebars compatibility
- **Fix**: Auto-call functions during value resolution

**Bug #4: Nested @index Missing Parent (1 failure)**

```handlebars
Template: '{{#each items}}{{@../index}}-{{@index}}{{/each}}'
Expected: '0-0. goodbye! 1-0. Goodbye!'
Actual:   '-0. goodbye! -0. Goodbye!'
```

- **Issue**: `@../index` not resolving to parent loop's index
- **Impact**: Medium - affects nested loops
- **Fix**: Support `../` in data variable paths

### 3. Testing Issues (1 failure)

**Implicit Block Helpers**:

```handlebars
{{#goodbye}}...{{/goodbye}} (where goodbye is truthy value, not helper)
```

- **Issue**: Test expects blocks to work with non-helper values
- **Our behavior**: Requires explicit helper, throws "Unknown block helper"
- **Status**: May be intentional difference - needs investigation

## Recommendations

### Priority 1: Fix Real Bugs

1. **Parent context lookup** - Critical for nested contexts
2. **Function auto-evaluation** - Required for Handlebars compatibility
3. **Nested @data paths** - Important for complex templates
4. **Escape sequences** - Polish issue but affects edge cases

### Priority 2: Consider Easy Additions

1. **{{&value}} unescaped syntax** - Trivial to add, improves compatibility
2. **Literal values as paths** - Low priority, edge case feature

### Priority 3: Document Limitations

1. Update README with "V1 Omissions" section
2. List block parameters, hash params, whitespace control as V2 features
3. Document workarounds where applicable

## Conclusion

**43% pass rate is reasonable for V1** given intentional omissions. However, the **6 real bugs** should be fixed to claim true Handlebars compatibility for the features we do support.

**Next Steps**:

1. Fix the 6 real bugs (est. 2-4 hours)
2. Re-run tests (expect ~70% pass rate)
3. Port more spec tests (blocks.js, utils.js) for additional validation
4. Document V1 scope and limitations clearly
