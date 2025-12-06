# Capability 2: Syntax Analysis (Parsing & AST Construction)

**Goal:** Build Abstract Syntax Tree from token stream following Handlebars AST structure. Must work in Cloudflare Workers without `eval()` or `new Function()`.

---

## Feature 2.1: AST Node Type Definitions

**Goal:** Define TypeScript interfaces for all AST node types following Handlebars AST specification

### Task C2-F1-T1: Define Base Node Types

**Status:** `[x]` Complete

- Create base `Node` interface with:
  - `type: string` — Node type discriminator
  - `loc: SourceLocation | null` — Position information from lexer
- Define `SourceLocation` interface (reuse from lexer if compatible):
  - `start: Position`
  - `end: Position`
- Define `Position` interface:
  - `line: number` — 1-based line number
  - `column: number` — 0-based column number
  - `index: number` — 0-based character index

**Deliverable:** `src/parser/ast-nodes.ts` with base node types

**Tests:**

- Base Node interface includes required fields
- SourceLocation properly typed
- Position compatible with lexer Position type

### Task C2-F1-T2: Define Program Node

**Status:** `[x]` Complete

- Create `Program` interface:
  - `type: 'Program'`
  - `body: Statement[]` — Array of statements
  - `loc: SourceLocation | null`
- Program is the root node of every AST
- Body contains ordered list of statements

**Deliverable:** Program interface in AST node types

**Tests:**

- Program interface matches specification
- Body is typed as Statement array
- Can create Program node in tests

### Task C2-F1-T3: Define Statement Node Types

**Status:** `[x]` Complete

- Create `Statement` union type
- Create `ContentStatement` interface:
  - `type: 'ContentStatement'`
  - `value: string` — Raw text content
  - `original: string` — Original text (may include escapes)
  - `loc: SourceLocation | null`
- Create `MustacheStatement` interface:
  - `type: 'MustacheStatement'`
  - `path: PathExpression`
  - `params: Expression[]` — Helper arguments (parsed in V1 for built-in helpers)
  - `hash: Hash` — Named parameters (reserved for V2)
  - `escaped: boolean` — true for `{{}}`, false for `{{{}}}`
  - `loc: SourceLocation | null`
- Create `BlockStatement` interface:
  - `type: 'BlockStatement'`
  - `path: PathExpression` — Helper name
  - `params: Expression[]` — Helper arguments (parsed in V1 for built-in helpers)
  - `hash: Hash` — Named parameters (reserved for V2)
  - `program: Program | null` — Main block content
  - `inverse: Program | null` — `{{else}}` block content
  - `openStrip: StripFlags` — Whitespace control (V2)
  - `inverseStrip: StripFlags` — Whitespace control (V2)
  - `closeStrip: StripFlags` — Whitespace control (V2)
  - `loc: SourceLocation | null`
- Create `CommentStatement` interface:
  - `type: 'CommentStatement'`
  - `value: string` — Comment text
  - `loc: SourceLocation | null`
- Define `Statement` as union: `ContentStatement | MustacheStatement | BlockStatement | CommentStatement`

**Deliverable:** All statement node interfaces

**Tests:**

- Each statement type properly defined
- Statement union type correct
- Can create instances of each statement type in tests

### Task C2-F1-T4: Define Expression Node Types

**Status:** `[x]` Complete

- Create `Expression` union type
- Create `PathExpression` interface:
  - `type: 'PathExpression'`
  - `data: boolean` — true if starts with `@`
  - `depth: number` — 0=current, 1=../, 2=../../
  - `parts: string[]` — Path segments (e.g., ['foo', 'bar'])
  - `original: string` — Raw path string
  - `loc: SourceLocation | null`
- Create `StringLiteral` interface:
  - `type: 'StringLiteral'`
  - `value: string` — Unescaped string value
  - `original: string` — Original string with quotes
  - `loc: SourceLocation | null`
- Create `NumberLiteral` interface:
  - `type: 'NumberLiteral'`
  - `value: number` — Parsed numeric value
  - `original: string` — Original number string
  - `loc: SourceLocation | null`
- Create `BooleanLiteral` interface:
  - `type: 'BooleanLiteral'`
  - `value: boolean` — true or false
  - `original: string` — "true" or "false"
  - `loc: SourceLocation | null`
- Create `NullLiteral` interface:
  - `type: 'NullLiteral'`
  - `value: null` — Always null
  - `original: string` — "null"
  - `loc: SourceLocation | null`
