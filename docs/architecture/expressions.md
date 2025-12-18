# Coordinator Integration with @wonder/expressions

## Overview

Replace structured condition evaluators in coordinator with @wonder/expressions for unified expression handling across Wonder.

**Current state:** Hand-coded evaluators for structured JSON conditions  
**Target state:** Single expression system for conditions, transformations, and computed values

## Motivation

### Problems with Current Architecture

1. **Duplication:** Two expression evaluation systems doing the same thing
   - `routing.ts`: 150+ lines of hand-coded condition evaluators
   - `@wonder/expressions`: Full JavaScript expression parser
   
2. **Limited Capability:** Structured conditions hit artificial limits
   ```typescript
   // Can't express this with structured conditions:
   "state.approvals.filter(a => a.score >= 4).length >= 3"
   
   // CEL fallback throws "not yet supported"
   ```

3. **Developer Experience:** Verbose JSON vs. familiar expressions
   ```typescript
   // Current
   { type: 'comparison', left: { field: 'state.score' }, operator: '>=', right: { literal: 80 }}
   
   // Proposed
   "state.score >= 80"
   ```

4. **Maintenance Burden:** Two test suites, two sets of edge cases, two mental models

### Benefits of Integration

- **One System:** Single evaluator for conditions, transformations, computed values
- **More Power:** Full expression language instead of limited DSL
- **Less Code:** Delete 150+ lines of hand-coded evaluators
- **Better UX:** Familiar JavaScript syntax, no learning curve
- **Future Proof:** Extensible through custom functions

## Design

### Condition Definition

Replace structured `Condition` type with expression strings:

```typescript
// Before: src/types.ts
export type Condition =
  | { type: 'comparison'; left: FieldRef | Literal; operator: ComparisonOperator; right: FieldRef | Literal }
  | { type: 'exists'; field: FieldRef }
  | { type: 'in_set'; field: FieldRef; values: unknown[] }
  | { type: 'array_length'; field: FieldRef; operator: ComparisonOperator; value: number }
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] }
  | { type: 'not'; condition: Condition }
  | { type: 'cel'; expression: string };

// After: src/types.ts
export type Condition = string; // JavaScript expression that evaluates to boolean
```

### Schema Changes

```typescript
// schema.ts - transitions table
export const transitions = sqliteTable('transitions', {
  // ...
  condition: text('condition'), // JSON string becomes expression string
  // ...
});
```

### Evaluation Implementation

```typescript
// src/planning/routing.ts
import { evaluate } from '@wonder/expressions';

/**
 * Evaluate a condition expression against context.
 * Returns true if condition is null/undefined (unconditional).
 */
export function evaluateCondition(
  condition: string | null | undefined,
  context: ContextSnapshot,
): boolean {
  if (condition === null || condition === undefined || condition === '') {
    return true; // Unconditional
  }

  try {
    const result = evaluate(condition, {
      input: context.input,
      state: context.state,
      output: context.output,
    });
    
    // Coerce to boolean (truthy/falsy)
    return Boolean(result);
  } catch (error) {
    // Log evaluation errors
    throw new Error(`Condition evaluation failed: ${condition}`, { cause: error });
  }
}
```

**Delete:**
- `evaluateComparison()`
- `evaluateExists()`
- `evaluateInSet()`
- `evaluateArrayLength()`
- `resolveValue()`
- `resolveField()`
- `getNestedValue()`

### Expression Context

The expression context provides access to workflow data:

```typescript
// Available in all expressions:
{
  input: {...},   // Workflow input data
  state: {...},   // Current workflow state
  output: {...}   // Most recent node output
}
```

### Example Conditions

```typescript
// Simple comparisons
"state.score >= 80"
"input.status === 'approved'"
"output.confidence > 0.9"

// Logical combinations
"state.score >= 80 && state.hasErrors === false"
"input.priority === 'high' || state.escalated === true"

// Array operations
"length(state.votes) >= 3"
"includes(state.tags, 'urgent')"
"some(state.approvals, 'item.approved === true')"

// Complex conditions (previously impossible)
"filter(state.approvals, 'item.score >= 4').length >= 3"
"state.total / state.count > state.threshold"
"map(state.items, 'item.value').reduce((a, b) => a + b, 0) > 100"

// Existence checks
"state.approval !== null && state.approval !== undefined"
"input.user?.name !== undefined"  // If we add optional chaining

// Type checks
"typeof state.value === 'number'"
"Array.isArray(output.results)"
```

## Migration Path

### Phase 1: Add @wonder/expressions to Coordinator

```bash
cd services/coordinator
pnpm add @wonder/expressions
```

### Phase 2: Update Types

```typescript
// src/types.ts
-export type Condition = ... // Complex union type
+export type Condition = string; // Expression string

// Remove related types
-export type FieldRef = { field: string };
-export type Literal = { literal: unknown };
-export type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';
```

### Phase 3: Replace Evaluator

