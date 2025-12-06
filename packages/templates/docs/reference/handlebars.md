# Handlebars.js Reference Implementation

Source: https://github.com/handlebars-lang/handlebars.js

## Architecture Overview

Handlebars uses a **three-stage pipeline**: Lexer → Parser → Compiler

1. **Lexer** (tokenization) - Converts template string to token stream
2. **Parser** - Builds AST from tokens (using grammar rules)
3. **Compiler** - Converts AST to JavaScript code via `new Function()` or precompiled output

**Critical for Wonder:** Handlebars generates executable JavaScript at runtime via `new Function()`, which is **blocked in Cloudflare Workers**. We need stages 1-2 only (Lexer + Parser), then interpret the AST directly.

---

## Stage 1: Lexer (Tokenization)

### Token Types

From `spec/tokenizer.js`, the lexer produces these token types:

| Token Type           | Example              | Description                    |
| -------------------- | -------------------- | ------------------------------ |
| `OPEN`               | `{{`                 | Standard mustache opening      |
| `CLOSE`              | `}}`                 | Standard mustache closing      |
| `OPEN_UNESCAPED`     | `{{{` or `{{&`       | Unescaped output opening       |
| `CLOSE_UNESCAPED`    | `}}}`                | Unescaped output closing       |
| `OPEN_BLOCK`         | `{{#`                | Block helper opening           |
| `CLOSE`              | `}}`                 | Generic closing delimiter      |
| `OPEN_ENDBLOCK`      | `{{/`                | Block helper closing           |
| `OPEN_INVERSE`       | `{{^`                | Inverse block opening          |
| `INVERSE`            | `{{else}}`           | Standalone else                |
| `OPEN_INVERSE_CHAIN` | `{{else if}}`        | Chained else                   |
| `OPEN_PARTIAL`       | `{{>`                | Partial invocation             |
| `OPEN_SEXPR`         | `(`                  | Subexpression opening          |
| `CLOSE_SEXPR`        | `)`                  | Subexpression closing          |
| `OPEN_RAW_BLOCK`     | `{{{{`               | Raw block opening              |
| `CLOSE_RAW_BLOCK`    | `}}}}`               | Raw block closing              |
| `END_RAW_BLOCK`      | `{{{{/`              | Raw block ending               |
| `COMMENT`            | `{{!` or `{{!--`     | Comment                        |
| `CONTENT`            | plain text           | Text content between mustaches |
| `ID`                 | identifier           | Variable/helper names          |
| `STRING`             | `"text"` or `'text'` | String literals                |
| `NUMBER`             | `123`, `1.5`, `-1`   | Number literals                |
| `BOOLEAN`            | `true`, `false`      | Boolean literals               |
| `UNDEFINED`          | `undefined`          | Undefined literal              |
| `NULL`               | `null`               | Null literal                   |
| `DATA`               | `@`                  | Data variable prefix           |
| `SEP`                | `.` or `/`           | Path separator                 |
| `EQUALS`             | `=`                  | Hash parameter assignment      |
| `OPEN_BLOCK_PARAMS`  | `as \|`              | Block params opening           |
| `CLOSE_BLOCK_PARAMS` | `\|`                 | Block params closing           |

### Lexer Implementation Pattern

```typescript
// From spec/tokenizer.js - how Handlebars uses its lexer
function tokenize(template: string) {
  const parser = Handlebars.Parser;
  const lexer = parser.lexer;

  lexer.setInput(template);
  const tokens = [];
  let token;

  while ((token = lexer.lex())) {
    const tokenName = parser.terminals_[token] || token;
    if (!tokenName || tokenName === 'EOF' || tokenName === 'INVALID') {
      break;
    }
    tokens.push({
      name: tokenName,
      text: lexer.yytext, // actual text matched
    });
  }

  return tokens;
}
```

**Key observations:**

- Lexer is stateful: `setInput()` initializes, `lex()` returns next token
- `yytext` contains the matched text for each token
- Uses terminals table to map token numbers to names
- Continues until EOF or INVALID

### Escape Handling

From `spec/tokenizer.js` tests:

**Escaped delimiters:**

