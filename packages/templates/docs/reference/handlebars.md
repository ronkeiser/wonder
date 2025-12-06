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

### Critical Context Resolution Patterns

**From runtime.js and javascript-compiler.js:**

Handlebars uses a sophisticated context resolution system for `V1 Capability 2: Context Resolution`:

#### lookupProperty Function

Core security-aware property lookup:

```javascript
lookupProperty: function(parent, propertyName) {
  if (Utils.isMap(parent)) {
    return parent.get(propertyName);
  }

  let result = parent[propertyName];
  if (result == null) {
    return result;
  }

  // Security: Own property check
  if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
    return result;
  }

  // Proto access control for inherited properties
  if (resultIsAllowed(result, container.protoAccessControl, propertyName)) {
    return result;
  }

  return undefined;
}
```

**Key V1 implications:**

- Must handle null/undefined gracefully
- Own properties always accessible
- Prototype properties require allowlist (can skip for V1)
- Special handling for Map objects

#### Depth-based Context Lookup

From `lib/handlebars/runtime.js`:

```javascript
lookup: function(depths, name) {
  const len = depths.length;
  for (let i = 0; i < len; i++) {
    let result = depths[i] && container.lookupProperty(depths[i], name);
    if (result != null) {
      return depths[i][name];
    }
  }
}
```

**V1 implementation:** Scope chain is array of context objects, search from innermost to outermost.

#### escapeExpression Function

From `lib/handlebars/utils.js`:

