/**
 * Mock Action Handler
 *
 * Generates random data conforming to a JSON schema.
 * Useful for testing workflows without real LLM calls or external services.
 */

import type { JSONSchema } from '@wonder/schemas';
import { generateMockData, type MockOptions } from '../utils/mock-generator';
import type { ActionDeps, ActionInput, ActionOutput } from './types';

/**
 * Expected implementation shape for mock actions
 */
interface MockImplementation {
  /** JSON Schema to generate data for */
  schema: JSONSchema;
  /** Generation options */
  options?: MockOptions;
}

/**
 * Execute a mock action - generates random data matching the schema
 */
export async function executeMockAction(
  input: ActionInput,
  deps: ActionDeps,
): Promise<ActionOutput> {
  const { action, context } = input;
  const { logger, emitter } = deps;
  const startTime = Date.now();

  const implementation = action.implementation as MockImplementation;

  // Validate implementation has schema
  if (!implementation?.schema) {
    logger.error({
      eventType: 'mock_action_invalid',
      message: 'Mock action missing schema in implementation',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
      },
    });

    return {
      success: false,
      output: {},
      error: {
        message: 'Mock action requires schema in implementation',
        code: 'INVALID_IMPLEMENTATION',
        retryable: false,
      },
    };
  }

  try {
    // Apply configured delay if specified
    if (implementation.options?.delay) {
      const { minMs, maxMs } = implementation.options.delay;
      const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Generate mock data
    const mockData = generateMockData(implementation.schema, implementation.options);

    const duration = Date.now() - startTime;

    // Emit trace event for mock data generation
    emitter.emitTrace({
      type: 'executor.mock.generated',
      tokenId: context.tokenId,
      durationMs: duration,
      payload: {
        stepRef: context.stepRef,
        actionId: action.id,
        schemaType: implementation.schema.type,
        hasSeed: implementation.options?.seed !== undefined,
      },
    });

    logger.info({
      eventType: 'mock_action_completed',
      message: 'Mock data generated successfully',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
        durationMs: duration,
        schemaType: implementation.schema.type,
        hasSeed: implementation.options?.seed !== undefined,
        hasDelay: implementation.options?.delay !== undefined,
      },
    });

    // Return the generated data
    // If it's an object, spread it as output; otherwise wrap in 'value'
    const output =
      typeof mockData === 'object' && mockData !== null && !Array.isArray(mockData)
        ? (mockData as Record<string, unknown>)
        : { value: mockData };

    return {
      success: true,
      output,
      metrics: {
        durationMs: duration,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      eventType: 'mock_action_failed',
      message: 'Failed to generate mock data',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return {
      success: false,
      output: {},
      error: {
        message: error instanceof Error ? error.message : String(error),
        code: 'GENERATION_FAILED',
        retryable: false,
      },
      metrics: {
        durationMs: duration,
      },
    };
  }
}