- Create `UndefinedLiteral` interface:
  - `type: 'UndefinedLiteral'`
  - `value: undefined` — Always undefined
  - `original: string` — "undefined"
  - `loc: SourceLocation | null`
- Create `SubExpression` interface:
  - `type: 'SubExpression'`
  - `path: PathExpression` — Helper name
  - `params: Expression[]` — Arguments (can include nested SubExpressions)
  - `hash: Hash` — Named parameters (reserved for V2)
  - `loc: SourceLocation | null`
- Define `Expression` as union of all expression types

**Deliverable:** All expression node interfaces

**Tests:**

- PathExpression interface includes all security-critical fields
- All literal types properly defined
- Expression union type correct
- Can create instances in tests

### Task C2-F1-T5: Define Helper Node Types

**Status:** `[x]` Complete

- Create `Hash` interface:
  - `type: 'Hash'`
  - `pairs: HashPair[]`
  - `loc: SourceLocation | null`
- Create `HashPair` interface:
  - `type: 'HashPair'`
  - `key: string` — Parameter name
  - `value: Expression` — Parameter value
  - `loc: SourceLocation | null`
- Create `StripFlags` interface:
  - `open: boolean` — Strip whitespace before
  - `close: boolean` — Strip whitespace after
- Note: Hash and HashPair used for V2 named parameters, V1 leaves hash empty

**Deliverable:** Helper node type interfaces

**Tests:**

- Hash interface correct
- HashPair interface correct
- StripFlags interface correct

---

## Feature 2.2: Parser Class Structure

**Goal:** Create Parser class with state management and token consumption

### Task C2-F2-T1: Implement Parser Class Skeleton

**Status:** `[x]` Complete

- Create Parser class with state fields:
  - `tokens: Token[]` — Token stream from lexer
  - `index: number` — Current position in token stream
- Implement `setInput(tokens: Token[]): void` method to initialize state
- Implement `parse(): Program` method as main entry point
- Implement helper: `peek(offset = 0): Token | null` to look ahead
- Implement helper: `advance(): Token` to consume and return next token
- Implement helper: `match(...types: TokenType[]): boolean` to check if current token matches any type
- Implement helper: `expect(type: TokenType): Token` to consume expected token or throw
- Implement helper: `isEOF(): boolean` to check end of token stream

**Deliverable:** `src/parser/parser.ts` with Parser class skeleton

**Tests:**

- `setInput()` initializes state correctly
- `advance()` moves position forward
- `peek()` doesn't modify state
- `peek(1)` looks ahead one token
- `match()` correctly identifies token types
- `expect()` throws on mismatch with clear error
- `isEOF()` returns true at end

### Task C2-F2-T2: Implement Error Handling

**Status:** `[x]` Complete

- Create `ParserError` class extending `Error`
- Include token position information in errors
- Throw errors for:
  - Unexpected token type
  - Unclosed blocks
  - Mismatched block names
  - Unexpected EOF
- Format error messages with line/column from token location

**Deliverable:** `src/parser/parser-error.ts` with error class, error throwing in Parser

**Tests:**

- Unexpected token error includes position
- Unclosed block error clear and specific
- Mismatched block names error includes both names
- Error messages formatted: `"Error at line 3, column 5: ..."`

### Task C2-F2-T3: Implement Position Tracking

**Status:** `[x]` Complete

- Track start and end positions for each node
- Use token locations to construct node locations
- Helper: `startLocation(): Position` captures current token start
- Helper: `endLocation(): Position` captures previous token end
- Helper: `makeLocation(start: Position, end: Position): SourceLocation`
- Every node gets accurate location information

**Deliverable:** Position tracking helpers in Parser

**Tests:**

- Node locations span correct token range
- Multi-line nodes have correct start/end
- Nested nodes have correct locations

---

## Feature 2.3: Content and Comment Parsing

**Goal:** Parse simple non-expression statements

### Task C2-F3-T1: Parse ContentStatement

**Status:** `[x]` Complete

- When current token is CONTENT:
  - Create `ContentStatement` node
  - Set `value` to token value
  - Set `original` to token value
  - Set location from token
  - Advance past CONTENT token

**Deliverable:** ContentStatement parsing in Parser

**Tests:**

- Plain text: `"Hello World"` → ContentStatement
- Text with spaces and newlines
- Empty content token handled
- Location information correct

