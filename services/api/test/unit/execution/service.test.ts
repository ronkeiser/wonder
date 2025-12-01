/** Integration tests for execution service using real miniflare D1 */

import { createMockLogger } from '@wonder/logger/mock';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as executionService from '~/domains/execution/service';
import { NotFoundError, ValidationError } from '~/errors';
import type { ServiceContext } from '~/infrastructure/context';
import { workflow_runs } from '~/infrastructure/db/schema';
import { createTestDb } from '../../helpers/db';

// Seed data IDs from seed.sql
const SEED_WORKSPACE_ID = '01JDXSEED0000WORKSPACE00001';
const SEED_PROJECT_ID = '01JDXSEED0000PROJECT000001';
const SEED_WORKFLOW_ID = '01JDXSEED0000WORKFLOW0001';
const SEED_WORKFLOW_DEF_ID = '01JDXSEED0000WORKFLOWDEF1';

describe('Execution Service', () => {
  let mockCtx: ServiceContext;
  let mockDOStub: { fetch: Mock };
  let mockDOId: DurableObjectId;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock Durable Object ID
    mockDOId = {
      toString: vi.fn().mockReturnValue('do_test_id_123'),
    } as unknown as DurableObjectId;

    // Mock Durable Object stub
    mockDOStub = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    };

    // Real DB from miniflare, mocked DO namespace, AI, and logger
    mockCtx = {
      db: createTestDb(),
      logger: createMockLogger(),
      ai: {
        run: vi.fn().mockResolvedValue({ response: 'Mock AI response' }),
      } as unknown as Ai,
      executionContext: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      } as unknown as ExecutionContext,
      do: {
        newUniqueId: vi.fn().mockReturnValue(mockDOId),
        get: vi.fn().mockReturnValue(mockDOStub),
        idFromString: vi.fn(),
        idFromName: vi.fn(),
      } as unknown as Env['WORKFLOW_COORDINATOR'],
    } as ServiceContext;

    // Clean up any test runs from previous tests
    await mockCtx.db.delete(workflow_runs);

    // Apply seed data (passed as binding from vitest.config.ts)
    // Parse SQL statements properly handling multiline statements and comments
    const statements: string[] = [];
    let current = '';
    for (const line of env.TEST_SEED_SQL.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) continue; // Skip empty lines and comments
      current += ' ' + line;
      if (trimmed.endsWith(';')) {
        statements.push(current.trim().slice(0, -1)); // Remove trailing semicolon
        current = '';
      }
    }

    // Execute via batch for atomicity
    if (statements.length > 0) {
      await env.DB.batch(statements.map((s: string) => env.DB.prepare(s)));
    }
  });

  describe('startWorkflow', () => {
    it('should trigger a workflow and return run with status=running', async () => {
      // Use seed data: Hello World workflow that greets a user
      const input = { name: 'Alice' };

      // Execute - uses real DB with seed data
      const result = await executionService.startWorkflow(mockCtx, SEED_WORKFLOW_ID, input);

      // Assertions: startWorkflow returns immediately with status='running'
      expect(result.status).toBe('running');
      expect(result.durable_object_id).toBe('do_test_id_123');
      expect(result.completed_at).toBeUndefined(); // Not set yet
      expect(result.workflow_id).toBe(SEED_WORKFLOW_ID);
      expect(result.project_id).toBe(SEED_PROJECT_ID);

      const context = JSON.parse(result.context as string);
      expect(context.input).toEqual(input);
      expect(context.state).toEqual({});
      expect(context.output).toBeUndefined();

      // Verify workflow run was persisted in D1
      const runs = await mockCtx.db
        .select()
        .from(workflow_runs)
        .where(eq(workflow_runs.id, result.id));
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('running');

      // Verify DO was invoked
      expect(mockCtx.do.newUniqueId).toHaveBeenCalled();
      expect(mockCtx.do.get).toHaveBeenCalledWith(mockDOId);
      expect(mockDOStub.fetch).toHaveBeenCalledWith(
        'https://do/execute',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining(result.id),
        }),
      );
    });

    it('should validate input and reject invalid data', async () => {
      // Hello World workflow requires {name: string}
      const invalidInput = { wrong_field: 'value' };

      await expect(
        executionService.startWorkflow(mockCtx, SEED_WORKFLOW_ID, invalidInput),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw error if workflow not found', async () => {
      const nonExistentWorkflowId = '01FAKE00000WORKFLOW0001';

      await expect(
        executionService.startWorkflow(mockCtx, nonExistentWorkflowId, {}),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
