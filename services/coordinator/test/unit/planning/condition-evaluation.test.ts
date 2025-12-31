/**
 * Tests for evaluateCondition
 *
 * Pure unit tests for condition evaluation logic.
 * No mocks, no infrastructure - just data in, boolean out.
 *
 * Uses @wonder/expressions parse() to create valid AST conditions.
 */

import { parse } from '@wonder/expressions';
import { describe, expect, test } from 'vitest';

import { evaluateCondition } from '../../../src/shared';
import type { Condition, ContextSnapshot } from '../../../src/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const baseContext: ContextSnapshot = {
  input: {
    name: 'Alice',
    age: 30,
    tags: ['admin', 'user'],
  },
  state: {
    score: 85,
    status: 'approved',
    items: [1, 2, 3, 4, 5],
    nested: {
      deep: {
        value: 'found',
      },
    },
  },
  output: {
    result: 'success',
  },
};

// ============================================================================
// Helper: Create condition from expression string
// ============================================================================

function cond(expr: string): Condition {
  return parse(expr);
}

// ============================================================================
// Unconditional (null/undefined)
// ============================================================================

describe('evaluateCondition - unconditional', () => {
  test('null condition returns true', () => {
    expect(evaluateCondition(null, baseContext)).toBe(true);
  });

  test('undefined condition returns true', () => {
    expect(evaluateCondition(undefined, baseContext)).toBe(true);
  });
});

// ============================================================================
// Comparison Conditions
// ============================================================================

describe('evaluateCondition - comparison', () => {
  describe('equality (===)', () => {
    test('field equals literal - true', () => {
      const condition = cond('state.score === 85');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field equals literal - false', () => {
      const condition = cond('state.score === 100');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test('string equality', () => {
      const condition = cond('state.status === "approved"');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('literal vs literal', () => {
      const condition = cond('5 === 5');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field vs field', () => {
      const context: ContextSnapshot = {
        input: { a: 10 },
        state: { b: 10 },
        output: {},
      };
      const condition = cond('input.a === state.b');
      expect(evaluateCondition(condition, context)).toBe(true);
    });
  });

  describe('inequality (!==)', () => {
    test('field not equals literal - true', () => {
      const condition = cond('state.score !== 100');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field not equals literal - false', () => {
      const condition = cond('state.score !== 85');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('greater than (>)', () => {
    test('field > literal - true', () => {
      const condition = cond('state.score > 80');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field > literal - false (equal)', () => {
      const condition = cond('state.score > 85');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test('field > literal - false (less)', () => {
      const condition = cond('state.score > 90');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('greater than or equal (>=)', () => {
    test('field >= literal - true (greater)', () => {
      const condition = cond('state.score >= 80');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field >= literal - true (equal)', () => {
      const condition = cond('state.score >= 85');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field >= literal - false', () => {
      const condition = cond('state.score >= 90');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('less than (<)', () => {
    test('field < literal - true', () => {
      const condition = cond('state.score < 90');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field < literal - false', () => {
      const condition = cond('state.score < 80');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('less than or equal (<=)', () => {
    test('field <= literal - true (less)', () => {
      const condition = cond('state.score <= 90');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field <= literal - true (equal)', () => {
      const condition = cond('state.score <= 85');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field <= literal - false', () => {
      const condition = cond('state.score <= 80');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });
});

// ============================================================================
// Existence Checks
// ============================================================================

describe('evaluateCondition - existence', () => {
  test('existing field is truthy', () => {
    const condition = cond('state.score');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('missing field is falsy', () => {
    // Accessing a missing field evaluates to undefined which is falsy
    const condition = cond('state.nonexistent');
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });

  test('null field is falsy', () => {
    const context: ContextSnapshot = {
      input: {},
      state: { value: null },
      output: {},
    };
    const condition = cond('state.value');
    expect(evaluateCondition(condition, context)).toBe(false);
  });

  test('nested field exists', () => {
    const condition = cond('state.nested.deep.value');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('partially missing nested path is falsy', () => {
    const condition = cond('state.nested.missing.value');
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });

  test('explicit null check with equality', () => {
    const context: ContextSnapshot = {
      input: {},
      state: { value: null },
      output: {},
    };
    const condition = cond('state.value === null');
    expect(evaluateCondition(condition, context)).toBe(true);
  });
});

// ============================================================================
// Array Operations
// ============================================================================

describe('evaluateCondition - arrays', () => {
  test('array length check', () => {
    const condition = cond('length(state.items) === 5');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('array length greater than', () => {
    const condition = cond('length(state.items) > 3');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('array length less than', () => {
    const condition = cond('length(state.items) < 10');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('includes check', () => {
    const condition = cond('includes(input.tags, "admin")');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('includes check - not found', () => {
    const condition = cond('includes(input.tags, "superuser")');
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });
});

// ============================================================================
// Boolean Logic (and/or/not)
// ============================================================================

describe('evaluateCondition - boolean logic', () => {
  describe('and (&&)', () => {
    test('all conditions true returns true', () => {
      const condition = cond('state.score >= 80 && state.status === "approved"');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('one condition false returns false', () => {
      const condition = cond('state.score >= 80 && state.status === "rejected"');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('or (||)', () => {
    test('one condition true returns true', () => {
      const condition = cond('state.score >= 100 || state.status === "approved"');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('all conditions false returns false', () => {
      const condition = cond('state.score >= 100 || state.status === "rejected"');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('not (!)', () => {
    test('negates true condition', () => {
      const condition = cond('!(state.score === 85)');
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test('negates false condition', () => {
      const condition = cond('!(state.score === 100)');
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });
  });

  describe('nested boolean logic', () => {
    test('complex nested condition', () => {
      // (score >= 80 AND status == "approved") OR (score >= 90)
      const condition = cond('(state.score >= 80 && state.status === "approved") || state.score >= 90');
      // score=85, status="approved" → first branch is true
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });
  });
});

// ============================================================================
// Field Resolution Edge Cases
// ============================================================================

describe('evaluateCondition - field resolution', () => {
  test('resolves input fields', () => {
    const condition = cond('input.name === "Alice"');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('resolves output fields', () => {
    const condition = cond('output.result === "success"');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('resolves deeply nested fields', () => {
    const condition = cond('state.nested.deep.value === "found"');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('numeric field comparison', () => {
    const condition = cond('input.age > 25');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });
});

// ============================================================================
// Ternary Conditions
// ============================================================================

describe('evaluateCondition - ternary', () => {
  test('ternary returns truthy branch', () => {
    const condition = cond('state.score >= 80 ? true : false');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('ternary returns falsy branch', () => {
    const condition = cond('state.score >= 100 ? true : false');
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });
});

// ============================================================================
// String Functions
// ============================================================================

describe('evaluateCondition - string functions', () => {
  test('startsWith check', () => {
    const condition = cond('startsWith(state.status, "app")');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('endsWith check', () => {
    const condition = cond('endsWith(state.status, "ed")');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('upper/lower case', () => {
    const condition = cond('upper(state.status) === "APPROVED"');
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });
});
