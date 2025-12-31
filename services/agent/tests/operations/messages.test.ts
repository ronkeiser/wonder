/**
 * Tests for MessageManager
 *
 * Tests message storage: append, queries.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MessageManager } from '../../src/operations/messages';
import { createMockEmitter, createTestDb, type TestDb } from './helpers';

describe('MessageManager', () => {
  let db: TestDb;
  let emitter: ReturnType<typeof createMockEmitter>;
  let manager: MessageManager;

  beforeEach(() => {
    db = createTestDb();
    emitter = createMockEmitter();
    manager = new MessageManager(db as never, emitter as never);
  });

  describe('append', () => {
    it('creates message with user role', () => {
      const messageId = manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'user',
        content: 'Hello, how are you?',
      });

      const message = manager.get(messageId);
      expect(message).not.toBeNull();
      expect(message!.conversationId).toBe('conv_1');
      expect(message!.turnId).toBe('turn_1');
      expect(message!.role).toBe('user');
      expect(message!.content).toBe('Hello, how are you?');
    });

    it('creates message with agent role', () => {
      const messageId = manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'agent',
        content: 'I am doing well, thank you!',
      });

      const message = manager.get(messageId);
      expect(message!.role).toBe('agent');
    });

    it('emits trace event with content length', () => {
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'user',
        content: 'Hello world',
      });

      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0].type).toBe('operation.messages.appended');
      expect((emitter.events[0].payload as { contentLength: number }).contentLength).toBe(11);
    });
  });

  describe('get', () => {
    it('returns null for non-existent message', () => {
      const message = manager.get('nonexistent');
      expect(message).toBeNull();
    });
  });

  describe('getForTurn', () => {
    it('returns messages for specific turn', () => {
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'user',
        content: 'User message',
      });
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'agent',
        content: 'Agent response',
      });
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_2', // different turn
        role: 'user',
        content: 'Another message',
      });

      const messages = manager.getForTurn('turn_1');
      expect(messages).toHaveLength(2);
    });

    it('returns empty array for turn with no messages', () => {
      const messages = manager.getForTurn('turn_no_messages');
      expect(messages).toEqual([]);
    });
  });

  describe('getRecent', () => {
    it('returns messages with limit applied', () => {
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'user',
        content: 'First',
      });
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'agent',
        content: 'Second',
      });
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_2',
        role: 'user',
        content: 'Third',
      });

      const recent = manager.getRecent('conv_1', 2);
      expect(recent).toHaveLength(2);
      // All 3 messages exist, we get 2 of them
      const allMessages = manager.getRecent('conv_1', 10);
      expect(allMessages).toHaveLength(3);
    });

    it('respects limit', () => {
      for (let i = 0; i < 10; i++) {
        manager.append({
          conversationId: 'conv_1',
          turnId: 'turn_1',
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const recent = manager.getRecent('conv_1', 5);
      expect(recent).toHaveLength(5);
    });

    it('returns only messages for specified conversation', () => {
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'user',
        content: 'Conv 1 message',
      });
      manager.append({
        conversationId: 'conv_2',
        turnId: 'turn_2',
        role: 'user',
        content: 'Conv 2 message',
      });

      const recent = manager.getRecent('conv_1', 10);
      expect(recent).toHaveLength(1);
      expect(recent[0].content).toBe('Conv 1 message');
    });
  });

  describe('getForConversation', () => {
    it('returns all messages for conversation', () => {
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'user',
        content: 'Message 1',
      });
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        role: 'agent',
        content: 'Message 2',
      });
      manager.append({
        conversationId: 'conv_1',
        turnId: 'turn_2',
        role: 'user',
        content: 'Message 3',
      });
      manager.append({
        conversationId: 'conv_2', // different conversation
        turnId: 'turn_3',
        role: 'user',
        content: 'Message 4',
      });

      const messages = manager.getForConversation('conv_1');
      expect(messages).toHaveLength(3);
    });
  });
});