### Task C2-F3-T2: Parse CommentStatement

**Status:** `[x]` Complete

- When current token is COMMENT:
  - Create `CommentStatement` node
  - Set `value` to token value (comment text without delimiters)
  - Set location from token
  - Advance past COMMENT token

**Deliverable:** CommentStatement parsing in Parser

**Tests:**

- `{{! comment }}` → CommentStatement
- `{{!-- block comment --}}` → CommentStatement
- Comment value excludes delimiters
- Location information correct

---

## Feature 2.4: PathExpression Parsing

**Goal:** Parse variable paths with depth tracking and data flag

### Task C2-F4-T1: Parse Simple Paths

**Status:** `[x]` Complete

- Recognize ID token as start of path
- Parse sequence: ID (SEP ID)\*
- Build PathExpression with:
  - `data: false`
  - `depth: 0`
  - `parts: [id1, id2, ...]`
  - `original: "id1.id2..."`
- Handle single identifier: `{{foo}}` → parts: ['foo']
- Handle dotted path: `{{foo.bar.baz}}` → parts: ['foo', 'bar', 'baz']

**Deliverable:** Simple path parsing in Parser

**Tests:**

- Single identifier: `foo` → PathExpression with parts ['foo']
- Dotted path: `foo.bar` → PathExpression with parts ['foo', 'bar']
- Three-level path: `foo.bar.baz`
- Depth is 0 for simple paths
- Data flag is false
- Original string preserved

### Task C2-F4-T2: Parse Parent Paths

**Status:** `[x]` Complete

- Recognize `..` as ID token indicating parent reference
- Count consecutive `..` segments to determine depth
- Parse remaining path after `..` segments
- Build PathExpression with:
  - `data: false`
  - `depth: count of .. segments`
  - `parts: [remaining segments]`
  - `original: "../path" or "../../path"`
- Examples:
  - `{{../parent}}` → depth: 1, parts: ['parent']
  - `{{../../grand}}` → depth: 2, parts: ['grand']
  - `{{../foo.bar}}` → depth: 1, parts: ['foo', 'bar']

**Deliverable:** Parent path parsing in Parser

**Tests:**

- Single parent: `../parent` → depth 1
- Double parent: `../../grand` → depth 2
- Parent with nested path: `../foo.bar` → depth 1, parts ['foo', 'bar']
- Standalone `..` → depth 1, parts []
- Triple parent: `../../../great` → depth 3

### Task C2-F4-T3: Parse Data Variables

**Status:** `[x]` Complete

