# Capability 6: Helpers & Subexpressions

**Status:** `[ ]` **NOT STARTED**

**Goal:** Support runtime helper functions and nested helper calls (subexpressions) within template expressions, enabling complex logic like comparisons and custom transformations.

**Reference:** Handlebars `compiler/parser.js` (SubExpression grammar), `runtime.js` (helper resolution), `helpers/helpers.js` (built-in comparison helpers)

**Summary:**

- Feature 6.1: SubExpression Parsing - Parse nested helper calls like `(gt x 1)`
- Feature 6.2: SubExpression Evaluation - Recursively evaluate nested expressions
- Feature 6.3: Built-in Comparison Helpers - Implement `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not`
- Feature 6.4: Runtime Helper Registry - Accept user-provided helpers at render time
- Feature 6.5: Helper Detection - Distinguish between variable lookups and helper calls

**Dependencies:**

- Capability 1: Lexer (✅ Complete)
- Capability 2: Parser & AST (✅ Complete)
- Capability 3: Runtime Utilities (✅ Complete)
- Capability 4: Context Resolution & Interpreter (✅ Complete)
- Capability 5: Built-in Block Helpers (✅ Complete)

---

## Feature 6.1: SubExpression Parsing

**Goal:** Extend parser to recognize and build SubExpression AST nodes for nested helper calls

**Status:** `[ ]` Not Started

**Estimated LOC:** ~80 lines (lexer updates ~10, parser ~60, expression parsing ~10)

### Background

Subexpressions in Handlebars allow helper calls to be nested within other expressions:

```handlebars
{{#if (gt score 80)}}A grade{{/if}}
{{#if (and isValid (eq status 'active'))}}Show{{/if}}
```

**SubExpression AST structure:**

```typescript
interface SubExpression extends Node {
  type: 'SubExpression';
  path: PathExpression; // Helper name
  params: Expression[]; // Arguments (can include nested SubExpressions)
  hash: Hash; // Named parameters (reserved for future)
}
```

### Task C6-F1-T1: Add SubExpression Token Recognition

**Status:** `[ ]` Not Started

**Goal:** Ensure lexer produces `OPEN_SEXPR` and `CLOSE_SEXPR` tokens for parentheses

**Requirements:**

- `(` within mustache context → `OPEN_SEXPR` token
- `)` within mustache context → `CLOSE_SEXPR` token
- Track nesting depth to handle nested subexpressions
- Maintain proper token context (inside vs outside mustaches)

**Test cases:**

```typescript
describe('SubExpression Tokenization', () => {
  test('simple subexpression', () => {
    const tokens = tokenize('{{#if (gt x 1)}}yes{{/if}}');
    // Should include OPEN_SEXPR and CLOSE_SEXPR tokens
  });

  test('nested subexpressions', () => {
    const tokens = tokenize('{{#if (and (gt x 1) (lt x 10))}}yes{{/if}}');
    // Multiple levels of OPEN_SEXPR/CLOSE_SEXPR
  });

  test('multiple params', () => {
    const tokens = tokenize('{{helper (add a b c)}}');
  });
});
```

**Deliverable:** Updated lexer with OPEN_SEXPR/CLOSE_SEXPR token support (likely already exists from Capability 1)

---

### Task C6-F1-T2: Implement SubExpression Parser

**Status:** `[ ]` Not Started

**Goal:** Build SubExpression nodes in parser when encountering `OPEN_SEXPR`

**Requirements:**

- Add `parseSubExpression()` method to parser
- Called when `OPEN_SEXPR` token is encountered during expression parsing
- Parse helper name as PathExpression
- Parse arguments recursively (can be literals, paths, or nested subexpressions)
- Parse hash parameters (structure only, not evaluated in V1)
- Expect `CLOSE_SEXPR` token at end
- Return SubExpression node

**Parser flow:**

1. Encounter `OPEN_SEXPR` token
2. Parse path for helper name
3. Parse params until `CLOSE_SEXPR`:
   - Literals (STRING, NUMBER, BOOLEAN, etc.)
   - PathExpressions
   - Nested SubExpressions (recursive call)
4. Parse hash if present (key=value pairs)
5. Consume `CLOSE_SEXPR` token
6. Return SubExpression node

