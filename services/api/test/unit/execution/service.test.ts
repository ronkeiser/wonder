/** Unit tests for execution service */

import type { SchemaType } from '@wonder/schema';
import { ulid } from 'ulid';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as execRepo from '~/domains/execution/repository';
import type { ExecutionServiceContext } from '~/domains/execution/service';
import * as executionService from '~/domains/execution/service';
import * as graphRepo from '~/domains/graph/repository';
import { NotFoundError, ValidationError } from '~/errors';
import { createMockServiceContext, type MockServiceContext } from '../../helpers/context';

// Mock all repository modules
vi.mock('~/domains/graph/repository');
vi.mock('~/domains/execution/repository');

describe('Execution Service', () => {
  let mockCtx: ExecutionServiceContext;
  let mockDOStub: { fetch: Mock };
  let mockDOId: DurableObjectId;

  // Test IDs
  const workspaceId = ulid();
  const projectId = ulid();
  const workflowId = ulid();
  const workflowDefId = ulid();
  const nodeId = ulid();

  beforeEach(() => {
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

    // Mock ServiceContext with DO namespace
    const baseCtx = createMockServiceContext();
    mockCtx = {
      ...baseCtx,
      WORKFLOW_COORDINATOR: {
        newUniqueId: vi.fn().mockReturnValue(mockDOId),
        get: vi.fn().mockReturnValue(mockDOStub),
        idFromString: vi.fn(),
        idFromName: vi.fn(),
      } as unknown as DurableObjectNamespace,
    };
  });

  describe('triggerWorkflow', () => {
    it('should trigger a workflow and return run with status=running', async () => {
      const input = { text: 'Long article about climate change...' };

      // Mock workflow
      const workflow = {
        id: workflowId,
        project_id: projectId,
        name: 'Test Workflow',
        description: 'Test workflow',
        workflow_def_id: workflowDefId,
        pinned_version: null,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock workflow definition
      const inputSchema: SchemaType = {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      };
      const outputSchema: SchemaType = {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
        required: ['summary'],
      };

      const workflowDef = {
        id: workflowDefId,
        name: 'Summarization Workflow',
        description: 'Summarize text',
        version: 1,
        owner: { type: 'project' as const, project_id: projectId },
        tags: [],
        input_schema: inputSchema,
        output_schema: outputSchema,
        context_schema: null,
        initial_node_id: nodeId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock workflow run
      const workflowRunId = ulid();
      const workflowRun = {
        id: workflowRunId,
        project_id: projectId,
        workflow_id: workflowId,
        workflow_def_id: workflowDefId,
        workflow_version: 1,
        status: 'running' as const,
        context: JSON.stringify({
          input,
          state: {},
          artifacts: {},
        }),
        active_tokens: JSON.stringify([]),
        durable_object_id: 'do_test_id_123',
        latest_snapshot: null,
        parent_run_id: null,
        parent_node_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      // Setup mocks
      (graphRepo.getWorkflow as Mock).mockResolvedValue(workflow);
      (graphRepo.getWorkflowDef as Mock).mockResolvedValue(workflowDef);
      (execRepo.createWorkflowRun as Mock).mockResolvedValue(workflowRun);

      // Execute
      const result = await executionService.triggerWorkflow(mockCtx, workflowId, input);

      // Assertions: triggerWorkflow returns immediately with status='running'
      expect(result.status).toBe('running');
      expect(result.durable_object_id).toBe('do_test_id_123');
      expect(result.completed_at).toBeNull();

      const context = JSON.parse(result.context as string);
      expect(context.input).toEqual(input);
      expect(context.state).toEqual({});
      expect(context.output).toBeUndefined();

      // Verify workflow run was created in D1
      expect(execRepo.createWorkflowRun).toHaveBeenCalledWith(mockCtx.db, {
        project_id: projectId,
        workflow_id: workflowId,
        workflow_def_id: workflowDefId,
        workflow_version: 1,
        status: 'running',
        context: expect.any(String),
        active_tokens: '[]',
        durable_object_id: 'do_test_id_123',
        parent_run_id: null,
        parent_node_id: null,
      });

      // Verify DO was invoked
      expect(mockCtx.WORKFLOW_COORDINATOR.newUniqueId).toHaveBeenCalled();
      expect(mockCtx.WORKFLOW_COORDINATOR.get).toHaveBeenCalledWith(mockDOId);
      expect(mockDOStub.fetch).toHaveBeenCalledWith(
        'https://do/execute',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('workflowRunId'),
        }),
      );
    });

    it('should validate input and reject invalid data', async () => {
      const invalidInput = { wrong_field: 'value' };

      const workflow = {
        id: workflowId,
        project_id: projectId,
        name: 'Test Workflow',
        description: 'Test workflow',
        workflow_def_id: workflowDefId,
        pinned_version: null,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const inputSchema: SchemaType = {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      };

      const workflowDef = {
        id: workflowDefId,
        name: 'Summarization Workflow',
        description: 'Summarize text',
        version: 1,
        owner: { type: 'project' as const, project_id: projectId },
        tags: [],
        input_schema: inputSchema,
        output_schema: { type: 'object', properties: { summary: { type: 'string' } } },
        context_schema: null,
        initial_node_id: nodeId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (graphRepo.getWorkflow as Mock).mockResolvedValue(workflow);
      (graphRepo.getWorkflowDef as Mock).mockResolvedValue(workflowDef);

      await expect(
        executionService.triggerWorkflow(mockCtx, workflowId, invalidInput),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw error if workflow not found', async () => {
      (graphRepo.getWorkflow as Mock).mockResolvedValue(null);

      await expect(executionService.triggerWorkflow(mockCtx, workflowId, {})).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should throw error if workflow definition not found', async () => {
      const workflow = {
        id: workflowId,
        project_id: projectId,
        name: 'Test Workflow',
        description: 'Test workflow',
        workflow_def_id: workflowDefId,
        pinned_version: null,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (graphRepo.getWorkflow as Mock).mockResolvedValue(workflow);
      (graphRepo.getWorkflowDef as Mock).mockResolvedValue(null);

      await expect(executionService.triggerWorkflow(mockCtx, workflowId, {})).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
