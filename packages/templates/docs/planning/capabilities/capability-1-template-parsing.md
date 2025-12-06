# Capability 1: Template Parsing

**Goal:** Transform template strings into executable AST without using `eval()` or `new Function()`

---

## Feature 1.1: Tokenization

**Goal:** Scan template string and produce token stream

### Task C1-F1-T1: Define Token Types

**Scope:** ~20 LOC

Define TypeScript types for tokens:

- `TokenType` enum: `TEXT`, `MUSTACHE_OPEN`, `MUSTACHE_CLOSE`, `TRIPLE_OPEN`, `TRIPLE_CLOSE`
- `Token` interface with `type`, `value`, `position` (line, column, index)
- Export types from `types.ts`

**Deliverable:** Type definitions file with full JSDoc comments

---

### Task C1-F1-T2: Implement Scanner

**Scope:** ~60 LOC

Create scanner class that processes template string character by character:

- `Scanner` class with `template: string`, `position: number`, `line: number`, `column: number`
- Methods: `peek()`, `advance()`, `isAtEnd()`, `match(expected: string)`
- Helper: `createToken(type, value, start, end)` for position tracking

**Deliverable:** `scanner.ts` with Scanner class

**Tests:**

- Scanner can peek at current character
- Scanner advances position correctly
- Scanner tracks line and column numbers
- Scanner detects end of input

---

### Task C1-F1-T3: Tokenize Plain Text

**Scope:** ~40 LOC

Implement text token extraction:

- Scan until `{{` is found
- Accumulate characters into text token
- Handle empty text (between consecutive mustaches)
- Handle template with no mustaches (pure text)

**Deliverable:** `tokenize()` function returns array of TEXT tokens for plain text input

**Tests:**

- Plain text with no mustaches → single TEXT token
- Empty string → empty token array
- Text with newlines → preserves newlines in token value

---

### Task C1-F1-T4: Tokenize Mustache Delimiters

**Scope:** ~50 LOC

Detect and tokenize mustache boundaries:

- Recognize `{{` as `MUSTACHE_OPEN`
- Recognize `}}` as `MUSTACHE_CLOSE`
- Recognize `{{{` as `TRIPLE_OPEN`
- Recognize `}}}` as `TRIPLE_CLOSE`
- Handle ambiguous cases: `{{{{` should be `TRIPLE_OPEN` + `{`

**Deliverable:** Tokenizer recognizes all delimiter types

**Tests:**

- `{{variable}}` → OPEN, TEXT("variable"), CLOSE
- `{{{html}}}` → TRIPLE_OPEN, TEXT("html"), TRIPLE_CLOSE
- `{{{{nested` → handles gracefully
- Unclosed `{{` → error or TEXT fallback

---

### Task C1-F1-T5: Integrate Text and Mustache Tokenization

**Scope:** ~40 LOC

Combine text and mustache tokenization into single pass:

- State machine: `TEXT_MODE` vs `MUSTACHE_MODE`
- Switch modes when encountering `{{` or `}}`
- Accumulate text/mustache content separately
- Emit tokens at appropriate boundaries

**Deliverable:** `tokenize(template: string): Token[]` main entry point

**Tests:**

- `Hello {{name}}!` → TEXT, OPEN, TEXT, CLOSE, TEXT
- Multiple variables: `{{a}} {{b}}`
- Adjacent mustaches: `{{a}}{{b}}`
- Mixed: text, variables, more text

---

### Task C1-F1-T6: Handle Whitespace

**Scope:** ~30 LOC

Preserve whitespace within tokens:

- Don't trim whitespace in TEXT tokens
- Preserve whitespace inside mustaches: `{{ name }}` keeps spaces
- Track whether whitespace is significant for future trimming feature

**Deliverable:** Whitespace-preserving tokenization

**Tests:**

- Leading/trailing spaces in text preserved
- Spaces inside mustaches preserved: `{{ name }}`
- Newlines preserved
- Multiple spaces preserved

---

## Feature 1.2: Token Classification

**Goal:** Parse variable expressions and identify token types

### Task C1-F2-T1: Define Expression AST Types

**Scope:** ~40 LOC

Define types for parsed expressions:

- `ExpressionType` enum: `VARIABLE`, `PATH`, `PARENT_PATH`, `THIS`, `BLOCK_START`, `BLOCK_END`, `COMMENT`
- `Expression` interface with `type`, `path: string[]`, `blockType?: string`
- `PathExpression` for `object.property.nested`
- `ParentExpression` for `../parent`

