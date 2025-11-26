/** Unit tests for execution service */

import type { SchemaType } from '@wonder/schema';
import { ulid } from 'ulid';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as aiRepo from '~/domains/ai/repository';
import * as effectsRepo from '~/domains/effects/repository';
import * as eventsRepo from '~/domains/events/repository';
import * as execRepo from '~/domains/execution/repository';
import * as executionService from '~/domains/execution/service';
import * as graphRepo from '~/domains/graph/repository';
import { NotFoundError, ValidationError } from '~/errors';
import { createMockServiceContext, type MockServiceContext } from '../../helpers/context';

// Mock all repository modules
vi.mock('~/domains/graph/repository');
vi.mock('~/domains/ai/repository');
vi.mock('~/domains/effects/repository');
vi.mock('~/domains/execution/repository');
vi.mock('~/domains/events/repository');

describe('Execution Service', () => {
  let mockCtx: MockServiceContext;

  // Test IDs
  const workspaceId = ulid();
  const projectId = ulid();
  const workflowId = ulid();
  const workflowDefId = ulid();
  const nodeId = ulid();
  const actionId = ulid();
  const promptSpecId = ulid();
  const modelProfileId = ulid();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ServiceContext
    mockCtx = createMockServiceContext({
      ai: {
        run: vi.fn().mockResolvedValue({
          response: 'This is a summary of the input text.',
        }),
      } as unknown as Ai,
    });
  });

  describe('executeWorkflow', () => {
    it('should execute a single-node workflow successfully', async () => {
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

      // Mock node
      const node = {
        id: nodeId,
        workflow_def_id: workflowDefId,
        name: 'Summarize',
        action_id: actionId,
        input_mapping: { input_text: 'input.text' },
        output_mapping: { summary: 'response' },
        fan_out: 'first_match' as const,
        fan_in: 'any' as const,
        joins_node: null,
        merge: null,
        on_early_complete: null,
      };

      // Mock action
      const action = {
        id: actionId,
        name: 'Summarize Text',
        description: 'Summarize the input text',
        version: 1,
        kind: 'llm_call' as const,
        implementation: {
          prompt_spec_id: promptSpecId,
          model_profile_id: modelProfileId,
        },
        requires: null,
        produces: null,
        execution: null,
        idempotency: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock prompt spec
      const promptSpec = {
        id: promptSpecId,
        name: 'Summarize Prompt',
        description: 'Summarization prompt',
        version: 1,
        system_prompt: 'You are a helpful assistant.',
        template: 'Summarize: {{input_text}}',
        template_language: 'handlebars' as const,
        requires: [],
        produces: [],
        examples: null,
        tags: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock model profile
      const modelProfile = {
        id: modelProfileId,
        name: 'Llama 3 8B',
        provider: 'cloudflare' as const,
        model_id: '@cf/meta/llama-3-8b-instruct',
        parameters: {},
        execution_config: null,
        cost_per_1k_input_tokens: 0.0,
        cost_per_1k_output_tokens: 0.0,
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
        durable_object_id: ulid(),
        latest_snapshot: null,
        parent_run_id: null,
        parent_node_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      // Mock initial token
      const tokenId = ulid();
      const initialToken = {
        id: tokenId,
        workflow_run_id: workflowRunId,
        node_id: nodeId,
        status: 'active' as const,
        path_id: workflowRunId,
        parent_token_id: null,
        fan_out_node_id: null,
        branch_index: 0,
        branch_total: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Setup mocks
      (graphRepo.getWorkflow as Mock).mockResolvedValue(workflow);
      (graphRepo.getWorkflowDef as Mock).mockResolvedValue(workflowDef);
      (graphRepo.getNode as Mock).mockResolvedValue(node);
      (graphRepo.listTransitionsByWorkflowDef as Mock).mockResolvedValue([]);
      (effectsRepo.getAction as Mock).mockResolvedValue(action);
      (aiRepo.getPromptSpec as Mock).mockResolvedValue(promptSpec);
      (aiRepo.getModelProfile as Mock).mockResolvedValue(modelProfile);
      (execRepo.createWorkflowRun as Mock).mockResolvedValue(workflowRun);
      (execRepo.createToken as Mock).mockResolvedValue(initialToken);
      (execRepo.getWorkflowRun as Mock).mockResolvedValue({
        ...workflowRun,
        status: 'completed',
        context: JSON.stringify({
          input,
          state: { summary: 'This is a summary of the input text.' },
          output: { summary: 'This is a summary of the input text.' },
          artifacts: {},
        }),
        completed_at: new Date().toISOString(),
      });
      (execRepo.updateWorkflowRunContext as Mock).mockResolvedValue(undefined);
      (execRepo.updateWorkflowRunStatus as Mock).mockResolvedValue(undefined);
      (eventsRepo.createEvents as Mock).mockResolvedValue(undefined);

      // Execute
      const result = await executionService.executeWorkflow(mockCtx, workflowId, input);

      // Assertions
      expect(result.status).toBe('completed');
      expect(result.completed_at).toBeDefined();

      const context = JSON.parse(result.context as string);
      expect(context.input).toEqual(input);
      expect(context.output).toBeDefined();
      expect(context.output.summary).toBe('This is a summary of the input text.');

      // Verify AI was called
      expect(mockCtx.ai.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Summarize: Long article about climate change...' },
        ],
      });

      // Verify events were created
      expect(eventsRepo.createEvents).toHaveBeenCalled();
      const eventsCall = (eventsRepo.createEvents as Mock).mock.calls[0];
      const events = eventsCall[1];

      expect(events).toHaveLength(4);
      expect(events[0].kind).toBe('workflow_started');
      expect(events[1].kind).toBe('node_started');
      expect(events[2].kind).toBe('node_completed');
      expect(events[3].kind).toBe('workflow_completed');

      // Verify sequence numbers are monotonic
      expect(events[0].sequence_number).toBe(1);
      expect(events[1].sequence_number).toBe(2);
      expect(events[2].sequence_number).toBe(3);
      expect(events[3].sequence_number).toBe(4);
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

      const inputSchema: Record<string, SchemaType> = {
        text: { type: 'string' },
      };

      const workflowDef = {
        id: workflowDefId,
        name: 'Summarization Workflow',
        description: 'Summarize text',
        version: 1,
        owner: { type: 'project' as const, project_id: projectId },
        tags: [],
        input_schema: inputSchema,
        output_schema: { summary: { type: 'string' } },
        context_schema: null,
        initial_node_id: nodeId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (graphRepo.getWorkflow as Mock).mockResolvedValue(workflow);
      (graphRepo.getWorkflowDef as Mock).mockResolvedValue(workflowDef);

      await expect(
        executionService.executeWorkflow(mockCtx, workflowId, invalidInput),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw error if workflow not found', async () => {
      (graphRepo.getWorkflow as Mock).mockResolvedValue(null);

      await expect(executionService.executeWorkflow(mockCtx, workflowId, {})).rejects.toThrow(
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

      await expect(executionService.executeWorkflow(mockCtx, workflowId, {})).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
