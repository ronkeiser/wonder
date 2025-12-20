/**
 * Unit tests for node builder
 */

import { describe, expect, it } from 'vitest';
import { node } from '../../src/builders/node';

describe('node()', () => {
  it('creates node with required fields only', () => {
    const result = node({
      ref: 'my-node',
      name: 'My Node',
    });

    expect(result).toEqual({
      ref: 'my-node',
      name: 'My Node',
    });
  });

  it('creates node with action', () => {
    const result = node({
      ref: 'process',
      name: 'Process Data',
      actionId: 'my-action',
      actionVersion: 1,
    });

    expect(result).toEqual({
      ref: 'process',
      name: 'Process Data',
      actionId: 'my-action',
      actionVersion: 1,
    });
  });

  it('creates node with input mapping', () => {
    const result = node({
      ref: 'transform',
      name: 'Transform',
      actionId: 'transformer',
      inputMapping: {
        data: '$.input.rawData',
        format: '$.context.format',
      },
    });

    expect(result).toEqual({
      ref: 'transform',
      name: 'Transform',
      actionId: 'transformer',
      inputMapping: {
        data: '$.input.rawData',
        format: '$.context.format',
      },
    });
  });

  it('creates node with output mapping', () => {
    const result = node({
      ref: 'extract',
      name: 'Extract',
      actionId: 'extractor',
      outputMapping: {
        result: '$.response.data',
      },
    });

    expect(result).toEqual({
      ref: 'extract',
      name: 'Extract',
      actionId: 'extractor',
      outputMapping: {
        result: '$.response.data',
      },
    });
  });

  it('creates node with all fields', () => {
    const result = node({
      ref: 'complete',
      name: 'Complete Node',
      actionId: 'action-123',
      actionVersion: 2,
      inputMapping: {
        input: '$.input',
      },
      outputMapping: {
        output: '$.response',
      },
    });

    expect(result).toEqual({
      ref: 'complete',
      name: 'Complete Node',
      actionId: 'action-123',
      actionVersion: 2,
      inputMapping: {
        input: '$.input',
      },
      outputMapping: {
        output: '$.response',
      },
    });
  });
});
