/**
 * Tests for AsyncOpManager
 *
 * Tests async operation tracking: creation, completion, failure, queries.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AsyncOpManager } from '../../src/operations/async';
import { createMockEmitter, createTestDb, type TestDb } from './helpers';

describe('AsyncOpManager', () => {
  let db: TestDb;
  let emitter: ReturnType<typeof createMockEmitter>;
  let manager: AsyncOpManager;

  beforeEach(() => {
    db = createTestDb();
    emitter = createMockEmitter();
    manager = new AsyncOpManager(db as never, emitter as never);
  });

  describe('track', () => {
    it('creates async operation with pending status', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'workflow_abc',
      });

      const op = manager.get(opId);
      expect(op).not.toBeNull();
      expect(op!.turnId).toBe('turn_1');
      expect(op!.targetType).toBe('workflow');
      expect(op!.targetId).toBe('workflow_abc');
      expect(op!.status).toBe('pending');
    });

    it('tracks task operations', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'task',
        targetId: 'task_search',
      });

      const op = manager.get(opId);
      expect(op!.targetType).toBe('task');
    });

    it('tracks agent operations', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'agent',
        targetId: 'agent_architect',
      });

      const op = manager.get(opId);
      expect(op!.targetType).toBe('agent');
    });

    it('emits trace event on track', () => {
      manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'workflow_abc',
      });

      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0].type).toBe('operation.async.tracked');
    });
  });

  describe('get', () => {
    it('returns null for non-existent operation', () => {
      const op = manager.get('nonexistent');
      expect(op).toBeNull();
    });
  });

  describe('complete', () => {
    it('marks operation as completed with result', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'workflow_abc',
      });

      const result = manager.complete(opId, { output: 'success' });

      expect(result).toBe(true);
      const op = manager.get(opId);
      expect(op!.status).toBe('completed');
      expect(op!.result).toEqual({ output: 'success' });
      expect(op!.completedAt).not.toBeNull();
    });

    it('returns false for non-existent operation', () => {
      const result = manager.complete('nonexistent', {});
      expect(result).toBe(false);
    });

    it('returns false for already completed operation', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'workflow_abc',
      });
      manager.complete(opId, {});

      const result = manager.complete(opId, { other: 'data' });
      expect(result).toBe(false);
    });

    it('returns false for failed operation', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'workflow_abc',
      });
      manager.fail(opId, { error: 'failed' });

      const result = manager.complete(opId, {});
      expect(result).toBe(false);
    });
  });

  describe('fail', () => {
    it('marks operation as failed with error', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'workflow_abc',
      });

      const result = manager.fail(opId, { code: 'TIMEOUT', message: 'Operation timed out' });

      expect(result).toBe(true);
      const op = manager.get(opId);
      expect(op!.status).toBe('failed');
      expect(op!.result).toEqual({ code: 'TIMEOUT', message: 'Operation timed out' });
      expect(op!.completedAt).not.toBeNull();
    });

    it('returns false for non-existent operation', () => {
      const result = manager.fail('nonexistent', {});
      expect(result).toBe(false);
    });

    it('returns false for already failed operation', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'workflow_abc',
      });
      manager.fail(opId, { error: 'first' });

      const result = manager.fail(opId, { error: 'second' });
      expect(result).toBe(false);
    });
  });

  describe('getPending', () => {
    it('returns only pending operations for turn', () => {
      const op1 = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'wf_1',
      });
      const op2 = manager.track({
        turnId: 'turn_1',
        targetType: 'task',
        targetId: 'task_1',
      });
      manager.track({
        turnId: 'turn_2', // different turn
        targetType: 'agent',
        targetId: 'agent_1',
      });

      manager.complete(op1, {});

      const pending = manager.getPending('turn_1');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(op2);
    });
  });

  describe('getForTurn', () => {
    it('returns all operations for turn regardless of status', () => {
      const op1 = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'wf_1',
      });
      const op2 = manager.track({
        turnId: 'turn_1',
        targetType: 'task',
        targetId: 'task_1',
      });

      manager.complete(op1, {});
      manager.fail(op2, {});

      const ops = manager.getForTurn('turn_1');
      expect(ops).toHaveLength(2);
    });
  });

  describe('hasPending', () => {
    it('returns true when turn has pending operations', () => {
      manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'wf_1',
      });

      expect(manager.hasPending('turn_1')).toBe(true);
    });

    it('returns false when all operations completed', () => {
      const opId = manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'wf_1',
      });
      manager.complete(opId, {});

      expect(manager.hasPending('turn_1')).toBe(false);
    });

    it('returns false for turn with no operations', () => {
      expect(manager.hasPending('turn_no_ops')).toBe(false);
    });
  });

  describe('getPendingCount', () => {
    it('counts pending operations', () => {
      manager.track({
        turnId: 'turn_1',
        targetType: 'workflow',
        targetId: 'wf_1',
      });
      manager.track({
        turnId: 'turn_1',
        targetType: 'task',
        targetId: 'task_1',
      });
      const op3 = manager.track({
        turnId: 'turn_1',
        targetType: 'agent',
        targetId: 'agent_1',
      });

      manager.complete(op3, {});

      expect(manager.getPendingCount('turn_1')).toBe(2);
    });
  });
});