**Test cases:**

```typescript
describe('SubExpression Parsing', () => {
  test('simple subexpression with 2 params', () => {
    const ast = parse('{{#if (gt score 80)}}A{{/if}}');
    // BlockStatement.params[0] should be SubExpression
    // SubExpression.path.parts = ['gt']
    // SubExpression.params = [PathExpression('score'), NumberLiteral(80)]
  });

  test('nested subexpressions', () => {
    const ast = parse('{{#if (and (gt x 5) (lt x 10))}}yes{{/if}}');
    // SubExpression.params contains 2 SubExpression nodes
  });

  test('subexpression with string literal', () => {
    const ast = parse('{{#if (eq status "active")}}yes{{/if}}');
    // SubExpression.params = [PathExpression('status'), StringLiteral('active')]
  });

  test('multiple params', () => {
    const ast = parse('{{helper (add a b c)}}');
    // SubExpression.params has 3 PathExpression nodes
  });

  test('unclosed subexpression throws error', () => {
    expect(() => parse('{{#if (gt x 1}}yes{{/if}}')).toThrow();
  });
});
```

**Deliverable:** `parseSubExpression()` method in `src/parser/parser.ts`

---

### Task C6-F1-T3: Extend Expression Parsing

**Status:** `[ ]` Not Started

**Goal:** Update `parseExpression()` to handle SubExpression nodes as valid expressions

**Requirements:**

- When parsing params for MustacheStatement or BlockStatement
- If next token is `OPEN_SEXPR`, call `parseSubExpression()`
- SubExpressions can appear anywhere an Expression is expected
- Maintain proper precedence and nesting

**Test cases:**

```typescript
describe('Expression Parsing with SubExpressions', () => {
  test('subexpression as mustache param', () => {
    const ast = parse('{{helper (gt x 1)}}');
    // MustacheStatement.params[0] is SubExpression
  });

  test('subexpression as block param', () => {
    const ast = parse('{{#if (not isDisabled)}}yes{{/if}}');
    // BlockStatement.params[0] is SubExpression
  });

  test('mixed params with subexpressions', () => {
    const ast = parse('{{helper name (gt age 18) "literal"}}');
    // params = [PathExpression, SubExpression, StringLiteral]
  });
});
```

**Deliverable:** Updated `parseExpression()` in `src/parser/parser.ts`

---

## Feature 6.2: SubExpression Evaluation

**Goal:** Recursively evaluate subexpressions by calling helpers with evaluated arguments

**Status:** `[ ]` Not Started

**Estimated LOC:** ~40 lines (evaluateSubExpression method with recursive logic)

### Task C6-F2-T1: Implement evaluateSubExpression()

**Status:** `[ ]` Not Started

**Goal:** Add method to evaluate SubExpression nodes

**Requirements:**

- Signature: `evaluateSubExpression(node: SubExpression): any`
- Resolve helper name from `node.path`
- Evaluate all `node.params` recursively:
  - Literals return their value
  - PathExpressions resolve via `evaluatePath()`
  - Nested SubExpressions call `evaluateSubExpression()` recursively
- Look up helper in helper registry (built-in + runtime helpers)
- Throw error if helper not found
- Call helper function with evaluated params
- Return helper result

**Helper lookup order:**

1. Check runtime helpers (passed via options)
2. Check built-in helpers
3. If not found, throw error

**Test cases:**

```typescript
describe('SubExpression Evaluation', () => {
  test('simple comparison', () => {
    const result = evaluate('{{#if (gt score 80)}}yes{{/if}}', { score: 85 });
    expect(result).toBe('yes');
  });

  test('nested subexpressions', () => {
    const result = evaluate('{{#if (and (gt x 5) (lt x 10))}}yes{{/if}}', { x: 7 });
    expect(result).toBe('yes');
  });

  test('subexpression with string literal', () => {
    const result = evaluate('{{#if (eq status "active")}}yes{{/if}}', { status: 'active' });
    expect(result).toBe('yes');
  });

  test('unknown helper throws error', () => {
    expect(() => evaluate('{{#if (unknown x)}}yes{{/if}}', { x: 1 })).toThrow(/unknown helper/i);
  });

  test('deeply nested subexpressions', () => {
    const result = evaluate('{{#if (or (and a b) (and c d))}}yes{{/if}}', {
      a: true,
      b: false,
      c: true,
      d: true,
    });
    expect(result).toBe('yes'); // (false || true) = true
  });
});
```

