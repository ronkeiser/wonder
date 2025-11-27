/** Test WebSocket event streaming from WorkflowCoordinator */

import { createMockLogger } from '@wonder/logger/mock';
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExecutionServiceContext } from '~/domains/execution/service';
import { startWorkflow } from '~/domains/execution/service';
import { createTestDb } from '../helpers/db';
import { migrate, seed } from '../helpers/migrate';

describe('WebSocket Event Streaming', () => {
  let ctx: ExecutionServiceContext;
  let openSockets: WebSocket[] = [];

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

    openSockets = [];
  });

  afterEach(async () => {
    // Close all WebSockets
    for (const ws of openSockets) {
      try {
        ws.close();
      } catch {
        // Ignore errors
      }
    }
    // Give time for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should stream events during workflow execution', async () => {
    // Start a workflow execution using the seeded workflow ID
    const workflowRun = await startWorkflow(ctx, '01JDXSEED0000WORKFLOW0001', {
      name: 'Alice',
    });

    expect(workflowRun).toBeDefined();
    expect(workflowRun.durable_object_id).toBeDefined();

    // Connect WebSocket to the DO running this workflow
    const doId = env.WORKFLOW_COORDINATOR.idFromString(workflowRun.durable_object_id);
    const stub = env.WORKFLOW_COORDINATOR.get(doId);

    const upgradeRequest = new Request('https://do/stream', {
      headers: { Upgrade: 'websocket' },
    });

    const response = await stub.fetch(upgradeRequest);
    expect(response.status).toBe(101);
    expect(response.webSocket).toBeDefined();

    // Collect events from WebSocket
    const receivedEvents: any[] = [];
    const ws = response.webSocket!;

    const eventPromise = new Promise<void>((resolve) => {
      // Collect events for 1 second then resolve
      // (Queue consumer doesn't run in test env, so we won't get completion)
      const timeout = setTimeout(() => {
        resolve();
      }, 1000);

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data as string);
          receivedEvents.push(data);

          // If we somehow get workflow_completed, resolve early
          if (data.kind === 'workflow_completed') {
            clearTimeout(timeout);
            resolve();
          }
        } catch (err) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    ws.accept();
    openSockets.push(ws);

    // Wait for events to arrive
    await eventPromise;

    // Verify we received events via WebSocket
    expect(receivedEvents.length).toBeGreaterThan(0);

    // Verify workflow_started event was streamed
    const workflowStarted = receivedEvents.find((e) => e.kind === 'workflow_started');
    expect(workflowStarted).toBeDefined();
    expect(workflowStarted.payload.workflow_run_id).toBe(workflowRun.id);

    // Verify event structure
    expect(workflowStarted.kind).toBe('workflow_started');
    expect(workflowStarted.timestamp).toBeDefined();
    expect(workflowStarted.payload).toBeDefined();
  }, 10000);

  it('should validate DO WebSocket endpoint is accessible', () => {
    expect(env.WORKFLOW_COORDINATOR).toBeDefined();

    const doId = env.WORKFLOW_COORDINATOR.newUniqueId();
    const stub = env.WORKFLOW_COORDINATOR.get(doId);

    expect(stub).toBeDefined();
    expect(stub.fetch).toBeInstanceOf(Function);
  });
});
