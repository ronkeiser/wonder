# @wonder/expressions

Pure expression evaluation for JSON data transformation. Safe for Cloudflare Workers.

## Purpose

Evaluate expressions against JSON data to produce transformed values. Used by `update_context` actions to compute derived values that output mapping alone cannot express (e.g., array concatenation, arithmetic, conditionals).

**Key constraint:** No `eval()` or `new Function()` - must work in Cloudflare Workers.

## Relationship to @wonder/templates

| Package               | Purpose                        | Input                | Output   |
| --------------------- | ------------------------------ | -------------------- | -------- |
| `@wonder/templates`   | String templating (Handlebars) | Template + context   | `string` |
| `@wonder/expressions` | Value transformation           | Expression + context | `any`    |

Both packages may share runtime utilities (secure property access, path resolution).

---

## API

### Core Functions

```typescript
import { evaluate, compile } from '@wonder/expressions';

// One-shot evaluation
const result = evaluate('[...inherited, word]', {
  inherited: ['alpha', 'beta'],
  word: 'gamma',
});
// => ['alpha', 'beta', 'gamma']

// Compiled for reuse (avoids re-parsing)
const expr = compile('[...inherited, word]');
const result1 = expr.evaluate({ inherited: ['a'], word: 'b' }); // => ['a', 'b']
const result2 = expr.evaluate({ inherited: ['x'], word: 'y' }); // => ['x', 'y']
```

### Type Definitions

```typescript
interface CompiledExpression {
  evaluate(context: Record<string, unknown>): unknown;
}

function evaluate(expression: string, context: Record<string, unknown>): unknown;
function compile(expression: string): CompiledExpression;
```

---

## Syntax

A safe subset of JavaScript expression syntax. Familiar to developers, no learning curve.

### Property Access

```javascript
user.name; // dot notation
items[0]; // bracket notation (index)
data['key']; // bracket notation (string)
nested.array[0].id; // chained access
```

### Literals

```javascript
// Strings
'hello'
"world"

// Numbers
42
3.14
-17

// Booleans
true
false

// Null
null

// Arrays
[1, 2, 3]
['a', 'b', 'c']
[item1, item2]

// Objects
{ key: 'value' }
{ count: items.length, name: user.name }
```

### Spread Operators

```javascript
// Array spread
[...array1, ...array2]
[...existing, newItem]
[first, ...rest]

// Object spread
{ ...defaults, ...overrides }
{ ...user, role: 'admin' }
```

### Arithmetic

```javascript
a + b;
count * 2;
total / items.length;
(remainder % 10) - value;
```

### Comparison

```javascript
a === b;
a !== b;
count > 0;
count >= min;
count < max;
count <= limit;
```

### Logical

```javascript
a && b;
a || defaultValue;
!isEmpty;
condition && value;
condition || fallback;
```

### Ternary

```javascript
count > 0 ? items : [];
status === 'active' ? user.name : 'Unknown';
```

### Function Calls

Built-in functions only (not methods on values):

```javascript
length(items);
append(array, item);
concat(array1, array2);
sum(numbers);
keys(object);
```

---

## Built-in Functions

### Array Functions

| Function                    | Description                      | Example                             |
| --------------------------- | -------------------------------- | ----------------------------------- |
| `length(array)`             | Array length                     | `length(items)` → `3`               |
| `append(array, item)`       | Return new array with item added | `append([1,2], 3)` → `[1,2,3]`      |
| `concat(a, b, ...)`         | Concatenate arrays               | `concat([1], [2], [3])` → `[1,2,3]` |
| `first(array)`              | First element                    | `first([1,2,3])` → `1`              |
| `last(array)`               | Last element                     | `last([1,2,3])` → `3`               |
| `slice(array, start, end?)` | Slice array                      | `slice([1,2,3,4], 1, 3)` → `[2,3]`  |
| `includes(array, item)`     | Check membership                 | `includes([1,2,3], 2)` → `true`     |
| `unique(array)`             | Remove duplicates                | `unique([1,1,2,2])` → `[1,2]`       |
| `flatten(array)`            | Flatten nested arrays            | `flatten([[1,2],[3]])` → `[1,2,3]`  |
| `sort(array)`               | Sort (natural order)             | `sort([3,1,2])` → `[1,2,3]`         |
| `reverse(array)`            | Reverse array                    | `reverse([1,2,3])` → `[3,2,1]`      |
| `map(array, expr)`          | Transform elements               | `map(items, 'item.name')`           |
| `filter(array, expr)`       | Filter elements                  | `filter(items, 'item.active')`      |
| `find(array, expr)`         | Find first match                 | `find(items, 'item.id === 5')`      |
| `every(array, expr)`        | All match predicate              | `every(items, 'item.valid')`        |
| `some(array, expr)`         | Any match predicate              | `some(items, 'item.error')`         |