- Recognize DATA token (`@`) as start of data variable
- Parse following identifier(s) for data variable name
- Build PathExpression with:
  - `data: true`
  - `depth: 0` (data variables don't use depth)
  - `parts: [variable name and any nested parts]`
  - `original: "@name" or "@name.path"`
- Examples:
  - `{{@index}}` → data: true, parts: ['index']
  - `{{@root.user}}` → data: true, parts: ['root', 'user']
  - `{{@first}}` → data: true, parts: ['first']

**Deliverable:** Data variable parsing in Parser

**Tests:**

- Simple data var: `@index` → data true, parts ['index']
- Data with path: `@root.user` → data true, parts ['root', 'user']
- All standard data vars: `@index`, `@key`, `@first`, `@last`, `@root`
- Depth is always 0 for data variables
- Original string includes `@`

### Task C2-F4-T4: Parse Special Paths

**Status:** `[x]` Complete

- Handle `{{this}}` → PathExpression with empty parts
- Handle `{{this.foo}}` → PathExpression with parts ['foo'], scoped
- Handle `{{./foo}}` → PathExpression with parts ['foo'], scoped (depth 0, explicit current context)
- Track "scoped" vs "unscoped" paths (affects helper resolution in V2)

**Deliverable:** Special path parsing in Parser

**Tests:**

- `this` alone → empty parts array
- `this.foo` → parts ['foo']
- `./foo` → parts ['foo'], depth 0
- `.` alone → empty parts, depth 0
- Original strings preserved

---

## Feature 2.5: MustacheStatement Parsing

**Goal:** Parse variable and helper output expressions

### Task C2-F5-T1: Parse Escaped Mustaches

**Status:** `[x]` Complete

- When current token is OPEN (`{{`):
  - Parse path expression
  - Parse parameter list (if present):
    - While not CLOSE and not EQUALS (hash param):
      - Parse expression (can be literal, path, or subexpression)
      - Add to params array
  - Create `MustacheStatement` with:
    - `path: PathExpression`
    - `params: Expression[]` (parsed arguments for helpers)
    - `hash: { type: 'Hash', pairs: [], loc: null }` (V2)
    - `escaped: true`
  - Expect CLOSE (`}}`) token
  - Set location spanning OPEN to CLOSE

**Deliverable:** Escaped mustache parsing with parameters in Parser

**Tests:**

- `{{foo}}` → MustacheStatement with escaped: true
- `{{foo.bar}}` → MustacheStatement with path
- `{{../parent}}` → MustacheStatement with depth
- `{{@index}}` → MustacheStatement with data flag
- Location spans entire mustache

### Task C2-F5-T2: Parse Unescaped Mustaches

**Status:** `[x]` Complete

- When current token is OPEN_UNESCAPED (`{{{`):
  - Parse path expression
  - Parse parameter list (if present):
    - While not CLOSE_UNESCAPED and not EQUALS:
      - Parse expression (can be literal, path, or subexpression)
      - Add to params array
  - Create `MustacheStatement` with:
    - `path: PathExpression`
    - `params: Expression[]` (parsed arguments)
    - `hash: { type: 'Hash', pairs: [], loc: null }`
    - `escaped: false`
  - Expect CLOSE_UNESCAPED (`}}}`) token
  - Set location spanning OPEN_UNESCAPED to CLOSE_UNESCAPED

**Deliverable:** Unescaped mustache parsing with parameters in Parser

**Tests:**

- `{{{html}}}` → MustacheStatement with escaped: false
- `{{{user.name}}}` → Unescaped with path
- Location spans entire triple-stache

### Task C2-F5-T3: Validate Mustache Closing

**Status:** `[x]` Complete

- After OPEN, must find CLOSE (not CLOSE_UNESCAPED)
- After OPEN_UNESCAPED, must find CLOSE_UNESCAPED (not CLOSE)
- Mismatched closings throw clear error
- Unexpected EOF throws error

**Deliverable:** Mustache closing validation in Parser

**Tests:**

- `{{foo}}}` → Error: too many closing braces
- `{{{foo}}` → Error: expected CLOSE_UNESCAPED
- `{{foo` → Error: unexpected EOF
- Error messages include position

---

## Feature 2.6: BlockStatement Parsing

**Goal:** Parse block helpers with proper nesting and else blocks

### Task C2-F6-T1: Parse Simple Blocks

**Status:** `[x]` Complete ✅

- When current token is OPEN_BLOCK (`{{#`):
  - Parse helper name as path expression
  - Parse parameter list (if present):
    - While not CLOSE and not EQUALS:
      - Parse expression (can be literal, path, or subexpression)
      - Add to params array
  - Expect CLOSE (`}}`)
  - Parse main block content into Program node
  - When OPEN_ENDBLOCK (`{{/`) encountered:
    - Parse end block name
    - Expect CLOSE (`}}`)
    - Validate end name matches start name
  - Create `BlockStatement` with:
    - `path: PathExpression` (helper name)
    - `params: Expression[]` (parsed arguments)
    - `hash: { type: 'Hash', pairs: [], loc: null }`
    - `program: Program` (main block content)
    - `inverse: null`
  - Set location spanning entire block

**Deliverable:** Simple block parsing with parameters in Parser (`parseBlockStatement()` method)

**Tests:** 29 tests in `test/parser/block-statement.test.ts` (all passing)

- `{{#if condition}}content{{/if}}` → BlockStatement ✅
- Helper name extracted correctly ✅
- Program contains content ✅
- Location spans full block ✅
- Nested content parsed into program.body ✅
- Block name validation (mismatched names throw errors) ✅
- Unclosed block detection ✅
- V1 compliance (empty hash, null inverse, false strip flags) ✅

### Task C2-F6-T2: Parse Blocks with Else

**Status:** `[x]` Complete ✅

- While parsing block content, watch for INVERSE token (`{{else}}`)
- When INVERSE found:
  - Finalize current program as main block
  - Start new program for inverse block
  - Continue parsing until OPEN_ENDBLOCK
- Create BlockStatement with:
  - `program: Program` (content before else)
  - `inverse: Program` (content after else)

**Deliverable:** Else block parsing in Parser (`parseBlockStatement()` with inverse support)

**Tests:** 26 tests in `test/parser/block-with-else.test.ts` (all passing)

- `{{#if condition}}yes{{else}}no{{/if}}` → BlockStatement with both programs ✅
- Main program contains "yes" ✅
- Inverse program contains "no" ✅
- Location information correct ✅
- Multiple statements in each block ✅
- Nested blocks in both branches ✅
- Empty branches handled ✅

### Task C2-F6-T3: Validate Block Names

**Status:** `[x]` Complete ✅

- Opening block name must match closing block name
- Comparison is case-sensitive
- Mismatched names throw error with both names
- Error message: `"Expected closing tag {{/if}} but found {{/each}}"`

**Deliverable:** Block name validation in Parser (within `parseBlockStatement()`)

**Tests:** 28 tests in `test/parser/block-name-validation.test.ts` (all passing)

- `{{#if x}}{{/each}}` → Error with both names
- `{{#if x}}{{/IF}}` → Error (case-sensitive)
- `{{#each items}}{{/each}}` → Valid
- Error includes line numbers for both tags

### Task C2-F6-T4: Handle Nested Blocks

**Status:** `[x]` Complete ✅

- Maintain stack of open blocks
- When OPEN_BLOCK encountered:
  - Push block info to stack
  - Recursively parse nested content
- When OPEN_ENDBLOCK encountered:
  - Pop from stack
  - Validate name matches
- Handle deeply nested structures correctly

**Deliverable:** Nested block support in Parser (recursive `parseProgram()` calls)

**Tests:** 32 tests in `test/parser/nested-blocks.test.ts` (all passing)

- Two-level nesting: `{{#if a}}{{#if b}}{{/if}}{{/if}}` ✅
- Three-level nesting ✅
- Six-level deep nesting ✅
- Nested blocks with else: `{{#if a}}{{#if b}}x{{else}}y{{/if}}{{/if}}` ✅
- Mixed block types: `{{#if x}}{{#each items}}{{/each}}{{/if}}` ✅
- Each block gets correct content ✅
- Location tracking for nested structures ✅
- Content separation between levels ✅

### Task C2-F6-T5: Detect Unclosed Blocks

**Status:** `[x]` Complete ✅

- If EOF reached while blocks are open:
  - Throw error naming unclosed block
  - Include position of opening tag
- Track all open blocks for clear error messages

**Deliverable:** Unclosed block detection in Parser (EOF checks in `parseProgram()`)

**Tests:** 35 tests in `test/parser/unclosed-blocks.test.ts` (all passing)

- `{{#if condition}}content` → Error: unclosed if block ✅
- `{{#if a}}{{#if b}}` → Error: unclosed nested blocks ✅
- Error includes line number of opening tag ✅
- Unclosed blocks with else clauses ✅
- Clear error messages with block identifiers ✅

---

## Feature 2.7: Parser Main Loop

**Goal:** Parse complete templates into Program nodes

### Task C2-F7-T1: Implement parseProgram()

**Status:** `[x]` Complete ✅

- Create `parseProgram(): Program` method
- Loop until EOF or block terminator:
  - Check token type
  - Dispatch to appropriate parse method:
    - CONTENT → parseContentStatement()
    - COMMENT → parseCommentStatement()
    - OPEN → parseMustacheStatement()
    - OPEN_UNESCAPED → parseMustacheStatement()
    - OPEN_BLOCK → parseBlockStatement()
    - OPEN_ENDBLOCK → return (end of current block)
    - INVERSE → return (handled by block parser)
  - Add parsed statement to body array
- Create Program node with body array
- Set location spanning all statements

**Deliverable:** parseProgram method in Parser

**Tests:** Covered by 18 tests in parse() test suite (all passing)

- Empty template → Program with empty body ✅
- Single content → Program with one ContentStatement ✅
- Multiple statements → Program with ordered body ✅
- Mixed statement types → All parsed correctly ✅
- Location spans entire template ✅

### Task C2-F7-T2: Implement parse() Entry Point

**Status:** `[x]` Complete ✅

- Public `parse(): Program` method
- Calls `parseProgram()` to get root Program
- After parseProgram returns:
  - Expect EOF token
  - If not EOF, throw error (unexpected content after template)
- Return Program node

**Deliverable:** Public parse method

**Tests:** 18 tests in `test/parser/parser.test.ts` under "parse() - Main Entry Point" (all passing)

- Can parse complete template ✅
- Returns Program node ✅
- Throws on extra tokens after template ✅
- Handles empty templates ✅
- Parses content-only, mustache-only, blocks ✅
- Handles nested blocks and else clauses ✅
- Location tracking correct ✅

### Task C2-F7-T3: Add Convenience Method

**Status:** `[x]` Complete ✅

- Add static method: `Parser.parse(template: string): Program`
- Creates Lexer and Parser instance
- Calls setInput and parse
- Returns Program
- Convenience for one-off parsing

**Deliverable:** Static parse method

**Tests:** 25 tests in `test/parser/parser.test.ts` under "Parser.parse() - Static Method" (all passing)

- Static method works same as instance method ✅
- Can parse without creating parser instance ✅
- Handles all template types correctly ✅
- Throws same errors as instance method ✅
- Produces identical results to instance method ✅

---

## Feature 2.8: Literal Expression Parsing

**Goal:** Parse string, number, boolean, null, and undefined literals

### Task C2-F8-T1: Parse String Literals

**Status:** `[ ]` Not Started

- When token type is STRING:
  - Create `StringLiteral` node
  - Set `value` to token value (unescaped)
  - Set `original` to token value with quotes
  - Set location from token
  - Advance past STRING token

**Deliverable:** StringLiteral parsing

**Tests:**

- `"hello"` → StringLiteral with value "hello"
- `'world'` → StringLiteral with value "world"
- String with escaped quotes
- Original includes quote characters
- Location correct

### Task C2-F8-T2: Parse Number Literals

**Status:** `[ ]` Not Started

- When token type is NUMBER:
  - Create `NumberLiteral` node
  - Set `value` to parsed number (token.value already parsed by lexer)
  - Set `original` to token string representation
  - Set location from token
  - Advance past NUMBER token

**Deliverable:** NumberLiteral parsing

**Tests:**

- `123` → NumberLiteral with value 123
- `1.5` → NumberLiteral with value 1.5
- `-42` → NumberLiteral with value -42
- Original preserves string format
- Location correct

### Task C2-F8-T3: Parse Boolean Literals

**Status:** `[ ]` Not Started

- When token type is BOOLEAN:
  - Create `BooleanLiteral` node
  - Set `value` to boolean value (token.value already parsed)
  - Set `original` to "true" or "false"
  - Set location from token
  - Advance past BOOLEAN token

**Deliverable:** BooleanLiteral parsing

**Tests:**

- `true` → BooleanLiteral with value true
- `false` → BooleanLiteral with value false
- Original preserves string
- Location correct

### Task C2-F8-T4: Parse Null and Undefined Literals

**Status:** `[ ]` Not Started

- When token type is NULL:
  - Create `NullLiteral` node
  - Set `value` to null
  - Set `original` to "null"
  - Advance past NULL token
- When token type is UNDEFINED:
  - Create `UndefinedLiteral` node
  - Set `value` to undefined
  - Set `original` to "undefined"
  - Advance past UNDEFINED token

**Deliverable:** Null and Undefined literal parsing

**Tests:**

- `null` → NullLiteral with value null
- `undefined` → UndefinedLiteral with value undefined
- Original strings correct
- Locations correct

---

## Feature 2.10: SubExpression Parsing

**Goal:** Parse nested helper calls within expressions for V1 built-in helpers

### Task C2-F10-T1: Parse SubExpression Structure

**Status:** `[ ]` Not Started

- When current token is OPEN_SEXPR (`(`):
  - Parse helper name as path expression
  - Parse parameter list recursively:
    - While not CLOSE_SEXPR:
      - Parse expression (literal, path, or nested SubExpression)
      - Add to params array
  - Expect CLOSE_SEXPR (`)`)
  - Create `SubExpression` with:
    - `path: PathExpression` (helper name)
    - `params: Expression[]` (evaluated arguments)
    - `hash: { type: 'Hash', pairs: [], loc: null }`
  - Set location spanning parentheses
  - Return SubExpression node

**Deliverable:** SubExpression parsing in Parser

**Tests:**

- `(gt x 1)` → SubExpression with 2 params
- `(eq status "active")` → SubExpression with string literal
- Simple subexpression in if: `{{#if (gt score 80)}}...{{/if}}`
- Location spans parentheses

### Task C2-F10-T2: Parse Nested SubExpressions

**Status:** `[ ]` Not Started

- Handle SubExpression as parameter to another SubExpression
- Recursive descent: when parsing params, check for OPEN_SEXPR
- If OPEN_SEXPR found, recursively call SubExpression parser
- Support arbitrary nesting depth
- Track nesting for error messages

**Deliverable:** Nested SubExpression parsing in Parser

**Tests:**

- `(and (gt x 1) (lt x 10))` → SubExpression with 2 SubExpression params
- Triple nested: `(or (and a b) (and c d))`
- Mixed literals and subexpressions: `(add (mul x 2) 5)`
- Location information correct for all levels

### Task C2-F10-T3: Integrate with Expression Parsing

**Status:** `[ ]` Not Started

- Update `parseExpression()` method to handle OPEN_SEXPR
- When parsing params for MustacheStatement:
  - Check for OPEN_SEXPR token
  - If found, parse SubExpression
  - Add SubExpression to params array
- When parsing params for BlockStatement:
  - Same logic applies
- SubExpressions can appear anywhere expressions are expected

**Deliverable:** SubExpression integration in expression parsing

**Tests:**

- `{{#if (gt score 80)}}` → BlockStatement with SubExpression param
- `{{uppercase (concat first " " last)}}` → MustacheStatement with SubExpression
- Multiple subexpressions: `{{#if (and (gt x 1) (lt x 10))}}`
- Subexpressions work in both mustaches and blocks

### Task C2-F10-T4: Validate SubExpression Closing

**Status:** `[ ]` Not Started

- After OPEN_SEXPR, must find matching CLOSE_SEXPR
- Track nesting depth for error messages
- Unclosed subexpression throws error with position
- Unexpected CLOSE_SEXPR throws error
- Error messages include context about which helper

**Deliverable:** SubExpression validation in Parser

**Tests:**

- `(gt x 1` → Error: unclosed subexpression
- `gt x 1)` → Error: unexpected closing parenthesis
- `(gt (lt x 5) 1` → Error identifies which subexpression unclosed
- Error includes line/column information

---

## Feature 2.9: Integration Testing

**Goal:** Test parser with complex real-world templates

### Task C2-F9-T1: Test Complete Templates

**Status:** `[ ]` Not Started

- Parse simple variable template: `"Hello {{name}}"`
- Parse template with blocks: `"{{#if condition}}yes{{/if}}"`
- Parse template with nested blocks
- Parse template with all statement types
- Verify AST structure matches expected shape

**Deliverable:** Integration test suite for parser

**Tests:**

- Simple template parsing
- Block structures
- Nested blocks with content
- Mixed content and mustaches
- Templates with comments
- Real-world email template example

### Task C2-F9-T2: Test AST Properties

**Status:** `[ ]` Not Started

- Verify PathExpression depth calculation correct
- Verify data flag set correctly for @ variables
- Verify escaped flag set correctly for mustaches
- Verify block program and inverse structure
- Verify all node locations accurate

**Deliverable:** AST property validation tests

**Tests:**

- Path depth for parent references
- Data flag for data variables
- Escaped flag for mustaches
- Block structure with else
- Location information throughout tree

### Task C2-F9-T3: Test Error Conditions

**Status:** `[ ]` Not Started

- Unclosed blocks throw with position
- Mismatched block names throw with both names
- Unexpected EOF throws
- Invalid token sequences throw
- All errors include line/column information

**Deliverable:** Error condition tests

**Tests:**

- Each error type has test
- Error messages clear and specific
- Position information in all errors
- Multiple error scenarios covered

---

## Implementation Notes

### AST Compatibility

Follow Handlebars AST structure exactly:

- Reference: `handlebars` package AST types
- Use same node type names and properties
- Maintain compatibility for future tooling

### Parser Strategy

- **Recursive descent** parser for simplicity
- Single-pass parsing
- No backtracking needed
- Track context with explicit stack

### Testing Strategy

- Test each feature in isolation first
- Then integration tests combining features
- Include edge cases and error conditions
- Compare AST output with Handlebars when possible
- Property-based testing for fuzzing (optional, V2)

### Performance Considerations

- Single pass through token stream
- Avoid excessive array copying
- Pre-allocate location objects
- Minimize object creation in hot paths

### Security Considerations

- PathExpression depth tracking critical for scope security
- Data flag prevents helper resolution for data variables
- Validate all block name matching
- Don't expose internal parser state through errors
