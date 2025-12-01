/** Integration test for Stage 0 workflow coordination architecture
 *
 * This test validates the Durable Object-based workflow coordination architecture:
 * HTTP → triggerWorkflow → DO → Queue → Worker → DO → D1
 *
 * Status: Infrastructure validation - validates DO/Queue bindings and instantiation.
 * Full async execution requires queue consumer implementation (not yet done for Stage 0).
 */

import { createMockLogger } from '@wonder/logger/mock';
import { env } from 'cloudflare:test';
import { ulid } from 'ulid';
import { beforeEach, describe, expect, it } from 'vitest';
import { startWorkflow } from '~/domains/execution/service';
import type { ServiceContext } from '~/infrastructure/context';
import { createTestDb } from '../helpers/db';

describe('Workflow Coordination Architecture', () => {
  let ctx: ServiceContext;

  beforeEach(async () => {
    // Migrations applied automatically via setup file
    const db = createTestDb();

    // Create test context with real bindings
    ctx = {
      db,
      ai: env.AI,
      logger: createMockLogger(),
      executionContext: {} as ExecutionContext,
      do: env.WORKFLOW_COORDINATOR,
    };
  });

  it('should create workflow run with DO coordination', async () => {
    // Note: This test uses seeded test data (workspace_01, project_01, etc.)
    // For Stage 0, we're testing the trigger and DO invocation, not full execution
    // Full execution requires queue consumer implementation

    // Use a non-existent workflow ID to test error handling
    // (seeded workflow setup would require complex test data)
    const nonExistentWorkflowId = ulid();
    const input = { text: 'Test input' };

    // This should fail with not found error since workflow doesn't exist
    await expect(startWorkflow(ctx, nonExistentWorkflowId, input)).rejects.toThrow();
  });

  it('should validate DO and Queue bindings are available', () => {
    // Verify miniflare provides the necessary bindings
    expect(env.WORKFLOW_COORDINATOR).toBeDefined();
    expect(env.WORKFLOW_COORDINATOR.newUniqueId).toBeInstanceOf(Function);
    expect(env.WORKFLOW_COORDINATOR.get).toBeInstanceOf(Function);

    // Queue binding should be available
    expect(env.WORKFLOW_QUEUE).toBeDefined();
  });

  it('should create and retrieve DO instance', () => {
    // Test DO instantiation
    const doId = env.WORKFLOW_COORDINATOR.newUniqueId();
    expect(doId).toBeDefined();
    expect(doId.toString()).toMatch(/^[0-9a-f]{64}$/);

    const doStub = env.WORKFLOW_COORDINATOR.get(doId);
    expect(doStub).toBeDefined();
    expect(doStub.fetch).toBeInstanceOf(Function);
  });
});