```typescript
// src/planning/routing.ts
import { evaluate } from '@wonder/expressions';

export function evaluateCondition(
  condition: string | null | undefined,
  context: ContextSnapshot,
): boolean {
  if (!condition) return true;
  
  const result = evaluate(condition, {
    input: context.input,
    state: context.state,
    output: context.output,
  });
  
  return Boolean(result);
}
```

Delete all helper functions:
- `evaluateComparison()`
- `evaluateExists()`
- `evaluateInSet()`
- `evaluateArrayLength()`
- `resolveValue()`
- `resolveField()`
- `getNestedValue()`

### Phase 4: Update Tests

Replace structured condition tests with expression tests:

```typescript
// test/unit/planning/condition-evaluation.test.ts

describe('evaluateCondition - expressions', () => {
  test('comparison operators', () => {
    expect(evaluateCondition('state.score >= 80', baseContext)).toBe(true);
    expect(evaluateCondition('state.score < 80', baseContext)).toBe(false);
  });

  test('logical operators', () => {
    expect(evaluateCondition('state.score >= 80 && state.status === "approved"', context)).toBe(true);
    expect(evaluateCondition('state.score < 50 || state.urgent === true', context)).toBe(false);
  });

  test('array functions', () => {
    expect(evaluateCondition('length(state.items) > 3', baseContext)).toBe(true);
    expect(evaluateCondition('includes(input.tags, "admin")', baseContext)).toBe(true);
  });

  test('complex expressions', () => {
    const context = {
      state: { approvals: [{ score: 5 }, { score: 4 }, { score: 3 }] }
    };
    expect(evaluateCondition(
      'filter(state.approvals, "item.score >= 4").length >= 2',
      context
    )).toBe(true);
  });
});
```

### Phase 5: Update Documentation

Update all references to structured conditions in:
- `docs/architecture/branching.md`
- `docs/architecture/primitives.md`
- `packages/schemas/` (workflow schema definitions)

## Editor Integration

The visual workflow editor can still provide condition builders:

### Simple Condition Builder

For common patterns, generate expressions from UI:

```typescript
// UI Form:
// [Field: state.score] [Operator: >=] [Value: 80]
// 
// Generates expression:
"state.score >= 80"

// UI Form (compound):
// [Field: state.score] [>=] [80]
// [AND]
// [Field: state.errors] [==] [false]
//
// Generates:
"state.score >= 80 && state.errors === false"
```

### Expression Editor

For complex conditions, fall back to code editor with:
- Syntax highlighting
- Autocomplete for context fields (`input.*`, `state.*`, `output.*`)
- Built-in function reference
- Live validation

### Parsing for Display

Simple expressions can be parsed back into visual form:

```typescript
// Expression: "state.score >= 80"
// Displays as: [state.score] [>=] [80]

// Expression: "state.approvals.filter(...).length >= 3"  
// Displays as: [Code] button → opens editor
```

## Error Handling

### Expression Syntax Errors

Caught at evaluation time:

```typescript
try {
  evaluate(condition, context);
} catch (error) {
  // Log to trace events
  emitTrace({
    type: 'decision.routing.condition_error',
    payload: {
      condition,
      error: error.message,
      context_snapshot: context,
    }
  });
  
  // Fail safe: treat as false
  return false;
}
```

### Runtime Errors

Field access errors (undefined properties) are safe:

```typescript
// These return undefined, not errors:
"state.missing.nested.field"  // → undefined → false
"output.user?.name"            // → undefined → false
```

### Type Mismatches

Expressions handle type coercion:

```typescript
// These work as expected:
"state.count > 0"              // number comparison
"state.name === 'Alice'"       // string comparison
"state.enabled"                // truthy check
"!state.disabled"              // falsy check
```

## Performance Considerations

### Compiled Expressions

For frequently evaluated conditions, consider caching compiled expressions:

```typescript
const compiledCache = new Map<string, CompiledExpression>();

function evaluateCondition(condition: string, context: ContextSnapshot): boolean {
  if (!condition) return true;
  
  let compiled = compiledCache.get(condition);
  if (!compiled) {
    compiled = compile(condition);
    compiledCache.set(condition, compiled);
  }
  
  return Boolean(compiled.evaluate(context));
}
```

**Benefit:** Skip parsing on repeated evaluations (same condition, different context)

### Limits

@wonder/expressions already enforces safety limits:

```typescript
DEFAULT_LIMITS = {
  maxExpressionLength: 10_000,
  maxStringLength: 10_000,
  maxLiteralSize: 1_000,
}
```

These prevent malicious/accidental DoS from complex expressions.

## Validation

### Static Validation (Design Time)

Workflow definitions can validate expressions before deployment:

