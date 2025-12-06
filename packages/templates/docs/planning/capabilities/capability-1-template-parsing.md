# Capability 1: Lexical Analysis (Tokenization)

**Goal:** Transform template strings into token streams following Handlebars tokenization rules. Must work in Cloudflare Workers without `eval()` or `new Function()`.

---

## Feature 1.1: Core Token Types

**Goal:** Implement recognition for essential token types from Handlebars spec

### Task C1-F1-T1: Define Token Type Enumerations

**Status:** `[x]` Complete

- Create TypeScript enum or const object for all token types
- Include delimiters: `OPEN` (`{{`), `CLOSE` (`}}`), `OPEN_UNESCAPED` (`{{{`), `CLOSE_UNESCAPED` (`}}}`)
- Include block tokens: `OPEN_BLOCK` (`{{#`), `OPEN_ENDBLOCK` (`{{/`), `OPEN_INVERSE` (`{{^`)
- Include special tokens: `INVERSE` (`{{else}}`), `COMMENT` (`{{!` or `{{!--`)
- Include content: `CONTENT` (plain text between mustaches)
- Include literals: `STRING`, `NUMBER`, `BOOLEAN`, `UNDEFINED`, `NULL`
- Include identifiers: `ID` (variable/helper names)
- Include separators: `SEP` (`.` or `/` for dot notation)
- Include data prefix: `DATA` (`@` for data variables)
- Include `EOF` for end of input

**Deliverable:** `src/lexer/token-types.ts` with token type definitions

**Tests:**

- Token enum/const has all required types
- Token types can be compared for equality
- Token types are exported for use in parser

### Task C1-F1-T2: Create Token Interface

**Status:** `[x]` Complete

- Define Token interface with fields:
  - `type: TokenType` — The token type
  - `value: string` — The lexeme (raw text)
  - `loc: SourceLocation | null` — Position info (line, column, index)
- Define SourceLocation interface with:
  - `start: Position` — Starting position
  - `end: Position` — Ending position
- Define Position interface with:
  - `line: number` — Line number (1-based)
  - `column: number` — Column number (0-based)
  - `index: number` — Character index (0-based)

**Deliverable:** `src/lexer/token.ts` with Token, SourceLocation, and Position interfaces

**Tests:**

- Token interface includes all required fields
- SourceLocation properly typed
- Position properly typed

### Task C1-F1-T3: Implement Basic Lexer Class Structure

**Status:** `[x]` Complete

- Create Lexer class with state fields:
  - `input: string` — The template string
  - `index: number` — Current position in input
  - `line: number` — Current line number
  - `column: number` — Current column number
  - `tokens: Token[]` — Accumulated tokens
- Implement `setInput(template: string): void` method to initialize state
- Implement `lex(): Token | null` method to extract next token
- Implement helper: `peek(): string` to look ahead without consuming
- Implement helper: `advance(): string` to consume and return next character
- Implement helper: `match(str: string): boolean` to check if next chars match
- Implement helper: `isEOF(): boolean` to check end of input

**Deliverable:** `src/lexer/lexer.ts` with Lexer class skeleton

**Tests:**

- `setInput()` initializes state correctly
- `advance()` moves position and updates line/column
- `peek()` doesn't modify state
- `match()` correctly identifies multi-character sequences
- `isEOF()` returns true at end of input

### Task C1-F1-T4: Implement Plain Text (CONTENT) Tokenization

**Status:** `[x]` Complete

- Scan characters until `{{` is encountered
- Create CONTENT token with accumulated text
- Handle empty content (two mustaches adjacent)
- Track position correctly across newlines

**Deliverable:** CONTENT token recognition in Lexer

**Tests:**

- Plain text with no mustaches: `"Hello World"` → Single CONTENT token
- Text before mustache: `"Hello {{name}}"` → CONTENT("Hello "), then tokens
- Multiple newlines in content update line tracking
- Empty content between mustaches handled gracefully

