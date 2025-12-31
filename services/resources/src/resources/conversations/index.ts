/** Conversations RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Conversation, ConversationInput, ConversationStatus } from './types';

export class Conversations extends Resource {
  async create(data: ConversationInput): Promise<{
    conversationId: string;
    conversation: Conversation;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'conversation.create.started',
      metadata: { participantCount: data.participants.length },
    });

    try {
      const conversation = await repo.createConversation(this.serviceCtx.db, data);

      return {
        conversationId: conversation.id,
        conversation,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `Conversation with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      if (dbError.constraint === 'foreign_key') {
        throw new ConflictError('Referenced entity does not exist', undefined, 'foreign_key');
      }

      throw error;
    }
  }

  async get(id: string): Promise<{
    conversation: Conversation;
  }> {
    return this.withLogging('get', { metadata: { conversationId: id } }, async () => {
      const conversation = await repo.getConversation(this.serviceCtx.db, id);

      if (!conversation) {
        throw new NotFoundError(`Conversation not found: ${id}`, 'conversation', id);
      }

      return { conversation };
    });
  }

  async list(options?: { status?: ConversationStatus; limit?: number }): Promise<{
    conversations: Conversation[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      let conversations: Conversation[];

      if (options?.status) {
        conversations = await repo.listConversationsByStatus(
          this.serviceCtx.db,
          options.status,
          options?.limit,
        );
      } else {
        conversations = await repo.listConversations(this.serviceCtx.db, options?.limit);
      }

      return { conversations };
    });
  }

  async updateStatus(id: string, status: ConversationStatus): Promise<{
    conversation: Conversation;
  }> {
    return this.withLogging('updateStatus', { metadata: { conversationId: id, status } }, async () => {
      const conversation = await repo.updateConversationStatus(this.serviceCtx.db, id, status);

      if (!conversation) {
        throw new NotFoundError(`Conversation not found: ${id}`, 'conversation', id);
      }

      return { conversation };
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { conversationId: id } }, async () => {
      const existing = await repo.getConversation(this.serviceCtx.db, id);

      if (!existing) {
        throw new NotFoundError(`Conversation not found: ${id}`, 'conversation', id);
      }

      await repo.deleteConversation(this.serviceCtx.db, id);
      return { success: true };
    });
  }
}

export type { Conversation };