**Deliverable:** `evaluateSubExpression()` method in `src/interpreter/interpreter.ts`

---

## Feature 6.3: Built-in Comparison Helpers

**Goal:** Implement standard comparison and logical helpers for use in conditionals

**Status:** `[ ]` Not Started

**Estimated LOC:** ~60 lines (comparison.ts ~25, logical.ts ~25, index.ts ~10)

### Background

Handlebars provides built-in helpers for comparisons that are commonly used with `#if`:

**Comparison helpers:**

- `eq(a, b)` - Strict equality (`a === b`)
- `ne(a, b)` - Not equal (`a !== b`)
- `lt(a, b)` - Less than (`a < b`)
- `lte(a, b)` - Less than or equal (`a <= b`)
- `gt(a, b)` - Greater than (`a > b`)
- `gte(a, b)` - Greater than or equal (`a >= b`)

**Logical helpers:**

- `and(...args)` - All arguments are truthy
- `or(...args)` - At least one argument is truthy
- `not(value)` - Negates value

### Task C6-F3-T1: Implement Comparison Helpers

**Status:** `[ ]` Not Started

**Requirements:**

- Create `src/helpers/comparison.ts`
- Each helper is a function: `(a: any, b?: any) => boolean`
- Use JavaScript comparison operators
- Return boolean values
- Handle any value types gracefully

**Implementation:**

```typescript
// src/helpers/comparison.ts
export const eq = (a: any, b: any): boolean => a === b;
export const ne = (a: any, b: any): boolean => a !== b;
export const lt = (a: any, b: any): boolean => a < b;
export const lte = (a: any, b: any): boolean => a <= b;
export const gt = (a: any, b: any): boolean => a > b;
export const gte = (a: any, b: any): boolean => a >= b;
```

**Test cases:**

```typescript
describe('Comparison Helpers', () => {
  describe('eq', () => {
    test('equal numbers', () => expect(eq(5, 5)).toBe(true));
    test('unequal numbers', () => expect(eq(5, 3)).toBe(false));
    test('equal strings', () => expect(eq('foo', 'foo')).toBe(true));
    test('different types', () => expect(eq(5, '5')).toBe(false));
  });

  describe('ne', () => {
    test('unequal values', () => expect(ne(5, 3)).toBe(true));
    test('equal values', () => expect(ne(5, 5)).toBe(false));
  });

  describe('gt/gte/lt/lte', () => {
    test('gt', () => {
      expect(gt(10, 5)).toBe(true);
      expect(gt(5, 10)).toBe(false);
      expect(gt(5, 5)).toBe(false);
    });

    test('gte', () => {
      expect(gte(10, 5)).toBe(true);
      expect(gte(5, 5)).toBe(true);
      expect(gte(3, 5)).toBe(false);
    });

    test('lt', () => {
      expect(lt(5, 10)).toBe(true);
      expect(lt(10, 5)).toBe(false);
    });

    test('lte', () => {
      expect(lte(5, 10)).toBe(true);
      expect(lte(5, 5)).toBe(true);
      expect(lte(10, 5)).toBe(false);
    });
  });
});
```

**Deliverable:** `src/helpers/comparison.ts` with all comparison helpers

---

### Task C6-F3-T2: Implement Logical Helpers

**Status:** `[ ]` Not Started

**Requirements:**

- Create logical helpers: `and`, `or`, `not`
- Use Handlebars truthiness via `isEmpty()` utility
- `and(...args)` - Return true if all args are truthy
- `or(...args)` - Return true if any arg is truthy
- `not(value)` - Return true if value is falsy

**Implementation:**

```typescript
// src/helpers/logical.ts
import { isEmpty } from '../runtime/utils.js';

export const and = (...args: any[]): boolean => {
  for (const arg of args) {
    if (isEmpty(arg)) return false;
  }
  return true;
};

export const or = (...args: any[]): boolean => {
  for (const arg of args) {
    if (!isEmpty(arg)) return true;
  }
  return false;
};

export const not = (value: any): boolean => {
  return isEmpty(value);
};
```