```typescript
import { compile } from '@wonder/expressions';

function validateCondition(condition: string): { valid: boolean; error?: string } {
  try {
    compile(condition); // Throws on syntax errors
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

### Context Schema Validation

Optionally validate that expression references match workflow schema:

```typescript
// Check if expression uses valid context paths
function validateContextReferences(
  condition: string,
  schema: WorkflowSchema
): ValidationResult {
  const ast = parse(condition);
  const references = extractIdentifiers(ast); // ['state.score', 'input.user']
  
  for (const ref of references) {
    if (!schemaHasPath(schema, ref)) {
      return { valid: false, error: `Unknown field: ${ref}` };
    }
  }
  
  return { valid: true };
}
```

## Security

@wonder/expressions is designed for untrusted input:

- **No eval():** Pure AST interpretation
- **No Function():** No code generation
- **No access to globals:** Sandboxed context
- **No prototype pollution:** Safe property access
- **Resource limits:** Max expression length, depth, etc.

Safe for user-provided expressions in multi-tenant environment.

## Backward Compatibility

### Transition Period

If needed, support both formats temporarily:

```typescript
export type Condition = string | LegacyStructuredCondition;

function evaluateCondition(condition: Condition | null, context: ContextSnapshot): boolean {
  if (!condition) return true;
  
  if (typeof condition === 'string') {
    // New: expression string
    return Boolean(evaluate(condition, context));
  } else {
    // Legacy: structured condition
    return evaluateLegacyCondition(condition, context);
  }
}
```

### Migration Script

Convert existing workflows from structured to expression format:

```typescript
function migrateCondition(structured: StructuredCondition): string {
  switch (structured.type) {
    case 'comparison':
      const left = structured.left.field || JSON.stringify(structured.left.literal);
      const right = structured.right.field || JSON.stringify(structured.right.literal);
      return `${left} ${structured.operator} ${right}`;
      
    case 'exists':
      return `${structured.field.field} !== null && ${structured.field.field} !== undefined`;
      
    case 'in_set':
      const values = JSON.stringify(structured.values);
      return `includes(${values}, ${structured.field.field})`;
      
    case 'array_length':
      return `length(${structured.field.field}) ${structured.operator} ${structured.value}`;
      
    case 'and':
      return structured.conditions.map(c => `(${migrateCondition(c)})`).join(' && ');
      
    case 'or':
      return structured.conditions.map(c => `(${migrateCondition(c)})`).join(' || ');
      
    case 'not':
      return `!(${migrateCondition(structured.condition)})`;
  }
}
```

## Implementation Checklist

- [ ] Add `@wonder/expressions` dependency to coordinator
- [ ] Update `Condition` type in `src/types.ts`
- [ ] Replace `evaluateCondition()` implementation in `src/planning/routing.ts`
- [ ] Delete unused evaluator functions
- [ ] Update schema definition (`transitions.condition` storage)
- [ ] Migrate tests to expression format
- [ ] Add expression validation utilities
- [ ] Update documentation
- [ ] Add expression caching/compilation if needed
- [ ] Create migration script for existing workflows
- [ ] Update workflow editor to generate/parse expressions

## Open Questions

1. **Caching strategy:** Should we cache compiled expressions? Per-request? Per-DO instance? Global?

2. **Custom functions:** Do we need coordinator-specific functions beyond built-ins?
   ```typescript
   // Example: token-aware functions
   "hasActiveSiblings()" 
   "getSiblingCount()"
   ```

3. **Type safety:** Should we generate TypeScript types from workflow schemas for expression validation?

4. **Editor UX:** How much visual building vs. code editing? What's the cutoff?

5. **Expression debugging:** Should we add expression evaluation traces for debugging?
   ```typescript
   {
     type: 'expression.evaluation',
     expression: 'state.score >= 80',
     context: { state: { score: 75 } },
     result: false,
     steps: [
       { step: 'resolve state.score', value: 75 },
       { step: 'compare >= 80', value: false }
     ]
   }
   ```

## Related Work

- **@wonder/expressions:** Core expression evaluator package
- **@wonder/templates:** Handlebars templating (uses expressions for helpers)
- **@wonder/schemas:** Workflow schema definitions (will reference expression syntax)

## Future Enhancements

### 1. Expression Libraries

Share common expressions across workflows:

```typescript
// expressions/library.ts
export const commonConditions = {
  isApproved: "state.status === 'approved'",
  hasErrors: "length(state.errors) > 0",
  highPriority: "input.priority === 'high' || state.escalated === true",
};

// Usage in workflow:
condition: "@lib.isApproved && !@lib.hasErrors"
```

### 2. Expression Metadata

Attach metadata for editor hints:

```typescript
{
  condition: "state.score >= 80",
  _meta: {
    description: "Requires passing score",
    category: "validation",
    estimatedFrequency: 0.7  // For optimization hints
  }
}
```

### 3. Partial Evaluation

Optimize expressions with known values:

```typescript
// Original:
"input.mode === 'production' && state.score >= threshold"

// If input.mode is always 'production':
"state.score >= threshold"
```

### 4. Expression Analytics

Track which conditions are most/least selective:

```typescript
{
  condition: "state.score >= 80",
  stats: {
    evaluations: 1000,
    trueCount: 723,
    falseCount: 277,
    selectivity: 0.723
  }
}
```
