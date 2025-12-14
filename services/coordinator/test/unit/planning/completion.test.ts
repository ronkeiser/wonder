/**
 * Tests for completion planning functions
 *
 * Pure unit tests for:
 * - extractValueFromContext: JSONPath-style extraction
 * - extractFinalOutput: Workflow output mapping
 * - applyInputMapping: Task/action input extraction
 */

import { describe, expect, test } from 'vitest';

import {
  applyInputMapping,
  extractFinalOutput,
  extractValueFromContext,
} from '../../../src/planning/completion';
import type { ContextSnapshot } from '../../../src/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const baseContext: ContextSnapshot = {
  input: {
    name: 'Alice',
    age: 30,
    config: {
      verbose: true,
      retries: 3,
    },
  },
  state: {
    score: 85,
    status: 'approved',
    nested: {
      deep: {
        value: 'found',
      },
    },
    items: [1, 2, 3],
  },
  output: {
    result: 'success',
    data: {
      greeting: 'Hello, Alice!',
    },
  },
};

// ============================================================================
// extractValueFromContext
// ============================================================================

describe('extractValueFromContext', () => {
  describe('input paths', () => {
    test('extracts top-level input field', () => {
      expect(extractValueFromContext('$.input.name', baseContext)).toBe('Alice');
    });

    test('extracts numeric input field', () => {
      expect(extractValueFromContext('$.input.age', baseContext)).toBe(30);
    });

    test('extracts nested input field', () => {
      expect(extractValueFromContext('$.input.config.verbose', baseContext)).toBe(true);
    });
  });

  describe('state paths', () => {
    test('extracts top-level state field', () => {
      expect(extractValueFromContext('$.state.score', baseContext)).toBe(85);
    });

    test('extracts string state field', () => {
      expect(extractValueFromContext('$.state.status', baseContext)).toBe('approved');
    });

    test('extracts deeply nested state field', () => {
      expect(extractValueFromContext('$.state.nested.deep.value', baseContext)).toBe('found');
    });

    test('extracts array from state', () => {
      expect(extractValueFromContext('$.state.items', baseContext)).toEqual([1, 2, 3]);
    });
  });

  describe('output paths', () => {
    test('extracts top-level output field', () => {
      expect(extractValueFromContext('$.output.result', baseContext)).toBe('success');
    });

    test('extracts nested output field', () => {
      expect(extractValueFromContext('$.output.data.greeting', baseContext)).toBe('Hello, Alice!');
    });
  });

  describe('literal values (non-JSONPath)', () => {
    test('returns string literal as-is', () => {
      expect(extractValueFromContext('hello world', baseContext)).toBe('hello world');
    });

    test('returns numeric string as-is', () => {
      expect(extractValueFromContext('123', baseContext)).toBe('123');
    });

    test('returns empty string as-is', () => {
      expect(extractValueFromContext('', baseContext)).toBe('');
    });
  });

  describe('missing paths', () => {
    test('returns undefined for missing top-level field', () => {
      expect(extractValueFromContext('$.input.nonexistent', baseContext)).toBeUndefined();
    });

    test('returns undefined for missing nested field', () => {
      expect(extractValueFromContext('$.state.nested.missing.value', baseContext)).toBeUndefined();
    });

    test('returns undefined for invalid section', () => {
      expect(extractValueFromContext('$.invalid.field', baseContext)).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    test('handles null value in path', () => {
      const context: ContextSnapshot = {
        input: { value: null },
        state: {},
        output: {},
      };
      expect(extractValueFromContext('$.input.value', context)).toBeNull();
    });

    test('handles object value', () => {
      expect(extractValueFromContext('$.input.config', baseContext)).toEqual({
        verbose: true,
        retries: 3,
      });
    });

    test('returns undefined traversing through non-object', () => {
      expect(extractValueFromContext('$.input.name.invalid', baseContext)).toBeUndefined();
    });
  });
});

// ============================================================================
// extractFinalOutput
// ============================================================================

describe('extractFinalOutput', () => {
  test('extracts single field', () => {
    const result = extractFinalOutput({ final_result: '$.output.result' }, baseContext);

    expect(result.output).toEqual({ final_result: 'success' });
  });

  test('extracts multiple fields', () => {
    const result = extractFinalOutput(
      {
        name: '$.input.name',
        score: '$.state.score',
        result: '$.output.result',
      },
      baseContext,
    );

    expect(result.output).toEqual({
      name: 'Alice',
      score: 85,
      result: 'success',
    });
  });

  test('extracts nested source to flat target', () => {
    const result = extractFinalOutput({ greeting: '$.output.data.greeting' }, baseContext);

    expect(result.output).toEqual({ greeting: 'Hello, Alice!' });
  });

  test('handles null mapping', () => {
    const result = extractFinalOutput(null, baseContext);

    expect(result.output).toEqual({});
  });

  test('handles empty mapping', () => {
    const result = extractFinalOutput({}, baseContext);

    expect(result.output).toEqual({});
  });

  test('handles missing paths (undefined values)', () => {
    const result = extractFinalOutput(
      {
        existing: '$.state.score',
        missing: '$.state.nonexistent',
      },
      baseContext,
    );

    expect(result.output).toEqual({
      existing: 85,
      missing: undefined,
    });
  });

  test('handles literal values in mapping', () => {
    const result = extractFinalOutput(
      {
        version: 'v1.0.0',
        computed: '$.state.score',
      },
      baseContext,
    );

    expect(result.output).toEqual({
      version: 'v1.0.0',
      computed: 85,
    });
  });

  describe('events', () => {
    test('emits start event', () => {
      const result = extractFinalOutput({ x: '$.state.score' }, baseContext);

      const startEvent = result.events.find((e) => e.type === 'decision.completion.start');
      expect(startEvent).toBeDefined();
    });

    test('emits extract events for each field', () => {
      const result = extractFinalOutput({ a: '$.input.name', b: '$.state.score' }, baseContext);

      const extractEvents = result.events.filter((e) => e.type === 'decision.completion.extract');
      expect(extractEvents).toHaveLength(2);
    });

    test('emits complete event with final output', () => {
      const result = extractFinalOutput({ result: '$.output.result' }, baseContext);

      const completeEvent = result.events.find((e) => e.type === 'decision.completion.complete');
      expect(completeEvent).toMatchObject({
        type: 'decision.completion.complete',
        final_output: { result: 'success' },
      });
    });

    test('emits no_mapping event when mapping is null', () => {
      const result = extractFinalOutput(null, baseContext);

      const noMappingEvent = result.events.find((e) => e.type === 'decision.completion.no_mapping');
      expect(noMappingEvent).toBeDefined();
    });
  });
});

// ============================================================================
// applyInputMapping
// ============================================================================

describe('applyInputMapping', () => {
  test('extracts single field', () => {
    const result = applyInputMapping({ userName: '$.input.name' }, baseContext);

    expect(result).toEqual({ userName: 'Alice' });
  });

  test('extracts multiple fields', () => {
    const result = applyInputMapping(
      {
        name: '$.input.name',
        currentScore: '$.state.score',
        previousResult: '$.output.result',
      },
      baseContext,
    );

    expect(result).toEqual({
      name: 'Alice',
      currentScore: 85,
      previousResult: 'success',
    });
  });

  test('handles null mapping', () => {
    const result = applyInputMapping(null, baseContext);

    expect(result).toEqual({});
  });

  test('handles empty mapping', () => {
    const result = applyInputMapping({}, baseContext);

    expect(result).toEqual({});
  });

  test('handles missing paths', () => {
    const result = applyInputMapping(
      {
        exists: '$.state.score',
        missing: '$.state.nonexistent',
      },
      baseContext,
    );

    expect(result).toEqual({
      exists: 85,
      missing: undefined,
    });
  });

  test('extracts nested objects', () => {
    const result = applyInputMapping({ config: '$.input.config' }, baseContext);

    expect(result).toEqual({
      config: { verbose: true, retries: 3 },
    });
  });

  test('extracts arrays', () => {
    const result = applyInputMapping({ items: '$.state.items' }, baseContext);

    expect(result).toEqual({ items: [1, 2, 3] });
  });

  test('handles literal values', () => {
    const result = applyInputMapping(
      {
        staticValue: 'constant',
        dynamicValue: '$.input.name',
      },
      baseContext,
    );

    expect(result).toEqual({
      staticValue: 'constant',
      dynamicValue: 'Alice',
    });
  });
});