**Test cases:**

```typescript
describe('Logical Helpers', () => {
  describe('and', () => {
    test('all truthy', () => expect(and(true, 1, 'yes', {})).toBe(true));
    test('one falsy', () => expect(and(true, false, true)).toBe(false));
    test('empty array is falsy', () => expect(and(true, [])).toBe(false));
    test('zero is truthy', () => expect(and(true, 0)).toBe(true));
    test('empty object is truthy', () => expect(and(true, {})).toBe(true));
  });

  describe('or', () => {
    test('all falsy', () => expect(or(false, null, undefined, '')).toBe(false));
    test('one truthy', () => expect(or(false, 0, false)).toBe(true));
    test('first truthy', () => expect(or(true, false)).toBe(true));
  });

  describe('not', () => {
    test('falsy values', () => {
      expect(not(false)).toBe(true);
      expect(not(null)).toBe(true);
      expect(not(undefined)).toBe(true);
      expect(not('')).toBe(true);
      expect(not([])).toBe(true);
    });

    test('truthy values', () => {
      expect(not(true)).toBe(false);
      expect(not(1)).toBe(false);
      expect(not('yes')).toBe(false);
      expect(not(0)).toBe(false); // 0 is truthy in Handlebars
      expect(not({})).toBe(false);
    });
  });
});
```

**Deliverable:** `src/helpers/logical.ts` with all logical helpers

---

### Task C6-F3-T3: Register Built-in Helpers

**Status:** `[ ]` Not Started

**Requirements:**

- Create `src/helpers/index.ts` to export all built-in helpers
- Create registry object with all comparison and logical helpers
- Ensure helpers are available in interpreter by default

**Implementation:**

```typescript
// src/helpers/index.ts
import * as comparison from './comparison.js';
import * as logical from './logical.js';

export const builtInHelpers = {
  // Comparison
  eq: comparison.eq,
  ne: comparison.ne,
  lt: comparison.lt,
  lte: comparison.lte,
  gt: comparison.gt,
  gte: comparison.gte,

  // Logical
  and: logical.and,
  or: logical.or,
  not: logical.not,
};

export type Helper = (...args: any[]) => any;
export type HelperRegistry = Record<string, Helper>;
```

**Test cases:**

```typescript
describe('Built-in Helper Registry', () => {
  test('exports all helpers', () => {
    expect(builtInHelpers).toHaveProperty('eq');
    expect(builtInHelpers).toHaveProperty('ne');
    expect(builtInHelpers).toHaveProperty('gt');
    expect(builtInHelpers).toHaveProperty('gte');
    expect(builtInHelpers).toHaveProperty('lt');
    expect(builtInHelpers).toHaveProperty('lte');
    expect(builtInHelpers).toHaveProperty('and');
    expect(builtInHelpers).toHaveProperty('or');
    expect(builtInHelpers).toHaveProperty('not');
  });

  test('all helpers are functions', () => {
    Object.values(builtInHelpers).forEach((helper) => {
      expect(typeof helper).toBe('function');
    });
  });
});
```

**Deliverable:** `src/helpers/index.ts` with complete helper registry

---

## Feature 6.4: Runtime Helper Registry

**Goal:** Accept user-provided helpers at render time and merge with built-in helpers

**Status:** `[ ]` Not Started

**Estimated LOC:** ~50 lines (API updates ~15, helper lookup ~10, context binding ~25)

### Task C6-F4-T1: Add Helpers Option to API

**Status:** `[ ]` Not Started

**Requirements:**

- Extend `render()` and `compile().render()` options to accept `helpers`
- Merge user helpers with built-in helpers
- User helpers override built-ins (merge order: built-ins first, then user)
- Store merged helpers in interpreter instance

**API changes:**

```typescript
// src/index.ts
interface RenderOptions {
  helpers?: Record<string, Helper>;
}

async function render(template: string, context: any, options?: RenderOptions): Promise<string>;

interface CompiledTemplate {
  render(context: any, options?: RenderOptions): Promise<string>;
}
```

**Implementation:**

