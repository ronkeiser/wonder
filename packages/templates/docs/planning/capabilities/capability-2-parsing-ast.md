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
  - `params: Expression[]` — Helper arguments (empty in V1)
  - `hash: Hash` — Named parameters (empty in V1)
  - `escaped: boolean` — true for `{{}}`, false for `{{{}}}`
  - `loc: SourceLocation | null`
- Create `BlockStatement` interface:
  - `type: 'BlockStatement'`
  - `path: PathExpression` — Helper name
  - `params: Expression[]` — Helper arguments (empty in V1)
  - `hash: Hash` — Named parameters (empty in V1)
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

**Status:** `[ ]` Not Started

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

**Status:** `[ ]` Not Started

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

**Status:** `[ ]` Not Started

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

**Status:** `[ ]` Not Started

- When current token is OPEN (`{{`):
  - Parse path expression
  - Create `MustacheStatement` with:
    - `path: PathExpression`
    - `params: []` (empty in V1)
    - `hash: { type: 'Hash', pairs: [], loc: null }` (empty in V1)
    - `escaped: true`
  - Expect CLOSE (`}}`) token
  - Set location spanning OPEN to CLOSE

**Deliverable:** Escaped mustache parsing in Parser

**Tests:**

- `{{foo}}` → MustacheStatement with escaped: true
- `{{foo.bar}}` → MustacheStatement with path
- `{{../parent}}` → MustacheStatement with depth
- `{{@index}}` → MustacheStatement with data flag
- Location spans entire mustache

### Task C2-F5-T2: Parse Unescaped Mustaches

**Status:** `[ ]` Not Started

- When current token is OPEN_UNESCAPED (`{{{`):
  - Parse path expression
  - Create `MustacheStatement` with:
    - `path: PathExpression`
    - `params: []`
    - `hash: { type: 'Hash', pairs: [], loc: null }`
    - `escaped: false`
  - Expect CLOSE_UNESCAPED (`}}}`) token
  - Set location spanning OPEN_UNESCAPED to CLOSE_UNESCAPED

**Deliverable:** Unescaped mustache parsing in Parser

**Tests:**

- `{{{html}}}` → MustacheStatement with escaped: false
- `{{{user.name}}}` → Unescaped with path
- Location spans entire triple-stache

### Task C2-F5-T3: Validate Mustache Closing

**Status:** `[ ]` Not Started

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

**Status:** `[ ]` Not Started

- When current token is OPEN_BLOCK (`{{#`):
  - Parse helper name as path expression
  - Expect CLOSE (`}}`)
  - Parse main block content into Program node
  - When OPEN_ENDBLOCK (`{{/`) encountered:
    - Parse end block name
    - Expect CLOSE (`}}`)
    - Validate end name matches start name
  - Create `BlockStatement` with:
    - `path: PathExpression` (helper name)
    - `params: []`
    - `hash: { type: 'Hash', pairs: [], loc: null }`
    - `program: Program` (main block content)
    - `inverse: null`
  - Set location spanning entire block

**Deliverable:** Simple block parsing in Parser

**Tests:**

- `{{#if condition}}content{{/if}}` → BlockStatement
- Helper name extracted correctly
- Program contains content
- Location spans full block
- Nested content parsed into program.body

### Task C2-F6-T2: Parse Blocks with Else

**Status:** `[ ]` Not Started

- While parsing block content, watch for INVERSE token (`{{else}}`)
- When INVERSE found:
  - Finalize current program as main block
  - Start new program for inverse block
  - Continue parsing until OPEN_ENDBLOCK
- Create BlockStatement with:
  - `program: Program` (content before else)
  - `inverse: Program` (content after else)

**Deliverable:** Else block parsing in Parser

**Tests:**

- `{{#if condition}}yes{{else}}no{{/if}}` → BlockStatement with both programs
- Main program contains "yes"
- Inverse program contains "no"
- Location information correct
- Multiple statements in each block

### Task C2-F6-T3: Validate Block Names

**Status:** `[ ]` Not Started

- Opening block name must match closing block name
- Comparison is case-sensitive
- Mismatched names throw error with both names
- Error message: `"Expected closing tag {{/if}} but found {{/each}}"`

**Deliverable:** Block name validation in Parser

**Tests:**

- `{{#if x}}{{/each}}` → Error with both names
- `{{#if x}}{{/IF}}` → Error (case-sensitive)
- `{{#each items}}{{/each}}` → Valid
- Error includes line numbers for both tags

### Task C2-F6-T4: Handle Nested Blocks

**Status:** `[ ]` Not Started

- Maintain stack of open blocks
- When OPEN_BLOCK encountered:
  - Push block info to stack
  - Recursively parse nested content
- When OPEN_ENDBLOCK encountered:
  - Pop from stack
  - Validate name matches
- Handle deeply nested structures correctly

**Deliverable:** Nested block parsing in Parser

**Tests:**

- Two-level nesting: `{{#if a}}{{#if b}}{{/if}}{{/if}}`
- Three-level nesting
- Nested blocks with else: `{{#if a}}{{#if b}}x{{else}}y{{/if}}{{/if}}`
- Mixed block types: `{{#if x}}{{#each items}}{{/each}}{{/if}}`
- Each block gets correct content

### Task C2-F6-T5: Detect Unclosed Blocks

**Status:** `[ ]` Not Started

- If EOF reached while blocks are open:
  - Throw error naming unclosed block
  - Include position of opening tag
- Track all open blocks for clear error messages

**Deliverable:** Unclosed block detection in Parser

**Tests:**

- `{{#if condition}}content` → Error: unclosed if block
- `{{#if a}}{{#if b}}` → Error: unclosed nested blocks
- Error includes line number of opening tag
- Error lists all unclosed blocks

---

## Feature 2.7: Parser Main Loop

**Goal:** Parse complete templates into Program nodes

### Task C2-F7-T1: Implement parseProgram()

**Status:** `[ ]` Not Started

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

**Tests:**

- Empty template → Program with empty body
- Single content → Program with one ContentStatement
- Multiple statements → Program with ordered body
- Mixed statement types → All parsed correctly
- Location spans entire template

### Task C2-F7-T2: Implement parse() Entry Point

**Status:** `[ ]` Not Started

- Public `parse(): Program` method
- Calls `parseProgram()` to get root Program
- After parseProgram returns:
  - Expect EOF token
  - If not EOF, throw error (unexpected content after template)
- Return Program node

**Deliverable:** Public parse method

**Tests:**

- Can parse complete template
- Returns Program node
- Throws on extra tokens after template
- Handles empty templates

### Task C2-F7-T3: Add Convenience Method

**Status:** `[ ]` Not Started

- Add static method: `Parser.parse(tokens: Token[]): Program`
- Creates parser instance
- Calls setInput and parse
- Returns Program
- Convenience for one-off parsing

**Deliverable:** Static parse method

**Tests:**

- Static method works same as instance method
- Can parse without creating parser instance
- Tokens array not mutated

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