### Task C1-F1-T5: Implement Delimiter Tokenization

**Status:** `[x]` Complete ✅

- Recognize `{{` → OPEN token
- Recognize `}}` → CLOSE token
- Recognize `{{{` → OPEN_UNESCAPED token (check 3 braces before 2)
- Recognize `}}}` → CLOSE_UNESCAPED token
- Track position for each delimiter

**Deliverable:** Delimiter token recognition in Lexer

**Tests:**

- `{{` → OPEN token
- `}}` → CLOSE token
- `{{{` → OPEN_UNESCAPED (not OPEN)
- `}}}` → CLOSE_UNESCAPED (not CLOSE)
- Position tracking accurate

### Task C1-F1-T6: Implement Block Delimiter Tokenization

**Status:** `[x]` Complete

- After OPEN (`{{`), check next character:
  - `#` → OPEN_BLOCK token
  - `/` → OPEN_ENDBLOCK token
  - `^` → OPEN_INVERSE token
- Handle whitespace between `{{` and special char
- Track position correctly

**Deliverable:** Block delimiter recognition in Lexer

**Tests:**

- `{{#` → OPEN_BLOCK
- `{{/` → OPEN_ENDBLOCK
- `{{^` → OPEN_INVERSE
- `{{ #` with space → OPEN, then ID("#") (not OPEN_BLOCK)
- Position tracking accurate

### Task C1-F1-T7: Implement Comment Tokenization

**Status:** `[x]` Complete

- Recognize `{{!` → Start of comment
- Recognize `{{!--` → Start of block comment
- For `{{!`, consume until `}}`
- For `{{!--`, consume until `--}}`
- Create COMMENT token with comment text (excluding delimiters)
- Handle unclosed comments → throw error

**Deliverable:** Comment token recognition in Lexer

**Tests:**

- `{{! comment }}` → COMMENT token
- `{{!-- block comment --}}` → COMMENT token
- Unclosed `{{! comment` → Error with position
- Unclosed `{{!-- comment` → Error with position
- Nested braces in comment: `{{! has }} in it }}` (consumes at first `}}`)

### Task C1-F1-T8: Implement Literal Tokenization

**Status:** `[x]` Complete

- **String literals:**
  - Recognize `"` or `'` as string start
  - Consume until matching quote
  - Handle escaped quotes: `\"` and `\'`
  - Handle escaped backslashes: `\\`
  - Create STRING token with unescaped value
  - Throw error on unclosed string
- **Number literals:**
  - Recognize digit or `-` followed by digit
  - Support integers: `123`, `-42`
  - Support decimals: `1.5`, `-0.5`
  - Create NUMBER token with parsed numeric value
- **Boolean literals:**
  - Recognize `true` → BOOLEAN token with value `true`
  - Recognize `false` → BOOLEAN token with value `false`
- **Special values:**
  - Recognize `null` → NULL token
  - Recognize `undefined` → UNDEFINED token

**Deliverable:** Literal token recognition in Lexer

**Tests:**

- String: `"hello"` → STRING("hello")
- String with escaped quote: `"say \"hi\""` → STRING('say "hi"')
- String with escaped backslash: `"path\\file"` → STRING("path\file")
- Unclosed string: `"hello` → Error
- Integer: `123` → NUMBER(123)
- Negative: `-42` → NUMBER(-42)
- Decimal: `1.5` → NUMBER(1.5)
- Boolean: `true` → BOOLEAN(true), `false` → BOOLEAN(false)
- Null: `null` → NULL
- Undefined: `undefined` → UNDEFINED

### Task C1-F1-T9: Implement Identifier Tokenization

**Status:** `[x]` Complete

- Recognize identifiers: start with letter, `_`, or `$`, followed by letters, digits, `_`, `$`
- Create ID token with identifier name
- Handle keywords: `if`, `unless`, `each`, `with`, `else` (context-dependent)
- Handle special identifiers: `this`