```typescript
// In interpreter constructor or initialization
constructor(helpers?: HelperRegistry) {
  this.helpers = {
    ...builtInHelpers,
    ...helpers,
  };
}
```

**Test cases:**

```typescript
describe('Runtime Helper Registry', () => {
  test('custom helper', async () => {
    const result = await render(
      '{{uppercase name}}',
      { name: 'alice' },
      { helpers: { uppercase: (str: string) => str.toUpperCase() } },
    );
    expect(result).toBe('ALICE');
  });

  test('helper with multiple args', async () => {
    const result = await render(
      '{{add a b}}',
      { a: 5, b: 3 },
      { helpers: { add: (a: number, b: number) => a + b } },
    );
    expect(result).toBe('8');
  });

  test('helper accessing context', async () => {
    const result = await render(
      '{{double}}',
      { value: 5 },
      {
        helpers: {
          double: function (this: any) {
            return this.value * 2;
          },
        },
      },
    );
    expect(result).toBe('10');
  });

  test('user helper overrides built-in', async () => {
    const result = await render(
      '{{#if (eq a b)}}yes{{else}}no{{/if}}',
      { a: 5, b: 3 },
      {
        helpers: {
          eq: () => true, // Always true
        },
      },
    );
    expect(result).toBe('yes'); // Override makes it always true
  });

  test('built-in helpers work without options', async () => {
    const result = await render('{{#if (gt score 80)}}yes{{/if}}', { score: 90 });
    expect(result).toBe('yes');
  });
});
```

**Deliverable:** Updated `src/index.ts` and interpreter to accept helpers option

---

### Task C6-F4-T2: Implement Helper Lookup

**Status:** `[ ]` Not Started

**Requirements:**

- Add `lookupHelper(name: string)` method to interpreter
- Check if helper exists in merged registry
- Return helper function or undefined
- Used by `evaluateSubExpression()` and helper detection

**Implementation:**

```typescript
// In interpreter
private lookupHelper(name: string): Helper | undefined {
  return this.helpers[name];
}
```

**Test cases:**

```typescript
describe('Helper Lookup', () => {
  test('finds built-in helper', () => {
    const interpreter = new Interpreter();
    const helper = interpreter.lookupHelper('eq');
    expect(helper).toBeDefined();
    expect(typeof helper).toBe('function');
  });

  test('finds user helper', () => {
    const interpreter = new Interpreter({ custom: () => 'test' });
    const helper = interpreter.lookupHelper('custom');
    expect(helper).toBeDefined();
  });

  test('returns undefined for unknown helper', () => {
    const interpreter = new Interpreter();
    const helper = interpreter.lookupHelper('unknown');
    expect(helper).toBeUndefined();
  });
});
```

**Deliverable:** `lookupHelper()` method in interpreter

---

### Task C6-F4-T3: Call Helpers with Context Binding

**Status:** `[ ]` Not Started

**Requirements:**

- When calling helper, bind current context as `this`
- Pass evaluated params as arguments
- Return helper result
- Handle any return type

**Implementation:**

```typescript
// In evaluateSubExpression or evaluateMustache
const helper = this.lookupHelper(helperName);
if (!helper) {
  throw new Error(`Unknown helper: ${helperName}`);
}

// Evaluate all params
const args = params.map((param) => this.evaluateExpression(param));

// Call with context binding
const context = this.contextStack[this.contextStack.length - 1];
const result = helper.call(context, ...args);
```

**Test cases:**

```typescript
describe('Helper Context Binding', () => {
  test('helper receives context as this', async () => {
    let receivedContext: any;
    const result = await render(
      '{{check}}',
      { name: 'Alice' },
      {
        helpers: {
          check: function (this: any) {
            receivedContext = this;
            return 'ok';
          },
        },
      },
    );
    expect(receivedContext).toEqual({ name: 'Alice' });
  });

  test('helper with args', async () => {
    const result = await render(
      '{{formatName first last}}',
      { first: 'John', last: 'Doe' },
      {
        helpers: {
          formatName: (first: string, last: string) => `${last}, ${first}`,
        },
      },
    );
    expect(result).toBe('Doe, John');
  });
});
```

**Deliverable:** Updated helper invocation in interpreter

---

## Feature 6.5: Helper Detection