**Deliverable:** Expression type definitions in `types.ts`

---

### Task C1-F2-T2: Parse Simple Variables

**Scope:** ~40 LOC

Parse single identifier from mustache content:

- Extract identifier: `{{name}}` → path: `["name"]`
- Validate identifier (alphanumeric + underscore, no spaces)
- Handle `{{this}}` as special case
- Reject invalid identifiers

**Deliverable:** `parseExpression(content: string): Expression` for simple variables

**Tests:**

- `name` → VARIABLE, path: ["name"]
- `this` → THIS
- `_var123` → valid
- `invalid-name` → error
- `invalid name` → error (space)

---

### Task C1-F2-T3: Parse Nested Property Access

**Scope:** ~50 LOC

Parse dot notation into path array:

- Split on `.` to get path segments: `user.name` → `["user", "name"]`
- Validate each segment is valid identifier
- Handle trailing/leading dots (error)
- Handle consecutive dots (error)

**Deliverable:** Path parsing for nested properties

**Tests:**

- `user.name` → path: ["user", "name"]
- `a.b.c.d` → path: ["a", "b", "c", "d"]
- `object.` → error (trailing dot)
- `.property` → error (leading dot)
- `a..b` → error (consecutive dots)

---

### Task C1-F2-T4: Parse Parent Path Access

**Scope:** ~40 LOC

Parse `../` prefix for parent scope access:

- Count leading `../` segments
- Parse remaining path
- Store parent depth + path: `../user.name` → depth: 1, path: ["user", "name"]
- Handle multiple levels: `../../grandparent`

**Deliverable:** Parent path parsing

**Tests:**

- `../parent` → PARENT_PATH, depth: 1, path: ["parent"]
- `../../grandparent` → depth: 2, path: ["grandparent"]
- `../../../a.b.c` → depth: 3, path: ["a", "b", "c"]
- `../` alone → depth: 1, path: []
- Invalid: `..` without `/` → error

---

### Task C1-F2-T5: Parse Block Expressions

**Scope:** ~60 LOC

Identify and parse block helpers:

- Detect `#` prefix for block start: `#if`, `#each`, `#unless`
- Detect `/` prefix for block end: `/if`, `/each`, `/unless`
- Extract block type and condition/target
- Handle `else` as special block modifier

**Deliverable:** Block expression parsing

**Tests:**

- `#if condition` → BLOCK_START, blockType: "if", target: "condition"
- `/if` → BLOCK_END, blockType: "if"
- `#each items` → BLOCK_START, blockType: "each", target: "items"
- `/each` → BLOCK_END, blockType: "each"
- `else` → BLOCK_MODIFIER, type: "else"
- `#unless test` → BLOCK_START, blockType: "unless", target: "test"

---

### Task C1-F2-T6: Parse Comments

**Scope:** ~30 LOC

Identify and parse comment expressions:

- Detect `!` prefix: `{{! comment text }}`
- Extract comment content (for debugging, not rendered)
- Return COMMENT expression type

**Deliverable:** Comment parsing

**Tests:**

- `! this is a comment` → COMMENT
- `! multi-line\ncomment` → preserves content
- Comment with mustaches inside: `! {{not}} {{parsed}}`

---

### Task C1-F2-T7: Integrate Token Classification

**Scope:** ~40 LOC

Connect tokenizer output to expression parser:

- Process token stream
- For each MUSTACHE token, parse expression
- Replace raw content with parsed Expression
- Build `ParsedToken` with Expression instead of raw string

**Deliverable:** `classifyTokens(tokens: Token[]): ParsedToken[]`

**Tests:**

- Token stream → classified tokens with expressions
- Mix of variables, blocks, comments classified correctly
- Invalid expressions produce clear errors

---

## Feature 1.3: AST Construction

**Goal:** Build hierarchical tree from flat token stream

### Task C1-F3-T1: Define AST Node Types

**Scope:** ~50 LOC

Define AST node type hierarchy:

- `ASTNode` base type with `nodeType`, `position`
- `TextNode` with `content: string`
- `VariableNode` with `expression: Expression`, `escaped: boolean`
- `BlockNode` with `blockType: string`, `target: Expression`, `children: ASTNode[]`, `elseChildren?: ASTNode[]`
- `CommentNode` with `content: string`
- `ProgramNode` (root) with `children: ASTNode[]`

