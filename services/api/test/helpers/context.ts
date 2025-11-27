/** Test helper for creating mock ServiceContext */

import { createMockLogger, type MockLogger } from '@wonder/logger/mock';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { vi } from 'vitest';
import type { ServiceContext } from '~/infrastructure/context';

export interface MockServiceContext extends ServiceContext {
  logger: MockLogger;
}

export interface CreateMockContextOptions {
  db?: DrizzleD1Database;
  ai?: Ai;
  logger?: MockLogger;
}

/**
 * Creates a mock ServiceContext for testing.
 * All dependencies are mocked with Vitest spy functions.
 *
 * @example
 * ```typescript
 * import { createMockServiceContext } from '../helpers/context';
 *
 * const mockCtx = createMockServiceContext();
 * await executeWorkflow(mockCtx, workflowId, input);
 *
 * expect(mockCtx.logger.info).toHaveBeenCalledWith('workflow_started', {
 *   workflow_id: workflowId
 * });
 * ```
 */
export function createMockServiceContext(
  options: CreateMockContextOptions = {},
): MockServiceContext {
  return {
    db: options.db ?? ({} as unknown as DrizzleD1Database),
    ai:
      options.ai ??
      ({
        run: vi.fn().mockResolvedValue({
          response: 'Mock AI response',
        }),
      } as unknown as Ai),
    logger: options.logger ?? createMockLogger(),
    executionContext: {} as ExecutionContext,
  };
}