**Goal:** Distinguish between variable lookups and helper calls during evaluation

**Status:** `[ ]` Not Started

**Estimated LOC:** ~60 lines (isHelperCall ~20, isScopedPath ~10, evaluation integration ~30)

### Background

Handlebars uses specific rules to determine if a name refers to a helper or a variable:

1. If the statement has params → always a helper call
2. If no params but name exists in helper registry → helper call
3. If scoped path (starts with `./` or `this.`) → always variable lookup
4. Otherwise → variable lookup

### Task C6-F5-T1: Implement isHelperCall()

**Status:** `[ ]` Not Started

**Requirements:**

- Add `isHelperCall(node: MustacheStatement | BlockStatement)` method
- Check if node has params (length > 0) → always helper
- Check if path is scoped (depth=0 and starts with `./` or `this`) → never helper
- Check if helper exists in registry → helper if found
- Otherwise → not a helper (variable lookup)

**Implementation:**

```typescript
// In interpreter
private isHelperCall(node: MustacheStatement | BlockStatement): boolean {
  // Has params? Always a helper
  if (node.params.length > 0) {
    return true;
  }

  const path = node.path;

  // Scoped path? Never a helper
  if (this.isScopedPath(path)) {
    return false;
  }

  // Check if helper exists
  const helperName = path.parts[0];
  return this.lookupHelper(helperName) !== undefined;
}

private isScopedPath(path: PathExpression): boolean {
  // Path starting with ./ or this. is scoped
  return path.original.startsWith('./') || path.original.startsWith('this.');
}
```

**Test cases:**

```typescript
describe('Helper Detection', () => {
  test('statement with params is helper', async () => {
    const result = await render(
      '{{uppercase name}}',
      { name: 'alice', uppercase: 'should-not-use-this' },
      { helpers: { uppercase: (str: string) => str.toUpperCase() } },
    );
    expect(result).toBe('ALICE'); // Calls helper, not variable
  });

  test('no params but helper exists', async () => {
    const result = await render(
      '{{timestamp}}',
      { timestamp: 'variable-value' },
      { helpers: { timestamp: () => '2024-01-01' } },
    );
    expect(result).toBe('2024-01-01'); // Calls helper
  });

  test('no params and no helper', async () => {
    const result = await render('{{name}}', { name: 'Alice' });
    expect(result).toBe('Alice'); // Variable lookup
  });

  test('scoped path always variable', async () => {
    const result = await render(
      '{{./uppercase}}',
      { uppercase: 'variable-value' },
      { helpers: { uppercase: () => 'helper-value' } },
    );
    expect(result).toBe('variable-value'); // Variable, not helper
  });

  test('this.property always variable', async () => {
    const result = await render(
      '{{this.helper}}',
      { helper: 'variable' },
      { helpers: { helper: () => 'function' } },
    );
    expect(result).toBe('variable');
  });
});
```

**Deliverable:** `isHelperCall()` and `isScopedPath()` methods in interpreter

---

### Task C6-F5-T2: Integrate Helper Detection in Evaluation

**Status:** `[ ]` Not Started

**Requirements:**

- Update `evaluateMustache()` to check `isHelperCall()`
- If helper call: evaluate as subexpression (call helper with args)
- If not helper call: evaluate as path expression (variable lookup)
- Same logic for BlockStatement evaluation

**Implementation:**

```typescript
// In evaluateMustache
private evaluateMustache(node: MustacheStatement): string {
  let value: any;

  if (this.isHelperCall(node)) {
    // Call helper
    const helperName = node.path.parts[0];
    const helper = this.lookupHelper(helperName);
    if (!helper) {
      throw new Error(`Unknown helper: ${helperName}`);
    }
    const args = node.params.map(p => this.evaluateExpression(p));
    const context = this.contextStack[this.contextStack.length - 1];
    value = helper.call(context, ...args);
  } else {
    // Variable lookup
    value = this.evaluatePath(node.path);
  }

  // Convert to string and escape
  // ... rest of mustache evaluation
}
```

**Test cases:**

