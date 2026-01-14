/**
 * Tests for applyDecisions
 *
 * Verifies that each decision type routes to the correct manager method.
 * Uses mock managers to verify call arguments.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyDecisions } from '../../src/dispatch/apply';
import type { DispatchContext } from '../../src/dispatch/context';
import type { AgentDecision } from '../../src/types';

/**
 * Create a mock RPC service that returns chainable promise-like objects.
 */
function createMockRpcService() {
  const mockMethod = () => ({
    then: vi.fn().mockReturnValue(Promise.resolve()),
    catch: vi.fn().mockReturnValue(Promise.resolve()),
  });
  return {
    create: mockMethod,
    complete: mockMethod,
    fail: mockMethod,
  };
}

/**
 * Create a mock dispatch context with spied managers.
 */
function createMockContext(): DispatchContext {
  const mockTurnsRpc = createMockRpcService();

  return {
    turns: {
      create: vi.fn().mockReturnValue('turn_created'),
      complete: vi.fn().mockReturnValue(true),
      fail: vi.fn().mockReturnValue(true),
      linkMemoryExtraction: vi.fn().mockReturnValue(true),
    } as never,
    messages: {
      append: vi.fn().mockReturnValue('msg_created'),
    } as never,
    moves: {
      record: vi.fn().mockReturnValue(0),
      recordResult: vi.fn().mockReturnValue(true),
    } as never,
    asyncOps: {
      track: vi.fn().mockReturnValue('op_created'),
      complete: vi.fn().mockReturnValue(true),
      fail: vi.fn().mockReturnValue(true),
      markWaiting: vi.fn().mockReturnValue(true),
      resume: vi.fn().mockReturnValue(true),
    } as never,
    participants: {
      add: vi.fn().mockReturnValue(true),
    } as never,
    emitter: {
      emitTrace: vi.fn(),
    } as never,
    conversationId: 'conv_test',
    waitUntil: vi.fn(),
    scheduleAlarm: vi.fn().mockResolvedValue(undefined),
    resources: {
      turns: vi.fn().mockReturnValue(mockTurnsRpc),
      workflowRuns: vi.fn().mockReturnValue({
        create: vi.fn().mockResolvedValue({ workflowRunId: 'wfr_test' }),
      }),
    } as never,
    executor: {
      executeTaskForAgent: vi.fn().mockResolvedValue(undefined),
    } as never,
    coordinator: {
      idFromName: vi.fn().mockReturnValue('coord_id'),
      get: vi.fn().mockReturnValue({
        start: vi.fn().mockResolvedValue(undefined),
      }),
    } as never,
    agent: {
      idFromName: vi.fn().mockReturnValue('agent_id'),
      get: vi.fn().mockReturnValue({
        startTurn: vi.fn().mockResolvedValue(undefined),
      }),
    } as never,
  };
}