```javascript
const escape = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

const badChars = /[&<>"'`=]/g,
  possible = /[&<>"'`=]/;

function escapeChar(chr) {
  return escape[chr];
}

export function escapeExpression(string) {
  if (typeof string !== 'string') {
    // don't escape SafeStrings, since they're already safe
    if (string && string.toHTML) {
      return string.toHTML();
    } else if (string == null) {
      return '';
    } else if (!string) {
      return string + '';
    }

    // Force a string conversion as this will be done by the append regardless and
    // the regex test will do this transparently behind the scenes, causing issues if
    // an object's to string has escaped characters in it.
    string = '' + string;
  }

  if (!possible.test(string)) {
    return string;
  }
  return string.replace(badChars, escapeChar);
}
```

**V1 Key Points:**

- **SafeString bypass**: Objects with `toHTML()` method are returned as-is (already safe)
- **Null/undefined handling**: `null` and `undefined` → empty string `""`
- **Falsy values**: `false`, `0` → coerced to string (`"false"`, `"0"`)
- **Objects/arrays**: Converted to string first (`'' + string`), then escaped
- **Fast path optimization**: Quick regex test before actual replacement
- **7 characters escaped**: `&`, `<`, `>`, `"`, `'`, `` ` ``, `=`

#### createFrame Function

From `lib/handlebars/utils.js`:

```javascript
export function createFrame(object) {
  let frame = extend({}, object);
  frame._parent = object;
  return frame;
}
```

**V1 Key Points:**

- Creates new object with all properties from parent
- Adds `_parent` reference for scope chain traversal
- Used for data frames (@variables) and context frames
- Prevents pollution of parent scope when adding new properties

#### Type Checking Utilities

From `lib/handlebars/utils.js`:

```javascript
// Sourced from lodash
export function isFunction(value) {
  return typeof value === 'function';
}

function testTag(name) {
  const tag = '[object ' + name + ']';
  return function (value) {
    return value && typeof value === 'object' ? toString.call(value) === tag : false;
  };
}

export const isArray = Array.isArray;
export const isMap = testTag('Map');
export const isSet = testTag('Set');

export function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  } else if (isArray(value) && value.length === 0) {
    return true;
  } else {
    return false;
  }
}
```

**V1 Key Points:**

- **isEmpty**: Different from falsy! Returns `true` for `null`, `undefined`, `""`, `[]`; returns `false` for `0`, `false`, `{}`, non-empty arrays
- **isArray**: Use native `Array.isArray` when available
- **isMap/isSet**: ES6 Map/Set detection via `Object.prototype.toString`
- **Type safety**: Always check type before using type-specific methods

#### Path Resolution Algorithm

From `javascript-compiler.js resolvePath`:

```javascript
resolvePath: function(type, parts, startPartIndex, falsy, strict) {
  let len = parts.length;
  for (let i = startPartIndex; i < len; i++) {
    this.replaceStack((current) => {
      let lookup = this.nameLookup(current, parts[i], type);

      if (!falsy) {
        // Standard: return empty if null
        return [' != null ? ', lookup, ' : ', current];
      } else {
        // Falsy-aware: generic falsy handling
        return [' && ', lookup];
      }
    });
  }
}
```

**V1 pattern for nested property access:**

```typescript
function resolvePath(context: any, parts: string[]): any {
  let current = context;

  for (const part of parts) {
    if (current == null) return undefined;
    current = lookupProperty(current, part);
  }

  return current;
}
```

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

### Whitespace Control (StripFlags)

From AST documentation and `spec/whitespace-control.js`:

```typescript
interface StripFlags {
  open: boolean; // Strip whitespace before opening tag
  close: boolean; // Strip whitespace after closing tag
}
```

**Syntax:**

- `{{~foo}}` - Strip whitespace **before** the tag
- `{{foo~}}` - Strip whitespace **after** the tag
- `{{~foo~}}` - Strip both before and after
- Works with blocks: `{{~#if foo~}}...{{~/if~}}`

**Examples:**

```handlebars
'
{{~foo~}}
' → 'value' (strips surrounding spaces) '
{{~foo}}
' → 'value ' (strips before only) '
{{foo~}}
' → ' value' (strips after only) '\n{{~foo}}\n' → 'value\n' (strips newline before)
```

**V1 Note:** Whitespace stripping modifies `ContentStatement.value` during parsing. The interpreter doesn't need to handle StripFlags—they're already applied to the AST.

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

## Built-in Helpers (Critical for V1)

### #each Helper Implementation

From `lib/handlebars/helpers/each.js`:

```javascript
instance.registerHelper('each', function (context, options) {
  if (!options) {
    throw new Exception('Must pass iterator to #each');
  }

  let fn = options.fn,
    inverse = options.inverse,
    i = 0,
    ret = '',
    data;

  // Resolve if context is a function
  if (isFunction(context)) {
    context = context.call(this);
  }

  // Create data frame for @variables
  if (options.data) {
    data = createFrame(options.data);
  }

  function execIteration(field, value, index, last) {
    if (data) {
      data.key = field; // @key for object iteration
      data.index = index; // @index (zero-based)
      data.first = index === 0; // @first
      data.last = !!last; // @last
    }

    ret =
      ret +
      fn(value, {
        data: data,
        blockParams: [context[field], field], // as |value key|
      });
  }

  if (context && typeof context === 'object') {
    if (isArray(context)) {
      // Array iteration
      for (let j = context.length; i < j; i++) {
        if (i in context) {
          // Skip sparse array holes
          execIteration(i, context[i], i, i === context.length - 1);
        }
      }
    } else if (isMap(context)) {
      // ES6 Map support
      const j = context.size;
      for (const [key, value] of context) {
        execIteration(key, value, i++, i === j);
      }
    } else if (isSet(context)) {
      // ES6 Set support
      const j = context.size;
      for (const value of context) {
        execIteration(i, value, i++, i === j);
      }
    } else if (typeof Symbol === 'function' && context[Symbol.iterator]) {
      // Generic iterable support
      const newContext = [];
      const iterator = context[Symbol.iterator]();
      for (let it = iterator.next(); !it.done; it = iterator.next()) {
        newContext.push(it.value);
      }
      context = newContext;
      for (let j = context.length; i < j; i++) {
        execIteration(i, context[i], i, i === context.length - 1);
      }
    } else {
      // Object iteration
      let priorKey;
      Object.keys(context).forEach((key) => {
        // Delay iteration by one to detect @last
        if (priorKey !== undefined) {
          execIteration(priorKey, context[priorKey], i - 1);
        }
        priorKey = key;
        i++;
      });
      if (priorKey !== undefined) {
        execIteration(priorKey, context[priorKey], i - 1, true);
      }
    }
  }

  if (i === 0) {
    ret = inverse(this); // Empty case
  }

  return ret;
});
```

**V1 Key Points:**

- **@index**: Zero-based for arrays, objects (incremented per iteration)
- **@first**: True only for index === 0 (checked at start)
- **@last**: Requires lookahead (delayed iteration for objects to detect end)
- **@key**: Property name for object iteration (field parameter)
- **Block params**: `{{#each items as |item index|}}` - passed as [value, key]
- **Sparse arrays**: Check `i in context` before iteration to skip holes
- **Empty arrays/objects**: Render inverse block when i === 0
- **Data frame creation**: Uses `createFrame(options.data)` for @variables
- **Object iteration strategy**: Delayed by one to detect @last (store priorKey)
- **Iteration order**: Arrays by index, Objects by `Object.keys()` order

**Critical implementation pattern for @last in objects:**

```javascript
// Delay iteration by one to detect @last
let priorKey;
Object.keys(context).forEach((key) => {
  if (priorKey !== undefined) {
    execIteration(priorKey, context[priorKey], i - 1);
  }
  priorKey = key;
  i++;
});
if (priorKey !== undefined) {
  execIteration(priorKey, context[priorKey], i - 1, true); // Set last=true
}
```

### #if / #unless Helpers

From `lib/handlebars/helpers/if.js`:

```javascript
instance.registerHelper('if', function (conditional, options) {
  if (arguments.length != 2) {
    throw new Exception('#if requires exactly one argument');
  }

  // Resolve functions
  if (isFunction(conditional)) {
    conditional = conditional.call(this);
  }

  // Truthiness evaluation
  // includeZero option: treat 0 as truthy
  if ((!options.hash.includeZero && !conditional) || isEmpty(conditional)) {
    return options.inverse(this);
  } else {
    return options.fn(this);
  }
});

instance.registerHelper('unless', function (conditional, options) {
  if (arguments.length != 2) {
    throw new Exception('#unless requires exactly one argument');
  }
  // Unless is just inverted if
  return instance.helpers['if'].call(this, conditional, {
    fn: options.inverse,
    inverse: options.fn,
    hash: options.hash,
  });
});
```

**isEmpty Utility:**

From `lib/handlebars/utils.js`:

```javascript
export function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  } else if (isArray(value) && value.length === 0) {
    return true;
  } else {
    return false;
  }
}
```

**V1 Note:** This is separate from truthiness evaluation. `isEmpty` is specifically used for:

- Determining whether to render inverse blocks
- Empty array check (even though `[]` is truthy in if/unless)
- Special handling for 0 (not considered empty)

**V1 Truthiness Rules:**

- **Falsy**: `false`, `null`, `undefined`, `""`, `[]`, `0` (unless includeZero)
- **Truthy**: Everything else, including `{}`, non-empty arrays/strings
- **Functions**: Resolved before evaluation
- **Objects**: Always truthy (even empty `{}`)

### #with Helper

From `lib/handlebars/helpers/with.js`:

```javascript
instance.registerHelper('with', function (context, options) {
  if (arguments.length != 2) {
    throw new Exception('#with requires exactly one argument');
  }

  if (isFunction(context)) {
    context = context.call(this);
  }

  let fn = options.fn;

  if (!isEmpty(context)) {
    return fn(context, {
      data: options.data,
      blockParams: [context], // as |value|
    });
  } else {
    return options.inverse(this);
  }
});
```

### blockHelperMissing

From `lib/handlebars/helpers/block-helper-missing.js`:

```javascript
instance.registerHelper('blockHelperMissing', function (context, options) {
  let inverse = options.inverse,
    fn = options.fn;

  if (context === true) {
    return fn(this);
  } else if (context === false || context == null) {
    return inverse(this);
  } else if (isArray(context)) {
    if (context.length > 0) {
      return instance.helpers.each(context, options); // Delegates to #each
    } else {
      return inverse(this);
    }
  } else {
    return fn(context, options);
  }
});
```

**V1 Key:** This is why `{{#items}}...{{/items}}` works without explicit `#each`.

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

## Error Handling Patterns

From helper implementations and specs:

### Common Errors Thrown

```javascript
// From lib/handlebars/helpers/each.js
throw new Exception('Must pass iterator to #each');

// From lib/handlebars/helpers/if.js
throw new Exception('#if requires exactly one argument');
throw new Exception('#unless requires exactly one argument');

// From lib/handlebars/helpers/with.js
throw new Exception('#with requires exactly one argument');

// From lib/handlebars/runtime.js
throw new Exception(
  'The partial ' + options.name + ' could not be compiled when running in runtime-only mode',
);
```

### Exception Class

From `@handlebars/parser`:

```typescript
class Exception {
  constructor(message: string, node?: AST.Node);
  message: string;
  description: string;
  fileName: string;
  lineNumber?: number;
  column?: number;
  // ... additional properties for error context
}
```

**V1 Error Handling Strategy:**

- **Parse errors**: Throw during tokenization/parsing with position info
- **Runtime errors**: Throw during interpretation with context
- **Helper errors**: Validate argument counts and types
- **Missing helpers**: Can be configured to error or silently fail
- **Undefined variables**: By default return empty string (can enable strict mode)

### Error Context

Handlebars tracks location information in the AST:

```typescript
interface SourceLocation {
  source: string | null;
  start: Position; // { line: number, column: number }
  end: Position;
}
```

**V1 Priority:** Focus on clear error messages with template position for debugging. Line/column tracking is important for user experience.

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

## Critical Implementation Details

### Helper vs Variable Resolution

From `lib/handlebars/compiler/compiler.js` and `lib/handlebars/compiler/ast.js`:

**Classification Algorithm:**

```javascript
classifySexpr: function(sexpr) {
  let isSimple = AST.helpers.simpleId(sexpr.path);  // Single part, not scoped, no depth
  let isBlockParam = isSimple && !!this.blockParamIndex(sexpr.path.parts[0]);

  // a mustache is an eligible helper if:
  // * its id is simple (a single part, not `this` or `..`)
  let isHelper = !isBlockParam && AST.helpers.helperExpression(sexpr);

  // if a mustache is an eligible helper but not a definite helper,
  // it is ambiguous, and will be resolved in a later pass or at runtime.
  let isEligible = !isBlockParam && (isHelper || isSimple);

  // if ambiguous, we can possibly resolve the ambiguity now
  // An eligible helper is one that does not have a complex path,
  // i.e. `this.foo`, `../foo` etc.
  if (isEligible && !isHelper) {
    let name = sexpr.path.parts[0];
    if (options.knownHelpers[name]) {
      isHelper = true;
    } else if (options.knownHelpersOnly) {
      isEligible = false;
    }
  }

  if (isHelper) {
    return 'helper';
  } else if (isEligible) {
    return 'ambiguous';
  } else {
    return 'simple';
  }
}
```

**AST Helper Methods:**

```javascript
// From lib/handlebars/compiler/ast.js
AST.helpers = {
  // a mustache is definitely a helper if:
  // * it is an eligible helper, and
  // * it has at least one parameter or hash segment
  helperExpression: function (node) {
    return (
      node.type === 'SubExpression' ||
      ((node.type === 'MustacheStatement' || node.type === 'BlockStatement') &&
        !!((node.params && node.params.length) || node.hash))
    );
  },

  scopedId: function (path) {
    return /^\.|this\b/.test(path.original);
  },

  // an ID is simple if it only has one part, and that part is not
  // `..` or `this`.
  simpleId: function (path) {
    return path.parts.length === 1 && !AST.helpers.scopedId(path) && !path.depth;
  },
};
```

**Resolution Rules:**

1. **Helper (definite)**:
   - Has params OR hash: `{{foo bar}}` or `{{foo key=val}}`
   - SubExpression: `{{outer (inner)}}`
   - In knownHelpers list with single ID

2. **Ambiguous** (runtime resolution):
   - Simple single ID: `{{foo}}`
   - No params, no hash
   - Not in knownHelpers, not knownHelpersOnly mode

3. **Simple** (variable lookup):
   - Complex path: `{{foo.bar}}`, `{{../foo}}`, `{{this.foo}}`
   - Block param reference
   - Scoped: starts with `.` or `this`

**Runtime Resolution for Ambiguous:**

From `lib/handlebars/compiler/javascript-compiler.js`:

```javascript
invokeAmbiguous: function(name, helperCall) {
  let nonHelper = this.popStack();  // Variable lookup result
  let helper = this.setupHelper(0, name, helperCall);
  let helperName = this.nameLookup('helpers', name, 'helper');

  let lookup = ['(', '(helper = ', helperName, ' || ', nonHelper, ')'];
  if (!this.options.strict) {
    lookup.push(' != null ? helper : ',
                this.aliasable('container.hooks.helperMissing'));
  }

  // Check if helper is function, if so call it, otherwise use as value
  this.push(['(',
    lookup,
    helper.paramsInit ? ['),(', helper.paramsInit] : [],
    '),',
    '(typeof helper === ',
    this.aliasable('"function"'),
    ' ? ',
    this.source.functionCall('helper', 'call', helper.callParams),
    ' : helper)'
  ]);
}
```

**V1 Key Points:**

- Helpers take precedence over context properties (test: "helpers take precedence over same-named context properties")
- Pathed expressions `{{foo.bar}}` are NEVER helpers (cannot have params)
- `{{.}}` or `{{this}}` alone cannot be helpers
- `{{../foo}}` parent access cannot be a helper
- Block params take highest precedence (shadow helpers and context)

**helperMissing Fallback:**

From `lib/handlebars/helpers/helper-missing.js`:

```javascript
instance.registerHelper('helperMissing', function (/* [args, ]options */) {
  if (arguments.length === 1) {
    // A missing field in a {{foo}} construct - just return undefined
    return undefined;
  } else {
    // Someone is actually trying to call something, blow up.
    throw new Exception('Missing helper: "' + arguments[arguments.length - 1].name + '"');
  }
});
```

---

### `this` Context Handling

From `lib/handlebars/compiler/compiler.js` and test specs:

**Path Structure:**

```typescript
interface PathExpression {
  type: 'PathExpression';
  data: boolean; // true if starts with @
  depth: number; // 0=current, 1=../, 2=../../, etc.
  parts: string[]; // ['foo', 'bar'] - excludes '.', '..', 'this'
  original: string; // Raw path as entered
}
```

**Key Parsing Rules:**

1. **`{{this}}`**:
   - parts: `[]` (empty)
   - depth: `0`
   - Resolves to current context value

2. **`{{this.property}}`**:
   - parts: `['property']`
   - depth: `0`
   - Scoped (starts with `this`), so normal property lookup

3. **`{{./property}}`** (explicit relative):
   - parts: `['property']`
   - depth: `0`
   - Scoped (starts with `.`), prevents helper resolution

4. **`{{../parent}}`** (parent context):
   - parts: `['parent']`
   - depth: `1`
   - Look up `parent` in parent context

5. **`{{../../grandparent}}`**:
   - parts: `['grandparent']`
   - depth: `2`
   - Look up in grandparent context

**Scoped ID Check:**

```javascript
scopedId: function(path) {
  return /^\.|this\b/.test(path.original);
}
```

- Returns `true` for: `{{.}}`, `{{./foo}}`, `{{this}}`, `{{this.foo}}`
- Scoped paths are never eligible for helper resolution

**PathExpression Compilation:**

From `lib/handlebars/compiler/compiler.js`:

```javascript
PathExpression: function(path) {
  this.addDepth(path.depth);
  this.opcode('getContext', path.depth);  // Set context depth

  let name = path.parts[0];
  let scoped = AST.helpers.scopedId(path);
  let blockParamId = !path.depth && !scoped &&
                     this.blockParamIndex(name);

  if (blockParamId) {
    this.opcode('lookupBlockParam', blockParamId, path.parts);
  } else if (!name) {
    // Context reference, i.e. `{{foo .}}` or `{{foo ..}}`
    // parts is empty, just push context
    this.opcode('pushContext');
  } else if (path.data) {
    // @data variable
    this.opcode('lookupData', path.depth, path.parts, path.strict);
  } else {
    // Normal property lookup
    this.opcode('lookupOnContext',
                path.parts,
                path.falsy,
                path.strict,
                scoped);
  }
}
```

**Context Stack Management:**

From `lib/handlebars/runtime.js`:

```javascript
// Depths array maintains context stack
if (templateSpec.useDepths) {
  if (options.depths) {
    depths = context != options.depths[0]
      ? [context].concat(options.depths)
      : options.depths;
  } else {
    depths = [context];
  }
}

// Access parent contexts
data: function(value, depth) {
  while (value && depth--) {
    value = value._parent;
  }
  return value;
}
```

**V1 Key Points:**

- `{{this}}` with empty parts array returns the current context object
- `{{this.foo}}` is equivalent to `{{foo}}` (both look up `foo` on current context)
- `{{./foo}}` explicitly prevents helper resolution (forces variable lookup)
- `{{../foo}}` accesses parent context (depth=1)
- `{{this}}` in helper params passes current context: `{{helper this}}`
- Cannot use `{{this/foo}}` (invalid syntax, throws error)
- Bracket notation allows special names: `{{[this]}}` looks up property named "this"

---

### Data Variables (@variables)

From `lib/handlebars/runtime.js`, `lib/handlebars/helpers/each.js`, and test specs:

**Data Frame Structure:**

```javascript
// From lib/handlebars/utils.js
export function createFrame(object) {
  let frame = extend({}, object); // Copy all properties
  frame._parent = object; // Link to parent frame
  return frame;
}

// From lib/handlebars/runtime.js
function initData(context, data) {
  if (!data || !('root' in data)) {
    data = data ? createFrame(data) : {};
    data.root = context; // Top-level context
  }
  return data;
}
```

**Built-in Data Variables:**

1. **`@root`** - Always points to top-level context:

```javascript
// Set in initData
data.root = context;

// Access at any depth
{{@root.topLevelProp}}
```

2. **`@index`** - Zero-based position in arrays/objects:

```javascript
// Set in #each helper
data.index = index;

// Usage
{{#each items}}{{@index}}: {{name}}{{/each}}
// Output: 0: foo 1: bar
```

3. **`@first`** - Boolean, true for first iteration:

```javascript
// Set in #each helper
data.first = index === 0;

// Usage
{{#each items}}{{#if @first}}First!{{/if}}{{/each}}
```

4. **`@last`** - Boolean, true for last iteration:

```javascript
// Set in #each helper with lookahead
data.last = !!last;

// For objects, requires delayed iteration:
let priorKey;
Object.keys(context).forEach((key) => {
  if (priorKey !== undefined) {
    execIteration(priorKey, context[priorKey], i - 1);
  }
  priorKey = key;
  i++;
});
if (priorKey !== undefined) {
  execIteration(priorKey, context[priorKey], i - 1, true); // last=true
}
```

5. **`@key`** - Property name in object iteration:

```javascript
// Set in #each helper for objects
data.key = field;

// Usage
{{#each obj}}{{@key}}: {{this}}{{/each}}
// Output: prop1: value1 prop2: value2
```

**Data Frame Inheritance:**

From `lib/handlebars/helpers/each.js`:

```javascript
if (options.data) {
  data = createFrame(options.data); // Inherit parent data
}

function execIteration(field, value, index, last) {
  if (data) {
    data.key = field;
    data.index = index;
    data.first = index === 0;
    data.last = !!last;
  }

  ret =
    ret +
    fn(value, {
      data: data, // Pass data frame
      blockParams: [context[field], field],
    });
}
```

**Accessing Parent Data:**

While not explicitly shown in the #each implementation, data frames have `_parent`:

```javascript
frame._parent; // Reference to parent data frame
```

However, from test specs, parent loop variables are NOT accessible via `{{@../index}}`. The `@` prefix only accesses the current data frame. Parent context variables use `{{../var}}` without `@`.

**PathExpression.data Flag:**

```typescript
interface PathExpression {
  data: boolean; // true if starts with @
  // ...
}
```

When `path.data === true`, compilation uses:

```javascript
this.opcode('lookupData', path.depth, path.parts, path.strict);
```

**Data Lookup Resolution:**

From `lib/handlebars/compiler/javascript-compiler.js`:

```javascript
lookupData: function(depth, parts, strict) {
  if (!depth) {
    this.pushStackLiteral('data');
  } else {
    this.pushStackLiteral('container.data(data, ' + depth + ')');
  }

  this.resolvePath('data', parts, 0, true, strict);
}
```

With depth tracking via `container.data()`:

```javascript
data: function(value, depth) {
  while (value && depth--) {
    value = value._parent;
  }
  return value;
}
```

**V1 Key Points:**

- Data variables use `@` prefix: `{{@index}}`, `{{@root.foo}}`
- Each data frame inherits parent via `createFrame(options.data)`
- `@root` is set once at template initialization to top-level context
- Loop metadata (`@index`, `@first`, `@last`, `@key`) only in current frame
- Cannot access parent loop's `@index` with `{{@../index}}` (not supported)
- Use `{{../contextVar}}` for parent context, `{{@root.var}}` for top-level
- Empty string keys are valid: `{{#each obj}}{{@key}}{{/each}}` handles `""` key
- Data frames have `_parent` property (internal, but enumerable)

**Custom Data Variables:**

Helpers can add custom data properties:

```javascript
// In a helper
let frame = Handlebars.createFrame(options.data);
frame.customVar = 'value';
return options.fn(this, { data: frame });

// Then in template
{{#helper}}{{@customVar}}{{/helper}}
```

---

## References

- Main entry: `lib/handlebars.js`
- AST definitions: `lib/handlebars/compiler/ast.js`
- Compiler: `lib/handlebars/compiler/compiler.js`
- JavaScript compiler: `lib/handlebars/compiler/javascript-compiler.js`
- Code generation: `lib/handlebars/compiler/code-gen.js`
- Utils: `lib/handlebars/utils.js` (escapeExpression, etc.)
- Tests: `spec/tokenizer.js`, `spec/compiler.js`, `spec/basic.js`, `spec/helpers.js`, `spec/data.js`

---

## Implementation Gaps

This section documents remaining areas that require further investigation from the Handlebars source code before implementing `@wonder/templates`.

### Important Gaps (Clarify During Implementation)

#### 1. Truthiness vs isEmpty Interaction

**Status:** Both functions documented separately

**What's Missing:**

- Clear decision tree for conditional evaluation
- Why `isEmpty([])` is true but `if([])` renders else block
- When `includeZero` option applies and its default value
- Whether custom helpers can override truthiness

**Current Understanding:**

```javascript
// isEmpty - used for deciding whether to iterate
isEmpty([])      // true (no items to iterate)
isEmpty({})      // false (object exists)
isEmpty(0)       // false (0 is a value)
isEmpty("")      // true

// Truthiness - used for if/unless conditionals
if ([])          // false (empty array is falsy for conditionals)
if ({})          // true (objects always truthy)
if (0)           // false (unless includeZero: true)
if ("")          // false
```

**Where to Look:**

- `#if` helper implementation interaction with `isEmpty()`
- Default options for `includeZero`
- Test specs for edge cases

**Impact:** MEDIUM - Could cause subtle bugs in conditional logic

---

#### 5. Block Parameters (as |variable| syntax)

**Status:** Tokens listed, not explained

**What's Missing:**

- Parsing of `{{#each items as |item index|}}`
- How block params shadow outer scope variables
- Block param assignment in AST (BlockStatement structure)
- Whether block params are required or optional
- Nesting behavior: `{{#each outer as |o|}}{{#each inner as |i|}}...`

**Examples Needed:**

```handlebars
{{#each items as |item|}}
  {{item.name}}
  <!-- Access via block param -->
{{/each}}

{{#each items as |item index|}}
  {{index}}:
  {{item}}
  <!-- Multiple block params -->
{{/each}}

{{name}}
<!-- Outer scope (not shadowed) -->
{{#with user as |u|}}
  {{u.name}}
  <!-- Block param -->
  {{name}}
  <!-- Still accessible or shadowed? -->
{{/with}}
```

**Where to Look:**

- `OPEN_BLOCK_PARAMS` / `CLOSE_BLOCK_PARAMS` token handling
- BlockStatement.blockParams in AST
- Helper implementations using `options.blockParams`
- Scope frame creation with block params

**Impact:** MEDIUM - Useful for clean templates, but V1 can work without it

---

### Lower Priority Gaps (Can Defer to V2)

#### 6. Subexpressions

**Status:** Token types listed only

**What's Missing:**

- Complete subexpression syntax: `{{outer (inner arg1 arg2)}}`
- Nesting rules and evaluation order
- Using subexpressions in conditionals: `{{#if (gt value 10)}}`
- SubExpression AST node structure and interpretation

**Impact:** LOW - Nice to have for complex logic, not essential for V1

---

#### 7. Hash Parameters

**Status:** AST structure documented, no usage examples

**What's Missing:**

- Hash syntax: `{{helper arg1 key1=value1 key2=value2}}`
- Hash evaluation in helper invocations
- Whether hash values can be expressions or only literals
- Hash parameter precedence and overriding

**Impact:** LOW - Advanced feature, likely not needed for prompt templates

---

#### 8. Property Iteration Order

**Status:** Uses `Object.keys()` but edge cases unclear

**What's Missing:**

- ES2015+ property ordering guarantees (integer keys first, then insertion order)
- Symbol properties handling (are they skipped?)
- Prototype chain traversal behavior
- Consistency across different contexts

**Impact:** LOW - Edge case, unlikely to matter for typical usage

---

### Next Steps

**During Implementation:**

1. Validate understanding of Gaps #1-2 with test cases
2. Make explicit decisions about whether to include block params

**For V2 Planning:**

3. Evaluate whether Gaps #3-5 are needed for LLM prompt use cases