```typescript
describe('Helper vs Variable Evaluation', () => {
  test('calls helper when appropriate', async () => {
    const result = await render(
      '{{upper text}}',
      { text: 'hello' },
      { helpers: { upper: (s: string) => s.toUpperCase() } },
    );
    expect(result).toBe('HELLO');
  });

  test('looks up variable when appropriate', async () => {
    const result = await render('{{text}}', { text: 'hello' });
    expect(result).toBe('hello');
  });

  test('ambiguous name prefers helper', async () => {
    const result = await render(
      '{{value}}',
      { value: 'from-context' },
      { helpers: { value: () => 'from-helper' } },
    );
    expect(result).toBe('from-helper'); // Helper takes precedence
  });

  test('scoped path uses variable', async () => {
    const result = await render(
      '{{./value}}',
      { value: 'from-context' },
      { helpers: { value: () => 'from-helper' } },
    );
    expect(result).toBe('from-context'); // Scoped forces variable
  });
});
```

**Deliverable:** Updated `evaluateMustache()` and `evaluateBlock()` with helper detection

---

## Integration Tests

**Goal:** End-to-end tests combining all Feature 6 capabilities

**Status:** `[ ]` Not Started

```typescript
describe('Capability 6: Helpers & Subexpressions Integration', () => {
  test('complex conditional with nested subexpressions', async () => {
    const result = await render(
      '{{#if (and (gte score 70) (or isPremium isAdmin))}}Access Granted{{else}}Access Denied{{/if}}',
      { score: 85, isPremium: false, isAdmin: true },
    );
    expect(result).toBe('Access Granted');
  });

  test('comparison helpers in templates', async () => {
    const template = `
      {{#if (eq grade "A")}}Excellent{{/if}}
      {{#if (gt score 90)}}Outstanding{{/if}}
      {{#if (lt score 60)}}Needs Improvement{{/if}}
    `;
    const result = await render(template, { grade: 'A', score: 95 });
    expect(result).toContain('Excellent');
    expect(result).toContain('Outstanding');
    expect(result).not.toContain('Needs Improvement');
  });

  test('custom helpers with subexpressions', async () => {
    const result = await render(
      '{{#if (includes tags "featured")}}Featured Item{{/if}}',
      { tags: ['new', 'featured', 'sale'] },
      {
        helpers: {
          includes: (arr: any[], val: any) => arr.includes(val),
        },
      },
    );
    expect(result).toBe('Featured Item');
  });

  test('helper returning object accessed via path', async () => {
    const result = await render(
      '{{#with (getUser userId)}}Hello {{name}}{{/with}}',
      { userId: 123 },
      {
        helpers: {
          getUser: (id: number) => ({ id, name: 'Alice' }),
        },
      },
    );
    expect(result).toBe('Hello Alice');
  });

  test('chained logical operations', async () => {
    const result = await render('{{#if (or (and isActive isPaid) (eq role "admin"))}}Show{{/if}}', {
      isActive: true,
      isPaid: false,
      role: 'user',
    });
    expect(result).toBe(''); // (true && false) || false = false
  });

  test('comparison with different types', async () => {
    const result = await render('{{#if (eq count "5")}}Match{{else}}No Match{{/if}}', { count: 5 });
    expect(result).toBe('No Match'); // 5 !== "5" (strict equality)
  });

  test('nested each with comparison helpers', async () => {
    const template = `
      {{#each users}}
        {{#if (gte age 18)}}
          {{name}} is an adult
        {{/if}}
      {{/each}}
    `;
    const result = await render(template, {
      users: [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 17 },
        { name: 'Charlie', age: 30 },
      ],
    });
    expect(result).toContain('Alice is an adult');
    expect(result).not.toContain('Bob is an adult');
    expect(result).toContain('Charlie is an adult');
  });
});
```

---

## Summary

**Capability 6 delivers:**

✅ SubExpression parsing and AST representation
✅ Recursive evaluation of nested helper calls
✅ 9 built-in helpers: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not`
✅ Runtime helper registry with user-provided helpers
✅ Smart helper vs variable detection
✅ Context binding for helper invocation
✅ Full integration with existing block helpers

**After Capability 6:**

- Templates can use complex conditional logic
- Custom helpers enable domain-specific functionality
- All Handlebars comparison patterns are supported
- Ready for Capability 7: Output Generation (interpreter main loop)