- `\\{{foo}}` → Literal `{{foo}}` as CONTENT (not parsed)
- `\\\\{{foo}}` → Literal `\` followed by parsed `{{foo}}`

**Escaped escape characters:**

- `{{foo}} \\{{bar}}` → Parse `{{foo}}`, literal `{{bar}}`
- `{{foo}} \\\\{{bar}}` → Parse `{{foo}}`, literal `\`, parse `{{bar}}`

**Pattern:** Backslash escaping works on the raw template string before tokenization.

### Special Character Sequences

**Triple stash (unescaped):**

- `{{{html}}}` → `OPEN_UNESCAPED`, content, `CLOSE_UNESCAPED`
- Alternative: `{{& html}}` → Same as triple stash

**Path notation:**

- `{{foo.bar}}` → `OPEN`, `ID("foo")`, `SEP`, `ID("bar")`, `CLOSE`
- `{{foo/bar}}` → Same token sequence (`.` and `/` both produce `SEP`)

**Parent paths:**

- `{{..}}` → `ID("..")`
- `{{../parent}}` → `ID("..")`, `SEP`, `ID("parent")`
- `{{../../grandparent}}` → Multiple `..` IDs separated by SEP

**Bracket notation for special characters:**

- `{{foo.[bar]}}` → Allows property names with special chars
- `{{foo.[bar\\]]}}` → Can escape within brackets

**Whitespace in mustaches:**

- `{{  foo  }}` → Preserves spacing, tokenizes to `ID("foo")`
- Whitespace is trimmed within mustache during parsing, not lexing

---

## Stage 2: Parser & AST

### AST Node Types

From `docs/compiler-api.md` and `lib/handlebars/compiler/ast.js`:

#### Basic Structure

```typescript
interface Node {
  type: string;
  loc: SourceLocation | null;
}

interface SourceLocation {
  source: string | null;
  start: Position;
  end: Position;
}

interface Position {
  line: number; // >= 1
  column: number; // >= 0
}
```

#### Program (Root Node)

```typescript
interface Program extends Node {
  type: 'Program';
  body: Statement[];
  blockParams: string[]; // Block parameter names
}
```

#### Statements

**MustacheStatement** (variable/helper output):

```typescript
interface MustacheStatement extends Node {
  type: 'MustacheStatement';
  path: PathExpression | Literal;
  params: Expression[];
  hash: Hash;
  escaped: boolean; // true for {{, false for {{{
  strip: StripFlags | null; // Whitespace control
}
```

**BlockStatement** (block helpers: if, each, etc.):

```typescript
interface BlockStatement extends Node {
  type: 'BlockStatement';
  path: PathExpression | Literal;
  params: Expression[];
  hash: Hash;
  program: Program | null; // Main block content
  inverse: Program | null; // {{else}} content
  openStrip: StripFlags | null; // {{~#
  inverseStrip: StripFlags | null; // {{~else
  closeStrip: StripFlags | null; // ~/}}
}
```

**ContentStatement** (plain text):

```typescript
interface ContentStatement extends Node {
  type: 'ContentStatement';
  value: string; // The actual text content
  original: string;
}
```

**CommentStatement**:

```typescript
interface CommentStatement extends Node {
  type: 'CommentStatement';
  value: string;
  strip: StripFlags | null;
}
```

**PartialStatement**:

```typescript
interface PartialStatement extends Node {
  type: 'PartialStatement';
  name: PathExpression | SubExpression;
  params: Expression[];
  hash: Hash;
  indent: string;
  strip: StripFlags | null;
}
```

#### Expressions

**PathExpression** (variable access):

```typescript
interface PathExpression extends Node {
  type: 'PathExpression';
  data: boolean; // true if starts with @
  depth: number; // Number of ../ segments
  parts: string[]; // Path segments: ["foo", "bar"]
  original: string; // Original path string
}
```

**SubExpression** (helper invocation within expression):

```typescript
interface SubExpression extends Node {
  type: 'SubExpression';
  path: PathExpression;
  params: Expression[];
  hash: Hash;
}
```

**Hash** (named parameters):

```typescript
interface Hash extends Node {
  type: 'Hash';
  pairs: HashPair[];
}

interface HashPair extends Node {
  type: 'HashPair';
  key: string;
  value: Expression;
}
```

#### Literals

```typescript
interface StringLiteral extends Node {
  type: 'StringLiteral';
  value: string;
  original: string;
}

interface NumberLiteral extends Node {
  type: 'NumberLiteral';
  value: number;
  original: number;
}

interface BooleanLiteral extends Node {
  type: 'BooleanLiteral';
  value: boolean;
  original: boolean;
}

interface UndefinedLiteral extends Node {
  type: 'UndefinedLiteral';
}

