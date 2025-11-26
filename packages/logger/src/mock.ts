/** Mock logger for testing */

import { vi } from 'vitest';
import type { Logger } from './types.js';

export interface MockLogger extends Logger {
  child: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  fatal: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock logger for testing with Vitest spy functions.
 * All methods are no-ops but can be asserted against in tests.
 *
 * @example
 * ```typescript
 * import { createMockLogger } from '@wonder/logger/mock';
 *
 * const mockLogger = createMockLogger();
 * const ctx = { db, ai, logger: mockLogger };
 *
 * await executeWorkflow(ctx, workflowId, input);
 *
 * expect(mockLogger.info).toHaveBeenCalledWith('workflow_started', {
 *   workflow_id: workflowId
 * });
 * ```
 */
export function createMockLogger(): MockLogger {
  const mockLogger: MockLogger = {
    child: vi.fn().mockReturnValue(undefined as unknown as MockLogger),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };

  // Make child() return a new mock logger that also has spy functions
  mockLogger.child.mockImplementation(() => createMockLogger());

  return mockLogger;
}