describe('applyDecisions', () => {
  let ctx: DispatchContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  describe('START_TURN', () => {
    it('calls turns.create with correct params', () => {
      const decision: AgentDecision = {
        type: 'START_TURN',
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: { message: 'hello' },
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.turns.create).toHaveBeenCalledWith({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: { message: 'hello' },
      });
      expect(result.applied).toBe(1);
      expect(result.turnsCreated).toEqual(['turn_created']);
    });
  });

  describe('COMPLETE_TURN', () => {
    it('calls turns.complete with turnId and issues', () => {
      const decision: AgentDecision = {
        type: 'COMPLETE_TURN',
        turnId: 'turn_1',
        issues: { memoryExtractionFailed: true, toolFailures: 2 },
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.turns.complete).toHaveBeenCalledWith('turn_1', {
        memoryExtractionFailed: true,
        toolFailures: 2,
      });
      expect(result.applied).toBe(1);
    });

    it('calls turns.complete without issues', () => {
      const decision: AgentDecision = {
        type: 'COMPLETE_TURN',
        turnId: 'turn_1',
      };

      applyDecisions([decision], ctx);

      expect(ctx.turns.complete).toHaveBeenCalledWith('turn_1', undefined);
    });
  });

  describe('FAIL_TURN', () => {
    it('calls turns.fail with error details', () => {
      const decision: AgentDecision = {
        type: 'FAIL_TURN',
        turnId: 'turn_1',
        error: { code: 'CONTEXT_ASSEMBLY_FAILED', message: 'Could not assemble context' },
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.turns.fail).toHaveBeenCalledWith(
        'turn_1',
        'CONTEXT_ASSEMBLY_FAILED',
        'Could not assemble context',
      );
      expect(result.applied).toBe(1);
    });
  });

  describe('APPEND_MESSAGE', () => {
    it('calls messages.append with correct params', () => {
      const decision: AgentDecision = {
        type: 'APPEND_MESSAGE',
        turnId: 'turn_1',
        role: 'agent',
        content: 'Hello, how can I help?',
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.messages.append).toHaveBeenCalledWith({
        conversationId: 'conv_test', // from context
        turnId: 'turn_1',
        role: 'agent',
        content: 'Hello, how can I help?',
      });
      expect(result.applied).toBe(1);
    });
  });

  describe('ASYNC_OP_COMPLETED', () => {
    it('calls asyncOps.complete on success', () => {
      const decision: AgentDecision = {
        type: 'ASYNC_OP_COMPLETED',
        turnId: 'turn_1',
        operationId: 'op_123',
        result: {
          toolCallId: 'call_1',
          success: true,
          result: { data: 'output' },
        },
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.asyncOps.complete).toHaveBeenCalledWith('op_123', { data: 'output' });
      expect(ctx.asyncOps.fail).not.toHaveBeenCalled();
      expect(result.applied).toBe(1);
    });

    it('calls asyncOps.fail on failure', () => {
      const decision: AgentDecision = {
        type: 'ASYNC_OP_COMPLETED',
        turnId: 'turn_1',
        operationId: 'op_123',
        result: {
          toolCallId: 'call_1',
          success: false,
          error: { code: 'TIMEOUT', message: 'Timed out', retriable: true },
        },
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.asyncOps.fail).toHaveBeenCalledWith('op_123', {
        code: 'TIMEOUT',
        message: 'Timed out',
        retriable: true,
      });
      expect(ctx.asyncOps.complete).not.toHaveBeenCalled();
      expect(result.applied).toBe(1);
    });
  });

  describe('DISPATCH_TASK', () => {
    it('emits trace event', () => {
      const decision: AgentDecision = {
        type: 'DISPATCH_TASK',
        turnId: 'turn_1',
        toolCallId: 'call_1',
        taskId: 'task_search',
        input: { query: 'find files' },
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.emitter.emitTrace).toHaveBeenCalledWith({
        type: 'dispatch.task.queued',
        payload: {
          turnId: 'turn_1',
          toolCallId: 'call_1',
          taskId: 'task_search',
        },
      });
      expect(result.applied).toBe(1);
    });
  });

  describe('DISPATCH_WORKFLOW', () => {
    it('emits trace event', () => {
      const decision: AgentDecision = {
        type: 'DISPATCH_WORKFLOW',
        turnId: 'turn_1',
        toolCallId: 'call_1',
        workflowId: 'wf_process',
        input: { data: 'process this' },
        async: true,
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.emitter.emitTrace).toHaveBeenCalledWith({
        type: 'dispatch.workflow.queued',
        payload: {
          turnId: 'turn_1',
          toolCallId: 'call_1',
          workflowId: 'wf_process',
          async: true,
        },
      });
      expect(result.applied).toBe(1);
    });
  });

  describe('DISPATCH_AGENT', () => {
    it('emits trace event', () => {
      const decision: AgentDecision = {
        type: 'DISPATCH_AGENT',
        turnId: 'turn_1',
        toolCallId: 'call_1',
        agentId: 'agent_helper',
        input: { question: 'help me' },
        mode: 'delegate',
        async: false,
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.emitter.emitTrace).toHaveBeenCalledWith({
        type: 'dispatch.agent.queued',
        payload: {
          turnId: 'turn_1',
          toolCallId: 'call_1',
          agentId: 'agent_helper',
          mode: 'delegate',
          async: false,
        },
      });
      expect(result.applied).toBe(1);
    });
  });

  describe('DISPATCH_CONTEXT_ASSEMBLY', () => {
    it('emits trace event', () => {
      const decision: AgentDecision = {
        type: 'DISPATCH_CONTEXT_ASSEMBLY',
        turnId: 'turn_1',
        workflowId: 'wf_context',
        input: {
          conversationId: 'conv_1',
          userMessage: 'hello',
          recentTurns: [],
          modelProfileId: 'gpt-4',
          toolIds: ['search'],
        },
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.emitter.emitTrace).toHaveBeenCalledWith({
        type: 'dispatch.context_assembly.queued',
        payload: {
          turnId: 'turn_1',
          workflowId: 'wf_context',
        },
      });
      expect(result.applied).toBe(1);
    });
  });

  describe('DISPATCH_MEMORY_EXTRACTION', () => {
    it('emits trace event', () => {
      const decision: AgentDecision = {
        type: 'DISPATCH_MEMORY_EXTRACTION',
        turnId: 'turn_1',
        workflowId: 'wf_memory',
        input: {
          agentId: 'agent_1',
          turnId: 'turn_1',
          transcript: [],
        },
      };

      const result = applyDecisions([decision], ctx);

      expect(ctx.emitter.emitTrace).toHaveBeenCalledWith({
        type: 'dispatch.memory_extraction.queued',
        payload: {
          turnId: 'turn_1',
          workflowId: 'wf_memory',
        },
      });
      expect(result.applied).toBe(1);
    });
  });

  describe('multiple decisions', () => {
    it('applies all decisions in order', () => {
      const decisions: AgentDecision[] = [
        {
          type: 'START_TURN',
          conversationId: 'conv_1',
          caller: { type: 'user', userId: 'user_1' },
          input: {},
        },
        {
          type: 'APPEND_MESSAGE',
          turnId: 'turn_1',
          role: 'user',
          content: 'hello',
        },
        {
          type: 'APPEND_MESSAGE',
          turnId: 'turn_1',
          role: 'agent',
          content: 'hi there',
        },
      ];

      const result = applyDecisions(decisions, ctx);

      expect(result.applied).toBe(3);
      expect(ctx.turns.create).toHaveBeenCalledTimes(1);
      expect(ctx.messages.append).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('continues after error (fail-soft)', () => {
      (ctx.turns.create as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('DB error');
      });

      const decisions: AgentDecision[] = [
        {
          type: 'START_TURN',
          conversationId: 'conv_1',
          caller: { type: 'user', userId: 'user_1' },
          input: {},
        },
        {
          type: 'APPEND_MESSAGE',
          turnId: 'turn_1',
          role: 'user',
          content: 'hello',
        },
      ];

      const result = applyDecisions(decisions, ctx);

      expect(result.applied).toBe(1); // Second decision succeeded
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].decision.type).toBe('START_TURN');
      expect(result.errors[0].error.message).toBe('DB error');
    });
  });
});
