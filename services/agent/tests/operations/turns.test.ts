/**
 * Tests for TurnManager
 *
 * Tests turn lifecycle: creation, status transitions, and queries.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { TurnManager } from '../../src/operations/turns';
import type { Caller } from '../../src/types';
import { createMockEmitter, createTestDb, type TestDb } from './helpers';

describe('TurnManager', () => {
  let db: TestDb;
  let emitter: ReturnType<typeof createMockEmitter>;
  let manager: TurnManager;

  beforeEach(() => {
    db = createTestDb();
    emitter = createMockEmitter();
    // Cast to AgentDb - the interface is compatible for our tests
    manager = new TurnManager(db as never, emitter as never);
  });

  describe('create', () => {
    it('creates turn with user caller', () => {
      const caller: Caller = { type: 'user', userId: 'user_123' };

      const turnId = manager.create({
        conversationId: 'conv_1',
        caller,
        input: { message: 'hello' },
      });

      const turn = manager.get(turnId);
      expect(turn).not.toBeNull();
      expect(turn!.conversationId).toBe('conv_1');
      expect(turn!.callerType).toBe('user');
      expect(turn!.callerUserId).toBe('user_123');
      expect(turn!.status).toBe('active');
      expect(turn!.input).toEqual({ message: 'hello' });
    });

    it('creates turn with workflow caller', () => {
      const caller: Caller = { type: 'workflow', runId: 'run_456' };

      const turnId = manager.create({
        conversationId: 'conv_1',
        caller,
        input: { task: 'do something' },
      });

      const turn = manager.get(turnId);
      expect(turn!.callerType).toBe('workflow');
      expect(turn!.callerRunId).toBe('run_456');
    });

    it('creates turn with agent caller', () => {
      const caller: Caller = { type: 'agent', agentId: 'agent_789', turnId: 'turn_prev' };

      const turnId = manager.create({
        conversationId: 'conv_1',
        caller,
        input: { question: 'help me' },
      });

      const turn = manager.get(turnId);
      expect(turn!.callerType).toBe('agent');
      expect(turn!.callerAgentId).toBe('agent_789');
      expect(turn!.callerTurnId).toBe('turn_prev');
    });

    it('stores replyToMessageId when provided', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_123' },
        input: {},
        replyToMessageId: 'msg_xyz',
      });

      const turn = manager.get(turnId);
      expect(turn!.replyToMessageId).toBe('msg_xyz');
    });

    it('emits trace event on creation', () => {
      manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_123' },
        input: {},
      });

      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0].type).toBe('operation.turns.created');
    });
  });

  describe('get', () => {
    it('returns null for non-existent turn', () => {
      const turn = manager.get('nonexistent');
      expect(turn).toBeNull();
    });
  });

  describe('getActive', () => {
    it('returns only active turns for conversation', () => {
      const turn1 = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });
      const turn2 = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });
      manager.create({
        conversationId: 'conv_2', // different conversation
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      manager.complete(turn1);

      const active = manager.getActive('conv_1');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(turn2);
    });
  });

  describe('getRecent', () => {
    it('returns turns with limit applied', () => {
      manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: { seq: 1 },
      });
      manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: { seq: 2 },
      });
      manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: { seq: 3 },
      });

      const recent = manager.getRecent('conv_1', 2);
      expect(recent).toHaveLength(2);
      // All 3 turns exist, we get 2 of them
      const allTurns = manager.getRecent('conv_1', 10);
      expect(allTurns).toHaveLength(3);
    });
  });

  describe('linkContextAssembly', () => {
    it('links context assembly run to turn', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      manager.linkContextAssembly(turnId, 'run_context');

      const turn = manager.get(turnId);
      expect(turn!.contextAssemblyRunId).toBe('run_context');
    });
  });

  describe('linkMemoryExtraction', () => {
    it('links memory extraction run to turn', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      manager.linkMemoryExtraction(turnId, 'run_memory');

      const turn = manager.get(turnId);
      expect(turn!.memoryExtractionRunId).toBe('run_memory');
    });
  });

  describe('complete', () => {
    it('marks turn as completed', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      const result = manager.complete(turnId);

      expect(result).toBe(true);
      const turn = manager.get(turnId);
      expect(turn!.status).toBe('completed');
      expect(turn!.completedAt).not.toBeNull();
    });

    it('stores issues on completion', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      manager.complete(turnId, { memoryExtractionFailed: true, toolFailures: 2 });

      const turn = manager.get(turnId);
      expect(turn!.memoryExtractionFailed).toBe(true);
      expect(turn!.toolFailureCount).toBe(2);
    });

    it('returns false for already completed turn', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      manager.complete(turnId);
      const result = manager.complete(turnId);

      expect(result).toBe(false);
    });

    it('returns false for non-existent turn', () => {
      const result = manager.complete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('fail', () => {
    it('marks turn as failed', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      const result = manager.fail(turnId, 'CONTEXT_ASSEMBLY_FAILED', 'Could not assemble context');

      expect(result).toBe(true);
      const turn = manager.get(turnId);
      expect(turn!.status).toBe('failed');
      expect(turn!.completedAt).not.toBeNull();
    });

    it('returns false for already failed turn', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      manager.fail(turnId, 'ERROR', 'first failure');
      const result = manager.fail(turnId, 'ERROR', 'second failure');

      expect(result).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('returns false for active turn', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });

      expect(manager.isTerminal(turnId)).toBe(false);
    });

    it('returns true for completed turn', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });
      manager.complete(turnId);

      expect(manager.isTerminal(turnId)).toBe(true);
    });

    it('returns true for failed turn', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_1' },
        input: {},
      });
      manager.fail(turnId, 'ERROR', 'failed');

      expect(manager.isTerminal(turnId)).toBe(true);
    });
  });

  describe('reconstructCaller', () => {
    it('reconstructs user caller', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'user', userId: 'user_123' },
        input: {},
      });

      const turn = manager.get(turnId)!;
      const caller = manager.reconstructCaller(turn);

      expect(caller).toEqual({ type: 'user', userId: 'user_123' });
    });

    it('reconstructs workflow caller', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'workflow', runId: 'run_456' },
        input: {},
      });

      const turn = manager.get(turnId)!;
      const caller = manager.reconstructCaller(turn);

      expect(caller).toEqual({ type: 'workflow', runId: 'run_456' });
    });

    it('reconstructs agent caller', () => {
      const turnId = manager.create({
        conversationId: 'conv_1',
        caller: { type: 'agent', agentId: 'agent_789', turnId: 'turn_prev' },
        input: {},
      });

      const turn = manager.get(turnId)!;
      const caller = manager.reconstructCaller(turn);

      expect(caller).toEqual({ type: 'agent', agentId: 'agent_789', turnId: 'turn_prev' });
    });
  });
});
