# Handlebars Spec Compliance Testing

## Philosophy

**Never guess. Always verify against Handlebars.**

This document describes how we systematically test our implementation against the official Handlebars specification to ensure exact behavioral compatibility.

## The Handlebars Spec

### Official Source

- **Repository**: [handlebars-lang/handlebars.js](https://github.com/handlebars-lang/handlebars.js)
- **Version**: 4.7.8 (current verification target)
- **Test Framework**: Mocha

### Spec Structure

The Handlebars repository contains the authoritative specification through its test suite:

1. **`spec/tokenizer.js`** (~80+ tests)
   - Tokenization rules for mustaches, blocks, comments
   - Path notation (`.`, `..`, `/`)
   - Whitespace handling
   - Literals, identifiers, data variables
   - Edge cases and special characters

2. **`spec/parser.js`** and **`spec/ast.js`**
   - AST structure validation
   - Node types and properties
   - Block nesting and structure
   - Parameter parsing

3. **`spec/basic.js`**
   - Compilation behavior
   - Runtime execution
   - Helper invocation
   - Context resolution

4. **`spec/mustache/specs/`**
   - Mustache compatibility tests
   - Core template behavior
   - Escaping and special characters

## Current Verification Status

### Tokenizer Level (Implemented)

**Tool**: `test-scripts/verify-against-handlebars.cjs`

**Method**: Direct comparison of token sequences between our lexer and Handlebars tokenizer

**Coverage**: 37 test cases extracted from `spec/tokenizer.js`

- ✅ 30/37 passing (81%)
- ❌ 7 failing (unimplemented features: hash args, `{{&}}`, `{{else}}`)

**Verified Patterns**:

- Basic paths: `{{foo.bar}}`, `{{foo/bar}}`
- Parent paths: `{{../foo}}`, `{{../../foo}}`
- Current context: `{{.}}`, `{{./foo}}`
- Whitespace: `{{  foo  .  bar  }}`
- Data variables: `{{@root}}`, `{{@index}}`
- Blocks: `{{#if foo}}`, `{{#each items}}`
- Subexpressions: `{{outer (inner foo)}}`
- Edge cases: `{{foo...}}` (tokenizes as `foo`, `..`, `.`)

**Confidence**: 95% for verified patterns

### Parser Level (Not Yet Verified)

**Status**: ⚠️ No systematic verification

**Risk**: Parser may produce AST that differs from Handlebars in:

- Node structure
- Property names/values
- Block parameter handling
- Comment preservation
- Position information

**Estimated Coverage**: Unknown (~60-70% guess based on unit tests)

### Compilation/Runtime Level (Not Verified)

**Status**: ❌ No verification

**Risk**: Even with correct tokenizer and parser, compilation could differ in:

- Helper resolution
- Context lookup
- Partial handling
- Escaping behavior

## Verification Methods

### Method 1: Tokenizer Comparison (Current)

**Implementation**: `test-scripts/verify-against-handlebars.cjs`

**How It Works**:

1. Parse template with Handlebars: `Handlebars.parse(template)`
2. Extract token sequence from Handlebars AST
3. Tokenize same template with our lexer
4. Compare token-by-token (type and value)
5. Report matches and mismatches

**Example**:

```javascript
const Handlebars = require('handlebars');
const { Lexer } = require('../dist/lexer/lexer.js');

// Parse with Handlebars
const ast = Handlebars.parse('{{foo.bar}}');
// Expected tokens: OPEN, ID(foo), SEP(.), ID(bar), CLOSE

// Tokenize with our lexer
const lexer = new Lexer();
lexer.setInput('{{foo.bar}}');
// Verify: each token matches type and value
```

**Coverage**: 37 test cases, can be expanded to full `spec/tokenizer.js` (~80+ cases)

**Run Verification**:

```bash
pnpm exec tsx test-scripts/verify-against-handlebars.cjs
```

**Strengths**:

- Fast feedback
- Precise mismatch identification
- Easy to debug token-level issues

**Limitations**:

- Only tests tokenizer, not parser or runtime
- Requires manual extraction of expected tokens from Handlebars

### Method 2: AST Comparison (Planned)

**Status**: 🚧 Not yet implemented

**Proposed Implementation**: `test-scripts/verify-parser-against-handlebars.cjs`

**How It Would Work**:

1. Parse template with Handlebars: `Handlebars.parse(template)`
2. Parse same template with our parser
3. Compare AST structure recursively:
   - Node types
   - Property names and values
   - Child node structure
   - Position information (optional)
4. Report structural differences

**Example**:

```javascript
const handlebarsAST = Handlebars.parse('{{#if foo}}bar{{/if}}');
const ourAST = parse('{{#if foo}}bar{{/if}}');

// Compare:
// - Root node type (Program)
// - Statement types (BlockStatement)
// - Helper names ('if')
// - Parameter structure
// - Child content
```

**Coverage Needed**: Extract cases from `spec/parser.js` and `spec/ast.js`

**Strengths**:

- Validates full parser behavior
- Catches structural issues
- Tests block nesting and complex templates

**Challenges**:

- AST structure comparison is complex
- Position info may differ (not critical)
- Need to handle equivalent but differently structured trees

### Method 3: Mocha Test Import (Planned)

**Status**: 🎯 Future goal

**How It Would Work**:

1. Clone Handlebars repository
2. Import Handlebars Mocha test files
3. Adapt tests to run against our implementation
4. Use same test suite as Handlebars

**Example Adaptation**:

```javascript
// Original Handlebars test (spec/tokenizer.js)
it('should tokenize a simple mustache', function () {
  const result = Handlebars.parse('{{foo}}');
  // assertions...
});

// Adapted for our implementation
it('should tokenize a simple mustache', function () {
  const lexer = new Lexer();
  lexer.setInput('{{foo}}');
  // same assertions, different API
});
```

**Coverage**: Full Handlebars spec (~500+ tests)

**Strengths**:

- 100% spec coverage
- Authoritative test cases
- Automatic updates with Handlebars releases

**Challenges**:

- Significant setup work
- API differences require test adaptation
- May expose many unimplemented features

### Method 4: Exploration Scripts (Current)

**Implementation**: `test-scripts/verify-handlebars.cjs`

**Purpose**: Interactive investigation of Handlebars behavior

**How to Use**:

```bash
node test-scripts/verify-handlebars.cjs
# Modify script to test specific patterns
# Observe Handlebars output
```

**Use Cases**:

- "How does Handlebars handle `{{foo...}}`?"
- "What tokens does `{{  foo  .  bar  }}` produce?"
- Investigating edge cases before implementing

**Strengths**:

- Quick experimentation
- No test infrastructure needed
- Useful for research and debugging

### Method 5: Reference Compiler (Future)

**Status**: 🔮 Long-term goal

**How It Would Work**:

1. Compile templates with both Handlebars and our implementation
2. Execute with same data
3. Compare rendered output
4. Ensure identical results

**Coverage**: End-to-end behavior validation

**Strengths**:

- Tests complete pipeline
- Validates runtime behavior
- Catches subtle semantic differences

**Challenges**:

- Requires full compilation implementation
- May have intentional differences (e.g., no lambdas)
- Complex test data setup

## Workflow for Spec Compliance

### When Implementing New Features

1. **Consult the Spec First**

   ```bash
   # Check Handlebars behavior
   node -e "const H = require('handlebars'); console.log(JSON.stringify(H.parse('{{template}}'), null, 2));"
   ```

2. **Add to Verification Suite**
   - Add test case to `verify-against-handlebars.cjs` (tokenizer)
   - Add test case to `verify-parser-against-handlebars.cjs` (when available)
   - Run verification before implementing

3. **Implement to Match**
   - Write code
   - Run verification: `pnpm exec tsx test-scripts/verify-against-handlebars.cjs`
   - Iterate until tokens/AST match exactly

4. **Add Unit Tests**
   - Add regression tests to `test/`
   - Document behavior in comments

### When Fixing Bugs

1. **Verify Bug Against Handlebars**

   ```bash
   node test-scripts/verify-handlebars.cjs
   # Modify to test specific case
   ```

2. **Add Failing Test to Verification**
   - Add to `verify-against-handlebars.cjs`
   - Confirm it fails: `pnpm exec tsx test-scripts/verify-against-handlebars.cjs`

3. **Fix Until Green**
   - Modify lexer/parser
   - Re-run verification
   - Ensure fix doesn't break other tests

4. **Add Regression Test**
   - Add to unit tests with reference to spec

## Known Spec Deviations

### Unimplemented Features

These features are in the Handlebars spec but not yet implemented:

- **Hash arguments**: `{{foo bar=baz}}`
- **Unescaping**: `{{&html}}` or `{{{html}}}`
- **`{{else}}` keyword**: Proper keyword tokenization
- **Comments**: `{{! comment }}`, `{{!-- block comment --}}`
- **Partials**: `{{> partial}}`
- **Raw blocks**: `{{{{raw}}}} {{{{/raw}}}}`
- **Block parameters**: `{{#each items as |item index|}}`
- **Decorators**: `{{* decorator }}`
- **Alternative delimiters**: Custom open/close tags

### Intentional Deviations

- **No lambdas**: Security requirement (no `Function` constructor)
- **No eval**: Parser-only implementation

## Roadmap to Full Spec Compliance

### Phase 1: Complete Tokenizer Verification ✅ In Progress

- [x] Extract 37 test cases from `spec/tokenizer.js`
- [x] Create comparison script (`verify-against-handlebars.cjs`)
- [x] Achieve 81% pass rate (30/37)
- [ ] Extract remaining ~50 test cases from `spec/tokenizer.js`
- [ ] Implement missing tokenizer features (hash args, `{{&}}`, `{{else}}`)
- [ ] Achieve 100% tokenizer spec compliance

**Target**: All tokenizer tests passing

### Phase 2: Parser Verification 🚧 Not Started

- [ ] Study Handlebars AST structure from `spec/parser.js`
- [ ] Create `verify-parser-against-handlebars.cjs`
- [ ] Extract test cases from `spec/parser.js` and `spec/ast.js`
- [ ] Implement AST comparison logic
- [ ] Fix parser to match Handlebars AST exactly
- [ ] Verify block nesting and complex structures

**Target**: Parser produces identical AST to Handlebars

### Phase 3: Mocha Test Integration 🔮 Future

- [ ] Set up Handlebars repo as submodule or dependency
- [ ] Create test adapter layer for API differences
- [ ] Import `spec/tokenizer.js` tests
- [ ] Import `spec/parser.js` tests
- [ ] Run full Handlebars tokenizer + parser test suite
- [ ] Integrate into CI/CD

**Target**: Pass full Handlebars spec test suite

### Phase 4: Compilation Verification 🔮 Long Term

- [ ] Implement template compilation
- [ ] Create rendering comparison tests
- [ ] Verify helper resolution matches Handlebars
- [ ] Verify context lookup matches Handlebars
- [ ] Test escaping behavior
- [ ] End-to-end template tests

**Target**: Compiled templates produce identical output

## Test Scripts Reference

### Current Scripts (in `test-scripts/`)

#### `verify-against-handlebars.cjs`

**Purpose**: Systematic tokenizer verification

**Usage**:

```bash
pnpm exec tsx test-scripts/verify-against-handlebars.cjs
```

**Output**:

- Green ✓ for passing tests
- Red ✗ for failures with token diff
- Summary: "Passed: 30/37"

**When to Run**:

- After lexer changes
- Before committing tokenizer work
- When adding new token types

#### `verify-handlebars.cjs`

**Purpose**: Interactive Handlebars exploration

**Usage**:

```bash
node test-scripts/verify-handlebars.cjs
# Edit script to test different templates
```

**When to Use**:

- Researching Handlebars behavior
- Testing edge cases
- Planning new features

#### Debug Scripts

- `check-parse.ts`: Quick parser output check
- `check-whitespace.ts`: Whitespace tokenization debug
- `debug-triple-dot.ts`: Specific edge case testing

### Future Scripts (Planned)

#### `verify-parser-against-handlebars.cjs`

**Purpose**: AST structure comparison

**Planned Usage**:

```bash
pnpm exec tsx test-scripts/verify-parser-against-handlebars.cjs
```

**Will Test**:

- Node types match
- Properties match
- Structure matches
- Block nesting correct

#### `import-handlebars-specs.js`

**Purpose**: Import and adapt Handlebars Mocha tests

**Planned Usage**:

```bash
node test-scripts/import-handlebars-specs.js
# Generates adapted test files in test/spec/
```

#### `verify-compilation.cjs`

**Purpose**: Compare compiled output

**Planned Usage**:

```bash
pnpm exec tsx test-scripts/verify-compilation.cjs
```

## Continuous Verification

### In Development

```bash
# Quick check during development
pnpm exec tsx test-scripts/verify-against-handlebars.cjs

# Full test suite
pnpm test

# Check errors
pnpm run typecheck
```

### Before Commit

```bash
# Verify spec compliance
pnpm exec tsx test-scripts/verify-against-handlebars.cjs

# Run all tests
pnpm test

# Ensure no type errors
pnpm run typecheck
```

### In CI/CD (Future)

```bash
# Tokenizer compliance
pnpm exec tsx test-scripts/verify-against-handlebars.cjs

# Parser compliance
pnpm exec tsx test-scripts/verify-parser-against-handlebars.cjs

# Full Handlebars spec suite
pnpm test:spec

# Unit tests
pnpm test
```

## Maintaining Spec Compliance

### When Handlebars Updates

1. Update Handlebars dependency: `pnpm add -D handlebars@latest`
2. Review Handlebars changelog for changes
3. Run all verification scripts
4. Fix any new failures
5. Add new test cases for new features

### When Adding Features

1. Check Handlebars spec first
2. Add verification test case
3. Implement to match spec exactly
4. Run verification
5. Add unit tests

### When Debugging

1. Reproduce with Handlebars first
2. Add minimal failing case to verification
3. Fix until verification passes
4. Add regression test

## Success Metrics

### Current

- ✅ 782 unit tests passing
- ✅ 30/37 tokenizer spec tests passing (81%)
- ⚠️ Parser: untested against spec
- ❌ Compilation: not implemented

### Target (Phase 1)

- ✅ 782+ unit tests passing
- ✅ 80+ tokenizer spec tests passing (100%)
- ⚠️ Parser: verified against spec
- ❌ Compilation: in progress

### Target (Phase 3)

- ✅ 1000+ unit tests passing
- ✅ Full Handlebars tokenizer suite (100%)
- ✅ Full Handlebars parser suite (100%)
- ✅ Compilation verified

## References

### Official Handlebars Resources

- **Repository**: https://github.com/handlebars-lang/handlebars.js
- **Tokenizer Spec**: `spec/tokenizer.js` (~80 tests)
- **Parser Spec**: `spec/parser.js`, `spec/ast.js` (~200 tests)
- **Basic Spec**: `spec/basic.js` (~400 tests)
- **Mustache Spec**: `spec/mustache/specs/` (Mustache compatibility)

### Our Implementation

- **Source**: `packages/templates/src/`
- **Tests**: `packages/templates/test/`
- **Verification**: `packages/templates/test-scripts/`

### Key Principles

1. **Spec is truth**: Handlebars behavior is always correct
2. **Verify, don't guess**: Always test against actual Handlebars
3. **Document deviations**: If we differ from spec, document why
4. **Comprehensive coverage**: Test edge cases, not just happy paths
5. **Continuous verification**: Run spec tests regularly, not just once
