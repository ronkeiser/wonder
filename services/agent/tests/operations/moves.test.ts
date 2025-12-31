/**
 * Tests for MoveManager
 *
 * Tests move tracking: recording, result updates, queries.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MoveManager } from '../../src/operations/moves';
import { createMockEmitter, createTestDb, type TestDb } from './helpers';

describe('MoveManager', () => {
  let db: TestDb;
  let emitter: ReturnType<typeof createMockEmitter>;
  let manager: MoveManager;

  beforeEach(() => {
    db = createTestDb();
    emitter = createMockEmitter();
    manager = new MoveManager(db as never, emitter as never);
  });

  describe('record', () => {
    it('creates move with reasoning only', () => {
      const sequence = manager.record({
        turnId: 'turn_1',
        reasoning: 'Let me search for that...',
      });

      expect(sequence).toBe(0);
      const moves = manager.getForTurn('turn_1');
      expect(moves).toHaveLength(1);
      expect(moves[0].reasoning).toBe('Let me search for that...');
      expect(moves[0].toolCallId).toBeNull();
    });

    it('creates move with tool call', () => {
      const sequence = manager.record({
        turnId: 'turn_1',
        reasoning: 'I will search the codebase',
        toolCall: {
          id: 'call_123',
          toolId: 'search',
          input: { query: 'auth handler' },
        },
      });

      expect(sequence).toBe(0);
      const moves = manager.getForTurn('turn_1');
      expect(moves[0].toolCallId).toBe('call_123');
      expect(moves[0].toolId).toBe('search');
      expect(moves[0].toolInput).toEqual({ query: 'auth handler' });
    });

    it('stores raw response for debugging', () => {
      manager.record({
        turnId: 'turn_1',
        reasoning: 'Parsed reasoning',
        raw: '{"full": "llm response", "tokens": 150}',
      });

      const moves = manager.getForTurn('turn_1');
      expect(moves[0].raw).toBe('{"full": "llm response", "tokens": 150}');
    });

    it('increments sequence for each move', () => {
      const seq1 = manager.record({ turnId: 'turn_1', reasoning: 'First' });
      const seq2 = manager.record({ turnId: 'turn_1', reasoning: 'Second' });
      const seq3 = manager.record({ turnId: 'turn_1', reasoning: 'Third' });

      expect(seq1).toBe(0);
      expect(seq2).toBe(1);
      expect(seq3).toBe(2);
    });

    it('sequences are independent per turn', () => {
      const seq1Turn1 = manager.record({ turnId: 'turn_1', reasoning: 'Turn 1 - Move 1' });
      const seq1Turn2 = manager.record({ turnId: 'turn_2', reasoning: 'Turn 2 - Move 1' });
      const seq2Turn1 = manager.record({ turnId: 'turn_1', reasoning: 'Turn 1 - Move 2' });

      expect(seq1Turn1).toBe(0);
      expect(seq1Turn2).toBe(0);
      expect(seq2Turn1).toBe(1);
    });

    it('emits trace event on record', () => {
      manager.record({
        turnId: 'turn_1',
        reasoning: 'Some reasoning',
        toolCall: { id: 'call_1', toolId: 'search', input: {} },
      });

      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0].type).toBe('operation.moves.recorded');
      expect((emitter.events[0].payload as { hasReasoning: boolean }).hasReasoning).toBe(true);
      expect((emitter.events[0].payload as { hasToolCall: boolean }).hasToolCall).toBe(true);
    });
  });

  describe('get', () => {
    it('returns null for non-existent move', () => {
      const move = manager.get('nonexistent');
      expect(move).toBeNull();
    });
  });

  describe('recordResult', () => {
    it('updates move with tool result', () => {
      manager.record({
        turnId: 'turn_1',
        toolCall: { id: 'call_123', toolId: 'search', input: { query: 'foo' } },
      });

      const updated = manager.recordResult('turn_1', 'call_123', { files: ['a.ts', 'b.ts'] });

      expect(updated).toBe(true);
      const moves = manager.getForTurn('turn_1');
      expect(moves[0].toolResult).toEqual({ files: ['a.ts', 'b.ts'] });
    });

    it('returns false when move not found', () => {
      const updated = manager.recordResult('turn_1', 'nonexistent_call', {});
      expect(updated).toBe(false);
    });

    it('matches by turnId and toolCallId', () => {
      manager.record({
        turnId: 'turn_1',
        toolCall: { id: 'call_123', toolId: 'search', input: {} },
      });
      manager.record({
        turnId: 'turn_2',
        toolCall: { id: 'call_123', toolId: 'search', input: {} }, // same call id, different turn
      });

      manager.recordResult('turn_1', 'call_123', { result: 'turn1' });

      const moves1 = manager.getForTurn('turn_1');
      const moves2 = manager.getForTurn('turn_2');
      expect(moves1[0].toolResult).toEqual({ result: 'turn1' });
      expect(moves2[0].toolResult).toBeNull();
    });
  });

  describe('getForTurn', () => {
    it('returns moves in sequence order', () => {
      manager.record({ turnId: 'turn_1', reasoning: 'First' });
      manager.record({ turnId: 'turn_1', reasoning: 'Second' });
      manager.record({ turnId: 'turn_1', reasoning: 'Third' });

      const moves = manager.getForTurn('turn_1');
      expect(moves).toHaveLength(3);
      expect(moves[0].sequence).toBe(0);
      expect(moves[0].reasoning).toBe('First');
      expect(moves[1].sequence).toBe(1);
      expect(moves[2].sequence).toBe(2);
    });

    it('returns empty array for turn with no moves', () => {
      const moves = manager.getForTurn('turn_no_moves');
      expect(moves).toEqual([]);
    });
  });

  describe('getNextSequence', () => {
    it('returns 0 for turn with no moves', () => {
      const next = manager.getNextSequence('turn_empty');
      expect(next).toBe(0);
    });

    it('returns next sequence after existing moves', () => {
      manager.record({ turnId: 'turn_1', reasoning: 'First' });
      manager.record({ turnId: 'turn_1', reasoning: 'Second' });

      const next = manager.getNextSequence('turn_1');
      expect(next).toBe(2);
    });
  });

  describe('getLatest', () => {
    it('returns null for turn with no moves', () => {
      const latest = manager.getLatest('turn_empty');
      expect(latest).toBeNull();
    });

    it('returns most recent move', () => {
      manager.record({ turnId: 'turn_1', reasoning: 'First' });
      manager.record({ turnId: 'turn_1', reasoning: 'Second' });
      manager.record({ turnId: 'turn_1', reasoning: 'Third' });

      const latest = manager.getLatest('turn_1');
      expect(latest).not.toBeNull();
      expect(latest!.reasoning).toBe('Third');
      expect(latest!.sequence).toBe(2);
    });
  });
});
