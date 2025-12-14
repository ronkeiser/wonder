/**
 * Tests for buildPathId
 *
 * Pure unit tests for path ID construction.
 * Path IDs track token lineage through fan-out branches.
 */

import { describe, expect, test } from 'vitest';

import { buildPathId } from '../../../src/planning/routing';

// ============================================================================
// Single Token (No Fan-out)
// ============================================================================

describe('buildPathId - no fan-out', () => {
  test('single token keeps parent path', () => {
    const result = buildPathId('root', 'nodeA', 0, 1);
    expect(result).toBe('root');
  });

  test('sequential nodes without fan-out', () => {
    // First node
    const path1 = buildPathId('root', 'nodeA', 0, 1);
    expect(path1).toBe('root');

    // Second node (still no fan-out)
    const path2 = buildPathId(path1, 'nodeB', 0, 1);
    expect(path2).toBe('root');
  });
});

// ============================================================================
// Fan-out (Multiple Branches)
// ============================================================================

describe('buildPathId - fan-out', () => {
  test('first branch of fan-out', () => {
    const result = buildPathId('root', 'nodeA', 0, 3);
    expect(result).toBe('root.nodeA.0');
  });

  test('middle branch of fan-out', () => {
    const result = buildPathId('root', 'nodeA', 1, 3);
    expect(result).toBe('root.nodeA.1');
  });

  test('last branch of fan-out', () => {
    const result = buildPathId('root', 'nodeA', 2, 3);
    expect(result).toBe('root.nodeA.2');
  });

  test('two-way fan-out', () => {
    const branch0 = buildPathId('root', 'nodeA', 0, 2);
    const branch1 = buildPathId('root', 'nodeA', 1, 2);

    expect(branch0).toBe('root.nodeA.0');
    expect(branch1).toBe('root.nodeA.1');
  });

  test('large fan-out (5 branches)', () => {
    const paths = [0, 1, 2, 3, 4].map((i) => buildPathId('root', 'judge', i, 5));

    expect(paths).toEqual([
      'root.judge.0',
      'root.judge.1',
      'root.judge.2',
      'root.judge.3',
      'root.judge.4',
    ]);
  });
});

// ============================================================================
// Nested Fan-out
// ============================================================================

describe('buildPathId - nested fan-out', () => {
  test('fan-out within fan-out', () => {
    // Root → Node A fans out 3 ways
    const path_A0 = buildPathId('root', 'nodeA', 0, 3);
    const path_A1 = buildPathId('root', 'nodeA', 1, 3);
    const path_A2 = buildPathId('root', 'nodeA', 2, 3);

    expect(path_A0).toBe('root.nodeA.0');
    expect(path_A1).toBe('root.nodeA.1');
    expect(path_A2).toBe('root.nodeA.2');

    // Branch A0 → Node B fans out 2 ways
    const path_A0_B0 = buildPathId(path_A0, 'nodeB', 0, 2);
    const path_A0_B1 = buildPathId(path_A0, 'nodeB', 1, 2);

    expect(path_A0_B0).toBe('root.nodeA.0.nodeB.0');
    expect(path_A0_B1).toBe('root.nodeA.0.nodeB.1');

    // Branch A1 → Node B fans out 2 ways
    const path_A1_B0 = buildPathId(path_A1, 'nodeB', 0, 2);
    const path_A1_B1 = buildPathId(path_A1, 'nodeB', 1, 2);

    expect(path_A1_B0).toBe('root.nodeA.1.nodeB.0');
    expect(path_A1_B1).toBe('root.nodeA.1.nodeB.1');
  });

  test('three levels of nesting', () => {
    // Root → A(3) → B(2) → C(4)
    const path_A1 = buildPathId('root', 'A', 1, 3);
    const path_A1_B0 = buildPathId(path_A1, 'B', 0, 2);
    const path_A1_B0_C3 = buildPathId(path_A1_B0, 'C', 3, 4);

    expect(path_A1_B0_C3).toBe('root.A.1.B.0.C.3');
  });
});

// ============================================================================
// Mixed: Fan-out followed by Sequential
// ============================================================================

describe('buildPathId - mixed patterns', () => {
  test('fan-out then sequential (no additional fan-out)', () => {
    // Root → Node A fans out 3 ways
    const path_A1 = buildPathId('root', 'nodeA', 1, 3);
    expect(path_A1).toBe('root.nodeA.1');

    // Branch 1 → Node B (no fan-out, single token)
    const path_A1_B = buildPathId(path_A1, 'nodeB', 0, 1);
    expect(path_A1_B).toBe('root.nodeA.1'); // Path unchanged

    // Node B → Node C (no fan-out, single token)
    const path_A1_B_C = buildPathId(path_A1_B, 'nodeC', 0, 1);
    expect(path_A1_B_C).toBe('root.nodeA.1'); // Path still unchanged
  });

  test('sequential then fan-out', () => {
    // Root → Node A (single)
    const path_A = buildPathId('root', 'nodeA', 0, 1);
    expect(path_A).toBe('root');

    // Node A → Node B (single)
    const path_B = buildPathId(path_A, 'nodeB', 0, 1);
    expect(path_B).toBe('root');

    // Node B → Node C fans out 3 ways
    const path_C0 = buildPathId(path_B, 'nodeC', 0, 3);
    const path_C1 = buildPathId(path_B, 'nodeC', 1, 3);
    const path_C2 = buildPathId(path_B, 'nodeC', 2, 3);

    expect(path_C0).toBe('root.nodeC.0');
    expect(path_C1).toBe('root.nodeC.1');
    expect(path_C2).toBe('root.nodeC.2');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('buildPathId - edge cases', () => {
  test('empty parent path', () => {
    const result = buildPathId('', 'nodeA', 0, 2);
    expect(result).toBe('.nodeA.0');
  });

  test('node ID with special characters', () => {
    const result = buildPathId('root', 'node_A-1', 0, 2);
    expect(result).toBe('root.node_A-1.0');
  });

  test('very large branch index', () => {
    const result = buildPathId('root', 'nodeA', 999, 1000);
    expect(result).toBe('root.nodeA.999');
  });
});