**Deliverable:** AST type definitions in `types.ts`

---

### Task C1-F3-T2: Implement AST Builder Class

**Scope:** ~60 LOC

Create builder for constructing AST:

- `ASTBuilder` class with token stream
- Track current position in tokens
- Methods: `buildProgram()`, `buildNode()`, `advance()`, `peek()`, `expect(type)`
- Return `ProgramNode` as root

**Deliverable:** `ASTBuilder` class skeleton

**Tests:**

- Builder initializes with tokens
- Builder can peek and advance
- Builder creates ProgramNode root

---

### Task C1-F3-T3: Build Text and Variable Nodes

**Scope:** ~50 LOC

Convert simple tokens to AST nodes:

- TEXT token → `TextNode`
- VARIABLE expression → `VariableNode` (escaped by default)
- TRIPLE mustache → `VariableNode` (unescaped)
- Handle position tracking for error messages

**Deliverable:** Text and variable node construction

**Tests:**

- `Hello world` → TextNode
- `{{name}}` → VariableNode (escaped: true)
- `{{{html}}}` → VariableNode (escaped: false)
- Mixed text and variables → multiple nodes

---

### Task C1-F3-T4: Build Comment Nodes

**Scope:** ~20 LOC

Convert COMMENT tokens to AST nodes:

- COMMENT expression → `CommentNode`
- Store content for debugging (excluded from output)

**Deliverable:** Comment node construction

**Tests:**

- `{{! comment }}` → CommentNode
- Comments are nodes in AST but won't render

---

### Task C1-F3-T5: Build Block Nodes (Single-Level)

**Scope:** ~80 LOC

Construct block nodes with children:

- Match BLOCK_START with corresponding BLOCK_END
- Collect child nodes between start and end
- Create `BlockNode` with blockType, target, and children
- Validate matching block types: `#if` must close with `/if`

**Deliverable:** Single-level block construction

**Tests:**

- `{{#if test}}content{{/if}}` → BlockNode with TextNode child
- `{{#each items}}{{name}}{{/each}}` → BlockNode with VariableNode child
- Mismatched blocks error: `{{#if}}{{/each}}`
- Unclosed block error: `{{#if}}` with no close

---

### Task C1-F3-T6: Handle Else Clauses

**Scope:** ~60 LOC

Split block children at `{{else}}`:

- Detect ELSE modifier inside block
- Partition children into main and else branches
- Store in `BlockNode.elseChildren`
- Validate else only appears in conditional blocks (if/unless)

**Deliverable:** Else clause handling

**Tests:**

- `{{#if test}}yes{{else}}no{{/if}}` → children + elseChildren
- `{{#unless test}}no{{else}}yes{{/unless}}`
- Multiple else error: `{{#if}}{{else}}{{else}}{{/if}}`
- Else in each error: `{{#each}}{{else}}{{/each}}`

---

### Task C1-F3-T7: Build Nested Blocks

**Scope:** ~70 LOC

Support blocks within blocks:

- Recursive descent: when building children, allow blocks as children
- Maintain stack of open blocks for validation
- Track nesting depth for debugging
- Validate proper nesting (no overlapping blocks)

**Deliverable:** Nested block construction

**Tests:**

- `{{#if outer}}{{#if inner}}text{{/if}}{{/if}}` → nested BlockNodes
- `{{#each items}}{{#if condition}}{{value}}{{/if}}{{/each}}`
- Three levels deep
- Invalid nesting detected: `{{#if}}{{#each}}{{/if}}{{/each}}`

---

### Task C1-F3-T8: Integrate AST Construction

**Scope:** ~40 LOC

Connect classification to AST building:

- Create main `parse()` function
- Call `tokenize()` → `classifyTokens()` → `buildAST()`
- Return `ProgramNode` or throw parse error
- Add comprehensive error messages with position info

**Deliverable:** `parse(template: string): ProgramNode` entry point

**Tests:**

- End-to-end: template string → AST
- Complex template with all node types
- Parse errors include line/column information
- Edge cases: empty template, template with only comments

---

## Summary

**Total Tasks:** 22 tasks across 3 features  
**Estimated LOC:** ~1,000 lines for complete parsing capability  
**Dependencies:** Sequential within features, but features can be validated incrementally

**Validation Strategy:**

- Unit tests for each task
- Integration tests at feature boundaries
- End-to-end parse tests after Feature 1.3

**Next Capability:** Context Resolution (depends on AST being complete)
