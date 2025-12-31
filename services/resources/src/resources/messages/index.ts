/** Messages RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Message, MessageRole } from './types';

export class Messages extends Resource {
  async create(params: {
    id: string;
    conversationId: string;
    turnId: string;
    role: MessageRole;
    content: string;
  }): Promise<{ message: Message }> {
    this.serviceCtx.logger.info({
      eventType: 'message.create.started',
      metadata: { messageId: params.id, conversationId: params.conversationId, turnId: params.turnId },
    });

    try {
      const message = await repo.createMessage(this.serviceCtx.db, params);
      return { message };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `Message with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      if (dbError.constraint === 'foreign_key') {
        throw new ConflictError('Conversation or turn does not exist', undefined, 'foreign_key');
      }

      throw error;
    }
  }

  async get(id: string): Promise<{ message: Message }> {
    return this.withLogging('get', { metadata: { messageId: id } }, async () => {
      const message = await repo.getMessage(this.serviceCtx.db, id);

      if (!message) {
        throw new NotFoundError(`Message not found: ${id}`, 'message', id);
      }

      return { message };
    });
  }

  async listForConversation(
    conversationId: string,
    limit?: number,
  ): Promise<{ messages: Message[] }> {
    return this.withLogging(
      'listForConversation',
      { metadata: { conversationId, limit } },
      async () => {
        const messages = await repo.listMessagesForConversation(
          this.serviceCtx.db,
          conversationId,
          limit,
        );
        return { messages };
      },
    );
  }

  async listForTurn(turnId: string): Promise<{ messages: Message[] }> {
    return this.withLogging(
      'listForTurn',
      { metadata: { turnId } },
      async () => {
        const messages = await repo.listMessagesForTurn(this.serviceCtx.db, turnId);
        return { messages };
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { messageId: id } }, async () => {
      const existing = await repo.getMessage(this.serviceCtx.db, id);

      if (!existing) {
        throw new NotFoundError(`Message not found: ${id}`, 'message', id);
      }

      await repo.deleteMessage(this.serviceCtx.db, id);
      return { success: true };
    });
  }
}

export type { Message, MessageRole };