**Deliverable:** Identifier token recognition in Lexer

**Tests:**

- Simple identifier: `foo` → ID("foo")
- Underscore: `_var` → ID("\_var")
- Dollar sign: `$var` → ID("$var")
- Digits in name: `var1` → ID("var1")
- Keywords recognized as IDs (context determines meaning)

---

## Feature 1.2: Path Tokenization

**Goal:** Recognize dot and slash notation for property paths, parent paths, and data variables

### Task C1-F2-T1: Implement Separator Tokenization

**Status:** `[x]` Complete

- Recognize `.` → SEP token
- Recognize `/` → SEP token (equivalent to dot)
- Only tokenize when inside mustache context

**Deliverable:** SEP token recognition in Lexer

**Tests:**

- `.` → SEP (in mustache context)
- `/` → SEP (in mustache context)
- `.` in CONTENT (outside mustache) → stays in CONTENT

### Task C1-F2-T2: Implement Data Prefix Tokenization

**Status:** `[x]` Complete

- Recognize `@` → DATA token
- Only valid at start of path inside mustache
- Position tracking

**Deliverable:** DATA token recognition in Lexer

**Tests:**

- `@` → DATA
- `@` followed by identifier: `@index` → DATA, ID("index")

### Task C1-F2-T3: Test Path Sequences

**Status:** `[x]` Complete

- Verify sequences tokenize correctly:
  - `foo.bar.baz` → ID("foo"), SEP, ID("bar"), SEP, ID("baz")
  - `foo/bar` → ID("foo"), SEP, ID("bar")
  - `../parent` → ID(".."), SEP, ID("parent")
  - `../../grand` → ID(".."), SEP, ID(".."), SEP, ID("grand")
  - `@index` → DATA, ID("index")
  - `@root.value` → DATA, ID("root"), SEP, ID("value")
  - `this.foo` → ID("this"), SEP, ID("foo")
  - `./foo` → ID("."), SEP, ID("foo")

**Deliverable:** Integration tests for path tokenization

**Tests:**

- All path patterns from overview tokenize correctly
- Whitespace preserved: `{{ foo.bar }}` has spaces
- Mixed notation: `{{../foo/bar.baz}}`
- Context-aware dot tokenization: dots after identifiers vs. standalone dots
- Edge cases: single dot `{{.}}`, double dots after identifier `{{foo...}}`

---

## Feature 1.3: Escape Handling

**Goal:** Implement backslash escaping before tokenization to allow literal mustaches in output

### Task C1-F3-T1: Implement Escape Pre-processing

**Status:** `[x]` Complete

- Before tokenization, scan for `\\` sequences
- `\\` followed by any character → remove backslash, mark character as escaped
- Track which characters are escaped
- When tokenizing, skip mustache recognition for escaped `{`

**Deliverable:** Escape handling in Lexer initialization

**Tests:**

- `\\{{foo}}` → CONTENT("{{foo}}") (literal mustaches)
- `\\\\{{foo}}` → CONTENT("\\"), then normal tokenization of `{{foo}}`
- `normal \\{{escaped}} normal` → CONTENT with literal `{{escaped}}`
- Multiple escapes: `\\{{foo}} \\{{bar}}`

### Task C1-F3-T2: Handle Edge Cases

**Status:** `[x]` Complete

- Backslash at end of input: `text\\` → CONTENT("text\\")
- Backslash before non-special char: `\\a` → CONTENT("a")
- Multiple backslashes: `\\\\\\{{` → `\{{` (two backslashes → one, third escapes brace)

**Deliverable:** Edge case handling for escapes

**Tests:**

- Trailing backslash doesn't error
- Escaped non-mustache characters handled
- Chain of backslashes processed correctly

---

## Feature 1.4: Lexer State Machine

**Goal:** Create stateful lexer with proper error handling and position tracking

### Task C1-F4-T1: Implement Full Lexer State Management

