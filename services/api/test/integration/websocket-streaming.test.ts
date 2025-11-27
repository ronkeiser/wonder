/** Test WebSocket event streaming from WorkflowCoordinator */

import { createMockLogger } from '@wonder/logger/mock';
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExecutionServiceContext } from '~/domains/execution/service';
import { startWorkflow } from '~/domains/execution/service';
import { createTestDb } from '../helpers/db';
import { migrate, seed } from '../helpers/migrate';

// Skipping these tests due to Cloudflare Workers test framework limitation:
// Durable Objects with SQLite storage cannot be properly cleaned up in isolated tests.
// The WebSocket streaming functionality is verified via manual testing with test-websocket.html
// See: https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#isolated-storage
describe.skip('WebSocket Event Streaming', () => {
  let ctx: ExecutionServiceContext;

  beforeEach(async () => {
    const db = createTestDb();
    await migrate(db);
    await seed(db);

    ctx = {
      db,
      ai: env.AI,
      logger: createMockLogger(),
      WORKFLOW_COORDINATOR: env.WORKFLOW_COORDINATOR,
      executionContext: {
        waitUntil: () => {},
        passThroughOnException: () => {},
        exports: {},
        props: {},
      } as unknown as ExecutionContext,
    };
  });

  it('should start workflow and verify DO binding exists', async () => {
    const workflowRun = await startWorkflow(ctx, '01JDXSEED0000WORKFLOW0001', {
      name: 'Alice',
    });

    expect(workflowRun).toBeDefined();
    expect(workflowRun.durable_object_id).toBeDefined();
    expect(workflowRun.status).toBe('running');

    const doId = env.WORKFLOW_COORDINATOR.idFromString(workflowRun.durable_object_id);
    const stub = env.WORKFLOW_COORDINATOR.get(doId);
    expect(stub).toBeDefined();
  });

  it('should validate DO WebSocket endpoint is accessible', () => {
    expect(env.WORKFLOW_COORDINATOR).toBeDefined();

    const doId = env.WORKFLOW_COORDINATOR.newUniqueId();
    const stub = env.WORKFLOW_COORDINATOR.get(doId);

    expect(stub).toBeDefined();
    expect(stub.fetch).toBeInstanceOf(Function);
  });
});
