/**
 * Unit tests for merge strategies (pure logic)
 *
 * Tests all 4 merge strategies as specified in branch-storage.md:
 * - append: Collect all outputs into array
 * - merge_object: Shallow merge all outputs
 * - keyed_by_branch: Object keyed by branch index
 * - last_wins: Take last completed branch
 */

import { describe, expect, test } from 'vitest';
import { applyMergeStrategy } from '../../../src/planning/merge';

describe('applyMergeStrategy', () => {
  const branchOutputs = [
    {
      tokenId: 'tok_1',
      branchIndex: 0,
      output: { choice: 'A', rationale: 'First reason' },
    },
    {
      tokenId: 'tok_2',
      branchIndex: 1,
      output: { choice: 'B', rationale: 'Second reason' },
    },
    {
      tokenId: 'tok_3',
      branchIndex: 2,
      output: { choice: 'A', rationale: 'Third reason' },
    },
  ];

  describe('append strategy', () => {
    test('collects all outputs into array', () => {
      const merged = applyMergeStrategy(branchOutputs, 'append');

      expect(merged).toEqual([
        { choice: 'A', rationale: 'First reason' },
        { choice: 'B', rationale: 'Second reason' },
        { choice: 'A', rationale: 'Third reason' },
      ]);
    });

    test('preserves order by branch_index', () => {
      const unordered = [branchOutputs[2], branchOutputs[0], branchOutputs[1]];
      const merged = applyMergeStrategy(unordered, 'append');

      expect(merged).toEqual([
        { choice: 'A', rationale: 'First reason' },
        { choice: 'B', rationale: 'Second reason' },
        { choice: 'A', rationale: 'Third reason' },
      ]);
    });

    test('handles single branch', () => {
      const merged = applyMergeStrategy([branchOutputs[0]], 'append');
      expect(merged).toEqual([{ choice: 'A', rationale: 'First reason' }]);
    });

    test('handles empty array', () => {
      const merged = applyMergeStrategy([], 'append');
      expect(merged).toEqual([]);
    });
  });

  describe('merge_object strategy', () => {
    test('shallow merges all outputs', () => {
      const outputs = [
        { tokenId: 'tok_1', branchIndex: 0, output: { a: 1, b: 2 } },
        { tokenId: 'tok_2', branchIndex: 1, output: { b: 3, c: 4 } },
        { tokenId: 'tok_3', branchIndex: 2, output: { c: 5, d: 6 } },
      ];

      const merged = applyMergeStrategy(outputs, 'merge_object');

      expect(merged).toEqual({ a: 1, b: 3, c: 5, d: 6 });
    });

    test('last wins for conflicts', () => {
      const outputs = [
        { tokenId: 'tok_1', branchIndex: 0, output: { value: 'first' } },
        { tokenId: 'tok_2', branchIndex: 1, output: { value: 'second' } },
        { tokenId: 'tok_3', branchIndex: 2, output: { value: 'third' } },
      ];

      const merged = applyMergeStrategy(outputs, 'merge_object');

      expect(merged).toEqual({ value: 'third' });
    });

    test('handles nested objects (shallow only)', () => {
      const outputs = [
        { tokenId: 'tok_1', branchIndex: 0, output: { nested: { a: 1 } } },
        { tokenId: 'tok_2', branchIndex: 1, output: { nested: { b: 2 } } },
      ];

      const merged = applyMergeStrategy(outputs, 'merge_object');

      // Shallow merge - last wins for nested objects
      expect(merged).toEqual({ nested: { b: 2 } });
    });
  });

  describe('keyed_by_branch strategy', () => {
    test('creates object keyed by branch index', () => {
      const merged = applyMergeStrategy(branchOutputs, 'keyed_by_branch');

      expect(merged).toEqual({
        '0': { choice: 'A', rationale: 'First reason' },
        '1': { choice: 'B', rationale: 'Second reason' },
        '2': { choice: 'A', rationale: 'Third reason' },
      });
    });

    test('handles sparse branch indices', () => {
      const outputs = [
        { tokenId: 'tok_1', branchIndex: 0, output: { value: 'a' } },
        { tokenId: 'tok_3', branchIndex: 2, output: { value: 'c' } },
        { tokenId: 'tok_5', branchIndex: 4, output: { value: 'e' } },
      ];

      const merged = applyMergeStrategy(outputs, 'keyed_by_branch');

      expect(merged).toEqual({
        '0': { value: 'a' },
        '2': { value: 'c' },
        '4': { value: 'e' },
      });
    });

    test('handles single branch', () => {
      const merged = applyMergeStrategy([branchOutputs[0]], 'keyed_by_branch');
      expect(merged).toEqual({
        '0': { choice: 'A', rationale: 'First reason' },
      });
    });
  });

  describe('last_wins strategy', () => {
    test('takes last completed branch by index', () => {
      const merged = applyMergeStrategy(branchOutputs, 'last_wins');

      expect(merged).toEqual({ choice: 'A', rationale: 'Third reason' });
    });

    test('handles single branch', () => {
      const merged = applyMergeStrategy([branchOutputs[0]], 'last_wins');
      expect(merged).toEqual({ choice: 'A', rationale: 'First reason' });
    });

    test('uses highest branch_index when out of order', () => {
      const unordered = [branchOutputs[1], branchOutputs[2], branchOutputs[0]];
      const merged = applyMergeStrategy(unordered, 'last_wins');

      // Branch 2 has highest index
      expect(merged).toEqual({ choice: 'A', rationale: 'Third reason' });
    });
  });

  describe('edge cases', () => {
    test('throws on unknown strategy', () => {
      expect(() => applyMergeStrategy(branchOutputs, 'invalid' as any)).toThrow(
        'Unknown merge strategy: invalid',
      );
    });

    test('handles null/undefined in outputs', () => {
      const outputs = [
        { tokenId: 'tok_1', branchIndex: 0, output: { value: null } },
        { tokenId: 'tok_2', branchIndex: 1, output: { value: undefined } },
        { tokenId: 'tok_3', branchIndex: 2, output: { value: 'actual' } },
      ];

      const merged = applyMergeStrategy(outputs, 'append');

      expect(merged).toEqual([{ value: null }, { value: undefined }, { value: 'actual' }]);
    });
  });
});