**Status:** `[x]` Complete ✅

- Track lexer state: `STATE_CONTENT` vs `STATE_MUSTACHE`
- In `STATE_CONTENT`: scan for plain text and `{{`
- In `STATE_MUSTACHE`: tokenize identifiers, literals, separators, etc.
- Switch states when entering/exiting mustaches
- EOF token at end of input

**Deliverable:** Complete state machine in Lexer

**Tests:**

- State switches correctly on `{{` and `}}`
- Tokenization behavior differs by state
- EOF token generated at end

### Task C1-F4-T2: Implement Position Tracking

**Status:** `[x]` Complete ✅

- Track line, column, and character index
- Update on each character consumed
- Handle newlines: increment line, reset column
- Handle tabs: configurable tab width (default 4)
- Store position in every token

**Deliverable:** Position tracking throughout lexer

**Tests:**

- Single-line template positions correct
- Multi-line template line numbers correct
- Newlines in CONTENT update line tracking
- Tabs handled correctly
- Token locations accurate

### Task C1-F4-T3: Implement Error Handling

**Status:** `[x]` Complete ✅

- Create `LexerError` class extending `Error`
- Include position information in errors
- Throw errors for:
  - Unclosed comments
  - Unclosed strings
  - Invalid characters in mustache context
  - Unexpected EOF
- Format error messages with line/column

**Deliverable:** `src/lexer/lexer-error.ts` with error class, error throwing in Lexer

**Tests:** 26 tests in `src/lexer/error-handling.test.ts`

- Unclosed comment error includes position
- Unclosed string error includes position
- Invalid character error clear and specific
- Error messages formatted with line/column: `"Error at line 3, column 5: ..."` (1-indexed for user display)

### Task C1-F4-T4: Implement Lexer Public Interface

**Status:** `[x]` Complete ✅

- `tokenize(template: string): Token[]` — Convenience method that calls setInput, then lex() until EOF
- Returns array of all tokens
- Includes EOF token in returned array

**Deliverable:** Public tokenize method in Lexer class

**Tests:** 22 tests in `test/lexer/tokenize.test.ts`

- `tokenize()` returns complete token array
- Can tokenize same template multiple times (fresh state)
- Empty template returns EOF token only
- Template with only content returns CONTENT and EOF tokens

### Task C1-F4-T5: Integration Testing

**Status:** `[x]` Complete ✅

- Test complex real-world templates
- Verify token sequences match expectations
- Test all features together

**Deliverable:** Comprehensive integration test suite

**Tests:** 35 tests in `test/lexer/integration.test.ts`

- Real-world HTML templates (email templates, inline styles, SVG)
- Deeply nested structures (5+ nesting levels)
- Complex expressions with helpers and multiple parameters
- Path expressions and data variable access
- Whitespace and formatting preservation
- Comments in various contexts
- Escaped sequences
- Edge cases (empty mustaches, single characters, long identifiers, consecutive mustaches)
- Performance with large templates (100+ mustaches, 10KB+ content blocks, deep path nesting)
- Error recovery and position reporting in malformed templates

---

## Implementation Notes

### Reference Implementation

Study these for tokenization patterns:

- **LiquidJS**: `src/scanner.ts` — Efficient character scanning
- **Handlebars**: `src/handlebars.l` (Jison lexer spec) — Token definitions
- **mustache.js**: Scanner implementation — Simple state machine

### Performance Considerations

- Single-pass scanning where possible
- Avoid excessive string concatenation (use array and join)
- Minimize backtracking
- Pre-compile regex patterns

### Security Considerations

- Validate escape sequences properly
- Prevent infinite loops on malformed input
- Set reasonable input size limits (if needed)
- Don't expose internal state through errors

### Testing Strategy

- Test each feature in isolation first
- Then integration tests combining features
- Include edge cases and error conditions
- Test with actual Handlebars templates for compatibility
- Property-based testing for fuzzing (optional, V2)