### Object Functions

| Function                      | Description      | Example                             |
| ----------------------------- | ---------------- | ----------------------------------- |
| `keys(object)`                | Object keys      | `keys({a:1, b:2})` → `['a','b']`    |
| `values(object)`              | Object values    | `values({a:1, b:2})` → `[1,2]`      |
| `entries(object)`             | Key-value pairs  | `entries({a:1})` → `[['a',1]]`      |
| `merge(a, b, ...)`            | Shallow merge    | `merge({a:1}, {b:2})` → `{a:1,b:2}` |
| `pick(object, keys)`          | Select keys      | `pick({a:1,b:2}, ['a'])` → `{a:1}`  |
| `omit(object, keys)`          | Exclude keys     | `omit({a:1,b:2}, ['a'])` → `{b:2}`  |
| `get(object, path, default?)` | Safe deep access | `get(user, 'address.city', 'N/A')`  |
| `has(object, key)`            | Check key exists | `has(user, 'email')` → `true`       |

### Math Functions

| Function              | Description    | Example                    |
| --------------------- | -------------- | -------------------------- |
| `sum(numbers)`        | Sum array      | `sum([1,2,3])` → `6`       |
| `avg(numbers)`        | Average        | `avg([1,2,3])` → `2`       |
| `min(numbers)`        | Minimum        | `min([1,2,3])` → `1`       |
| `max(numbers)`        | Maximum        | `max([1,2,3])` → `3`       |
| `round(n, decimals?)` | Round          | `round(3.456, 2)` → `3.46` |
| `floor(n)`            | Floor          | `floor(3.7)` → `3`         |
| `ceil(n)`             | Ceiling        | `ceil(3.2)` → `4`          |
| `abs(n)`              | Absolute value | `abs(-5)` → `5`            |

### String Functions

| Function                      | Description     | Example                                     |
| ----------------------------- | --------------- | ------------------------------------------- |
| `upper(str)`                  | Uppercase       | `upper('hello')` → `'HELLO'`                |
| `lower(str)`                  | Lowercase       | `lower('HELLO')` → `'hello'`                |
| `trim(str)`                   | Trim whitespace | `trim('  hi  ')` → `'hi'`                   |
| `split(str, delim)`           | Split string    | `split('a,b,c', ',')` → `['a','b','c']`     |
| `join(array, delim)`          | Join array      | `join(['a','b'], ',')` → `'a,b'`            |
| `startsWith(str, prefix)`     | Check prefix    | `startsWith('hello', 'he')` → `true`        |
| `endsWith(str, suffix)`       | Check suffix    | `endsWith('hello', 'lo')` → `true`          |
| `replace(str, find, repl)`    | Replace first   | `replace('hello', 'l', 'L')` → `'heLlo'`    |
| `replaceAll(str, find, repl)` | Replace all     | `replaceAll('hello', 'l', 'L')` → `'heLLo'` |
| `substring(str, start, end?)` | Substring       | `substring('hello', 1, 3)` → `'el'`         |

### Type Functions

| Function         | Description                 | Example                    |
| ---------------- | --------------------------- | -------------------------- |
| `isArray(val)`   | Is array                    | `isArray([1,2])` → `true`  |
| `isObject(val)`  | Is plain object             | `isObject({a:1})` → `true` |
| `isString(val)`  | Is string                   | `isString('hi')` → `true`  |
| `isNumber(val)`  | Is number                   | `isNumber(42)` → `true`    |
| `isBoolean(val)` | Is boolean                  | `isBoolean(true)` → `true` |
| `isNull(val)`    | Is null                     | `isNull(null)` → `true`    |
| `isDefined(val)` | Not null/undefined          | `isDefined(0)` → `true`    |
| `isEmpty(val)`   | Null, undefined, '', [], {} | `isEmpty([])` → `true`     |
| `type(val)`      | Type name                   | `type([])` → `'array'`     |

---

## Security

### Allowed

- Property access (dot, bracket)
- Literals (string, number, boolean, null, array, object)
- Spread operators
- Arithmetic operators
- Comparison operators
- Logical operators
- Ternary operator
- Built-in function calls

### Forbidden

