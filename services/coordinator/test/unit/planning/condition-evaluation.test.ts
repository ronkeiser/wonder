/**
 * Tests for evaluateCondition
 *
 * Pure unit tests for condition evaluation logic.
 * No mocks, no infrastructure - just data in, boolean out.
 */

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
  describe('equality (==)', () => {
    test('field equals literal - true', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '==',
        right: { literal: 85 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field equals literal - false', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '==',
        right: { literal: 100 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test('string equality', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.status' },
        operator: '==',
        right: { literal: 'approved' },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('literal vs literal', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { literal: 5 },
        operator: '==',
        right: { literal: 5 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field vs field', () => {
      const context: ContextSnapshot = {
        input: { a: 10 },
        state: { b: 10 },
        output: {},
      };
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'input.a' },
        operator: '==',
        right: { field: 'state.b' },
      };
      expect(evaluateCondition(condition, context)).toBe(true);
    });
  });

  describe('inequality (!=)', () => {
    test('field not equals literal - true', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '!=',
        right: { literal: 100 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field not equals literal - false', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '!=',
        right: { literal: 85 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('greater than (>)', () => {
    test('field > literal - true', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '>',
        right: { literal: 80 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field > literal - false (equal)', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '>',
        right: { literal: 85 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test('field > literal - false (less)', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '>',
        right: { literal: 90 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('greater than or equal (>=)', () => {
    test('field >= literal - true (greater)', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '>=',
        right: { literal: 80 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field >= literal - true (equal)', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '>=',
        right: { literal: 85 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field >= literal - false', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '>=',
        right: { literal: 90 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('less than (<)', () => {
    test('field < literal - true', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '<',
        right: { literal: 90 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field < literal - false', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '<',
        right: { literal: 80 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('less than or equal (<=)', () => {
    test('field <= literal - true (less)', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '<=',
        right: { literal: 90 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field <= literal - true (equal)', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '<=',
        right: { literal: 85 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('field <= literal - false', () => {
      const condition: Condition = {
        type: 'comparison',
        left: { field: 'state.score' },
        operator: '<=',
        right: { literal: 80 },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });
});

// ============================================================================
// Exists Conditions
// ============================================================================

describe('evaluateCondition - exists', () => {
  test('existing field returns true', () => {
    const condition: Condition = {
      type: 'exists',
      field: { field: 'state.score' },
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('missing field returns false', () => {
    const condition: Condition = {
      type: 'exists',
      field: { field: 'state.nonexistent' },
    };
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });

  test('null field returns false', () => {
    const context: ContextSnapshot = {
      input: {},
      state: { value: null },
      output: {},
    };
    const condition: Condition = {
      type: 'exists',
      field: { field: 'state.value' },
    };
    expect(evaluateCondition(condition, context)).toBe(false);
  });

  test('nested field exists', () => {
    const condition: Condition = {
      type: 'exists',
      field: { field: 'state.nested.deep.value' },
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('partially missing nested path returns false', () => {
    const condition: Condition = {
      type: 'exists',
      field: { field: 'state.nested.missing.value' },
    };
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });
});

// ============================================================================
// In Set Conditions
// ============================================================================

describe('evaluateCondition - in_set', () => {
  test('value in set returns true', () => {
    const condition: Condition = {
      type: 'in_set',
      field: { field: 'state.status' },
      values: ['approved', 'pending', 'rejected'],
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('value not in set returns false', () => {
    const condition: Condition = {
      type: 'in_set',
      field: { field: 'state.status' },
      values: ['pending', 'rejected'],
    };
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });

  test('numeric value in set', () => {
    const condition: Condition = {
      type: 'in_set',
      field: { field: 'state.score' },
      values: [80, 85, 90],
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('empty set returns false', () => {
    const condition: Condition = {
      type: 'in_set',
      field: { field: 'state.status' },
      values: [],
    };
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });
});

// ============================================================================
// Array Length Conditions
// ============================================================================

describe('evaluateCondition - array_length', () => {
  test('array length equals value', () => {
    const condition: Condition = {
      type: 'array_length',
      field: { field: 'state.items' },
      operator: '==',
      value: 5,
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('array length greater than value', () => {
    const condition: Condition = {
      type: 'array_length',
      field: { field: 'state.items' },
      operator: '>',
      value: 3,
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('array length less than value', () => {
    const condition: Condition = {
      type: 'array_length',
      field: { field: 'state.items' },
      operator: '<',
      value: 10,
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('non-array field returns false', () => {
    const condition: Condition = {
      type: 'array_length',
      field: { field: 'state.score' },
      operator: '==',
      value: 1,
    };
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });

  test('missing field returns false', () => {
    const condition: Condition = {
      type: 'array_length',
      field: { field: 'state.nonexistent' },
      operator: '>=',
      value: 0,
    };
    expect(evaluateCondition(condition, baseContext)).toBe(false);
  });
});

// ============================================================================
// Boolean Logic (and/or/not)
// ============================================================================

describe('evaluateCondition - boolean logic', () => {
  describe('and', () => {
    test('all conditions true returns true', () => {
      const condition: Condition = {
        type: 'and',
        conditions: [
          {
            type: 'comparison',
            left: { field: 'state.score' },
            operator: '>=',
            right: { literal: 80 },
          },
          {
            type: 'comparison',
            left: { field: 'state.status' },
            operator: '==',
            right: { literal: 'approved' },
          },
        ],
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('one condition false returns false', () => {
      const condition: Condition = {
        type: 'and',
        conditions: [
          {
            type: 'comparison',
            left: { field: 'state.score' },
            operator: '>=',
            right: { literal: 80 },
          },
          {
            type: 'comparison',
            left: { field: 'state.status' },
            operator: '==',
            right: { literal: 'rejected' },
          },
        ],
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test('empty and returns true', () => {
      const condition: Condition = {
        type: 'and',
        conditions: [],
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });
  });

  describe('or', () => {
    test('one condition true returns true', () => {
      const condition: Condition = {
        type: 'or',
        conditions: [
          {
            type: 'comparison',
            left: { field: 'state.score' },
            operator: '>=',
            right: { literal: 100 },
          },
          {
            type: 'comparison',
            left: { field: 'state.status' },
            operator: '==',
            right: { literal: 'approved' },
          },
        ],
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });

    test('all conditions false returns false', () => {
      const condition: Condition = {
        type: 'or',
        conditions: [
          {
            type: 'comparison',
            left: { field: 'state.score' },
            operator: '>=',
            right: { literal: 100 },
          },
          {
            type: 'comparison',
            left: { field: 'state.status' },
            operator: '==',
            right: { literal: 'rejected' },
          },
        ],
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test('empty or returns false', () => {
      const condition: Condition = {
        type: 'or',
        conditions: [],
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });
  });

  describe('not', () => {
    test('negates true condition', () => {
      const condition: Condition = {
        type: 'not',
        condition: {
          type: 'comparison',
          left: { field: 'state.score' },
          operator: '==',
          right: { literal: 85 },
        },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(false);
    });

    test('negates false condition', () => {
      const condition: Condition = {
        type: 'not',
        condition: {
          type: 'comparison',
          left: { field: 'state.score' },
          operator: '==',
          right: { literal: 100 },
        },
      };
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });
  });

  describe('nested boolean logic', () => {
    test('complex nested condition', () => {
      // (score >= 80 AND status == "approved") OR (score >= 90)
      const condition: Condition = {
        type: 'or',
        conditions: [
          {
            type: 'and',
            conditions: [
              {
                type: 'comparison',
                left: { field: 'state.score' },
                operator: '>=',
                right: { literal: 80 },
              },
              {
                type: 'comparison',
                left: { field: 'state.status' },
                operator: '==',
                right: { literal: 'approved' },
              },
            ],
          },
          {
            type: 'comparison',
            left: { field: 'state.score' },
            operator: '>=',
            right: { literal: 90 },
          },
        ],
      };
      // score=85, status="approved" → first branch is true
      expect(evaluateCondition(condition, baseContext)).toBe(true);
    });
  });
});

// ============================================================================
// CEL Expressions (throws)
// ============================================================================

describe('evaluateCondition - cel', () => {
  test('throws for CEL expressions', () => {
    const condition: Condition = {
      type: 'cel',
      expression: 'state.score > 80',
    };
    expect(() => evaluateCondition(condition, baseContext)).toThrow(
      'CEL expressions not yet supported',
    );
  });
});

// ============================================================================
// Field Resolution Edge Cases
// ============================================================================

describe('evaluateCondition - field resolution', () => {
  test('resolves input fields', () => {
    const condition: Condition = {
      type: 'comparison',
      left: { field: 'input.name' },
      operator: '==',
      right: { literal: 'Alice' },
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('resolves output fields', () => {
    const condition: Condition = {
      type: 'comparison',
      left: { field: 'output.result' },
      operator: '==',
      right: { literal: 'success' },
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('resolves deeply nested fields', () => {
    const condition: Condition = {
      type: 'comparison',
      left: { field: 'state.nested.deep.value' },
      operator: '==',
      right: { literal: 'found' },
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });

  test('missing nested path returns undefined for comparison', () => {
    const condition: Condition = {
      type: 'comparison',
      left: { field: 'state.missing.path' },
      operator: '==',
      right: { literal: undefined },
    };
    expect(evaluateCondition(condition, baseContext)).toBe(true);
  });
});