interface NullLiteral extends Node {
  type: 'NullLiteral';
}
```

### AST Helper Methods

From `lib/handlebars/compiler/ast.js`:

```typescript
const AST = {
  helpers: {
    // Check if node is a helper call (has params or hash)
    helperExpression: (node) => {
      return (
        node.type === 'SubExpression' ||
        ((node.type === 'MustacheStatement' || node.type === 'BlockStatement') &&
          !!((node.params && node.params.length) || node.hash))
      );
    },

    // Check if path is scoped (starts with . or this)
    scopedId: (path) => {
      return /^\.|this\b/.test(path.original);
    },

    // Check if path is simple (single part, not scoped, no depth)
    simpleId: (path) => {
      return path.parts.length === 1 && !AST.helpers.scopedId(path) && !path.depth;
    },
  },
};
```

### Parser Usage

From `spec/compiler.js`:

```typescript
// Parse template to AST
const ast = Handlebars.parse(templateString);

// AST can be passed to compile
const template = Handlebars.compile(ast);

// Or manipulated before compilation
function modifyAST(ast: Program) {
  // Walk and transform nodes
  return ast;
}
```

---

## Stage 3: Compiler (Not Needed for Wonder)

Handlebars compiler generates JavaScript code via `new Function()`:

```typescript
// From lib/handlebars/compiler/compiler.js
export function precompile(input, options = {}, env) {
  validateInput(input, options);
  let environment = compileEnvironment(input, options, env);
  return new env.JavaScriptCompiler().compile(environment, options);
}
```

**This is what we CANNOT do in Workers.** Instead, we'll interpret the AST directly.

---

## Visitor Pattern

From `docs/compiler-api.md`, Handlebars provides a Visitor base class for walking the AST:

```typescript
const Visitor = Handlebars.Visitor;

function MyVisitor() {
  this.partials = [];
}
MyVisitor.prototype = new Visitor();

// Override methods for specific node types
MyVisitor.prototype.MustacheStatement = function (mustache) {
  // Handle mustache node
  Visitor.prototype.MustacheStatement.call(this, mustache);
};

MyVisitor.prototype.BlockStatement = function (block) {
  // Handle block node
  Visitor.prototype.BlockStatement.call(this, block);
};

// Use visitor
const visitor = new MyVisitor();
visitor.accept(ast);
```

**Visitor maintains:**

- `parents` array - ancestor nodes (most recent first)
- Default traversal - visits all children recursively

**Node-specific methods:**

- `Program(program)`
- `BlockStatement(block)`
- `MustacheStatement(mustache)`
- `PartialStatement(partial)`
- `ContentStatement(content)`
- `CommentStatement(comment)`
- `SubExpression(sexpr)`
- `PathExpression(path)`
- `StringLiteral(str)`
- `NumberLiteral(num)`
- `BooleanLiteral(bool)`
- `UndefinedLiteral(undef)`
- `NullLiteral(nul)`
- `Hash(hash)`
- `HashPair(pair)`

---

## Key Takeaways for @wonder/templates

### What We Can Borrow

1. **Token types** - Use similar token taxonomy
2. **AST structure** - Node types are well-designed
3. **Visitor pattern** - Clean way to traverse/interpret AST
4. **Escape handling** - Backslash escaping logic
5. **Path parsing** - Dot notation, parent paths, bracket notation

### What We Can't Use

1. **Lexer implementation** - Likely uses grammar generator (Jison)
2. **Parser implementation** - Grammar-based, complex
3. **Compiler** - Uses `new Function()`, blocked in Workers

### Our Approach

1. **Custom lexer** - Hand-written state machine (simpler than grammar-based)
2. **Custom parser** - Recursive descent for our subset of features
3. **AST interpreter** - Walk AST and evaluate directly (no code generation)

### Differences from Handlebars

- **Simpler lexer** - Fewer token types (no partials, decorators, raw blocks in V1)
- **Smaller AST** - Fewer node types initially
- **Direct interpretation** - No JavaScript generation
- **Synchronous only** - No async helpers/partials in V1

---

## Version Information

- Current version: 4.7.7
- Compiler revision: 8
- Source: `lib/handlebars/base.js`

---

## References

- Main entry: `lib/handlebars.js`
- AST definitions: `lib/handlebars/compiler/ast.js`
- Compiler: `lib/handlebars/compiler/compiler.js`
- JavaScript compiler: `lib/handlebars/compiler/javascript-compiler.js`
- Code generation: `lib/handlebars/compiler/code-gen.js`
- Utils: `lib/handlebars/utils.js` (escapeExpression, etc.)
- Tests: `spec/tokenizer.js`, `spec/compiler.js`, `spec/basic.js`