| Construct                      | Reason                   |
| ------------------------------ | ------------------------ |
| Function definitions           | No arbitrary code        |
| Assignment (`=`, `+=`, etc.)   | Expressions are pure     |
| Loops (`for`, `while`)         | No unbounded computation |
| `this` keyword                 | No context manipulation  |
| `new` keyword                  | No object construction   |
| Method calls (`arr.push()`)    | Only built-in functions  |
| Property mutation              | Expressions are pure     |
| Prototype access (`__proto__`) | Security                 |
| `eval`, `Function`             | Security                 |
| `import`, `require`            | Security                 |

### Implementation Notes

- All property access goes through secure lookup (no prototype traversal)
- Object/array operations return new instances (immutable)
- Recursion depth limited to prevent stack overflow
- Expression length limited to prevent DoS

---

## Architecture

```
@wonder/expressions/
├── src/
│   ├── index.ts              # Public API (evaluate, compile)
│   ├── lexer/
│   │   ├── lexer.ts          # Tokenize expression string
│   │   └── tokens.ts         # Token type definitions
│   ├── parser/
│   │   ├── parser.ts         # Parse tokens to AST
│   │   └── ast.ts            # AST node definitions
│   ├── interpreter/
│   │   ├── interpreter.ts    # Evaluate AST against context
│   │   └── operators.ts      # Operator implementations
│   ├── functions/
│   │   ├── index.ts          # Function registry
│   │   ├── array.ts          # Array functions
│   │   ├── object.ts         # Object functions
│   │   ├── math.ts           # Math functions
│   │   ├── string.ts         # String functions
│   │   └── type.ts           # Type functions
│   └── runtime/
│       └── utils.ts          # Secure property access
├── test/
│   ├── lexer.test.ts
│   ├── parser.test.ts
│   ├── interpreter.test.ts
│   ├── functions/
│   │   ├── array.test.ts
│   │   ├── object.test.ts
│   │   ├── math.test.ts
│   │   └── string.test.ts
│   └── security.test.ts
└── package.json
```

---

## Integration

### With `update_context` Action

```typescript
// In executor's action handler
import { evaluate } from '@wonder/expressions';

case 'update_context': {
  const impl = action.implementation as {
    expressions: Record<string, string>;
  };

  const output: Record<string, unknown> = {};

  for (const [field, expr] of Object.entries(impl.expressions)) {
    output[field] = evaluate(expr, input);
  }

  return { success: true, output, metrics: { duration_ms: 0 } };
}
```

### Action Definition

```typescript
const accumulateAction = action({
  name: 'Accumulate Items',
  kind: 'update_context',
  implementation: {
    expressions: {
      all_items: '[...inherited_items, new_item]',
      total_count: 'length(inherited_items) + 1',
      summary: '{ items: [...inherited_items, new_item], count: length(inherited_items) + 1 }',
    },
  },
});
```

### Example: Foundation Test 04

Proving values accumulate through a workflow:

```typescript
// Phase 2 action - each branch adds its word to inherited array
const phase2Action = action({
  name: 'Accumulate Words',
  kind: 'update_context',
  implementation: {
    expressions: {
      accumulated_words: '[...inherited_words, word]',
    },
  },
});

// Input (from bridge, which got it from phase1 fan-in):
// { inherited_words: ['alpha', 'beta', 'gamma'], word: 'delta' }

// Output:
// { accumulated_words: ['alpha', 'beta', 'gamma', 'delta'] }
```

This proves:

1. Phase 2 received the aggregated phase 1 results
2. Phase 2 added to them (array grew from 3 to 4 items)
3. The original values are preserved in the output

---

## Error Handling

```typescript
interface ExpressionError {
  message: string;
  position?: {
    line: number;
    column: number;
    offset: number;
  };
  expression: string;
}

// Errors thrown by evaluate/compile:
// - SyntaxError: Invalid expression syntax
// - ReferenceError: Unknown identifier or function
// - TypeError: Invalid operation (e.g., spread on non-array)
// - RangeError: Recursion limit exceeded
```

---

## Future Considerations

### Custom Functions

Allow workflows to register custom functions:

```typescript
const expr = compile('[...items, transform(newItem)]', {
  functions: {
    transform: (item) => ({ ...item, processed: true }),
  },
});
```

### Pipe Operator

More readable chaining:

```typescript
// Instead of
concat(filter(items, 'item.active'), newItems);

// Allow
items | filter('item.active') | concat(newItems);
```

### Type Inference

For workflow validation, infer output types from expressions:

```typescript
const schema = inferType('[...items, newItem]', {
  items: { type: 'array', items: { type: 'string' } },
  newItem: { type: 'string' },
});
// => { type: 'array', items: { type: 'string' } }
```
