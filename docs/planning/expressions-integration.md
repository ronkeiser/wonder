# Coordinator Expressions Integration Plan

## Overview

Replace structured condition evaluators in coordinator with `@wonder/expressions` for unified expression handling across Wonder.

## Current State

- **Condition type**: Discriminated union with 8 variants (`comparison`, `exists`, `in_set`, `array_length`, `and`, `or`, `not`, `cel`)
- **Evaluation**: ~170 lines of hand-coded evaluators in `shared/condition-evaluator.ts`
- **Tests**: 639 lines of structured condition tests

## Target State

- **Condition type**: `string` (expression evaluated via `@wonder/expressions`)
- **Evaluation**: ~20 lines using `evaluate()` from `@wonder/expressions`
- **Tests**: ~150 lines of expression-based tests

## Files to Modify

| File | Change |
|------|--------|
| `services/coordinator/package.json` | Add `@wonder/expressions` dependency |
| `services/coordinator/src/types.ts` | Replace `Condition` union with `string`, delete `FieldRef`, `Literal`, `ComparisonOperator` |
| `services/coordinator/src/shared/condition-evaluator.ts` | Replace with simple expression evaluation |
| `services/coordinator/test/unit/planning/condition-evaluation.test.ts` | Replace structured tests with expression tests |

## Implementation Steps

### Step 1: Add dependency

```bash
cd services/coordinator && pnpm add @wonder/expressions
```

### Step 2: Update types.ts

Delete (lines 42-59):
- `Condition` union type (all 8 variants)
- `FieldRef` type
- `Literal` type
- `ComparisonOperator` type

Add:
```typescript
/** Condition expression string evaluated via @wonder/expressions */
export type Condition = string;
```

### Step 3: Replace condition-evaluator.ts

```typescript
/**
 * Condition Evaluation
 *
 * Evaluates workflow transition conditions using @wonder/expressions.
 */

import { evaluate } from '@wonder/expressions';
import type { ContextSnapshot } from '../types';

/**
 * Evaluate a condition expression against context.
 * Returns true if condition is null/undefined/empty (unconditional).
 */
export function evaluateCondition(
  condition: string | null | undefined,
  context: ContextSnapshot,
): boolean {
  if (condition === null || condition === undefined || condition === '') {
    return true;
  }

  const result = evaluate(condition, {
    input: context.input,
    state: context.state,
    output: context.output,
  });

  return Boolean(result);
}
```

### Step 4: Replace tests

Replace all structured condition tests with expression-based tests covering:
- Unconditional (null, undefined, empty string)
- Comparison operators (`===`, `!==`, `>`, `>=`, `<`, `<=`)
- Logical operators (`&&`, `||`, `!`)
- Array functions (`length()`, `includes()`)
- Field resolution (input, state, output, nested paths)
- Existence checks (`!== undefined`)

### Step 5: Run tests

```bash
pnpm --filter @wonder/coordinator test
```

## Expression Mapping Reference

| Structured Condition | Expression Equivalent |
|---------------------|----------------------|
| `{ type: 'comparison', left: { field: 'state.score' }, operator: '>=', right: { literal: 80 }}` | `state.score >= 80` |
| `{ type: 'exists', field: { field: 'state.approval' }}` | `state.approval !== undefined` |
| `{ type: 'in_set', field: { field: 'state.status' }, values: ['a', 'b'] }` | `includes(['a', 'b'], state.status)` |
| `{ type: 'array_length', field: { field: 'state.items' }, operator: '>', value: 3 }` | `length(state.items) > 3` |
| `{ type: 'and', conditions: [...] }` | `(expr1) && (expr2)` |
| `{ type: 'or', conditions: [...] }` | `(expr1) \|\| (expr2)` |
| `{ type: 'not', condition: {...} }` | `!(expr)` |

## Benefits

1. **Less code**: Delete ~150 lines of hand-coded evaluators
2. **More power**: Full expression language instead of limited DSL
3. **Better DX**: Familiar JavaScript syntax, no learning curve
4. **Unified**: Single expression system for conditions, transformations, computed values
5. **Extensible**: Custom functions can be added via registry

## Related

- Architecture doc: `docs/architecture/expressions.md`
- Expression package: `packages/expressions/`