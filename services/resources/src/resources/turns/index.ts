/** Turns RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Turn, TurnCaller, TurnIssues, TurnStatus } from './types';

export class Turns extends Resource {
  async create(params: {
    id: string;
    conversationId: string;
    caller: TurnCaller;
    input?: object;
    replyToMessageId?: string;
  }): Promise<{ turn: Turn }> {
    this.serviceCtx.logger.info({
      eventType: 'turn.create.started',
      metadata: { turnId: params.id, conversationId: params.conversationId },
    });

    try {
      const turn = await repo.createTurn(this.serviceCtx.db, params);
      return { turn };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `Turn with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      if (dbError.constraint === 'foreign_key') {
        throw new ConflictError('Conversation does not exist', undefined, 'foreign_key');
      }

      throw error;
    }
  }

  async get(id: string): Promise<{ turn: Turn }> {
    return this.withLogging('get', { metadata: { turnId: id } }, async () => {
      const turn = await repo.getTurn(this.serviceCtx.db, id);

      if (!turn) {
        throw new NotFoundError(`Turn not found: ${id}`, 'turn', id);
      }

      return { turn };
    });
  }

  async listForConversation(
    conversationId: string,
    limit?: number,
  ): Promise<{ turns: Turn[] }> {
    return this.withLogging(
      'listForConversation',
      { metadata: { conversationId, limit } },
      async () => {
        const turns = await repo.listTurnsForConversation(
          this.serviceCtx.db,
          conversationId,
          limit,
        );
        return { turns };
      },
    );
  }

  async complete(id: string, issues?: TurnIssues): Promise<{ turn: Turn }> {
    return this.withLogging(
      'complete',
      { metadata: { turnId: id, issues } },
      async () => {
        const turn = await repo.completeTurn(this.serviceCtx.db, id, issues);

        if (!turn) {
          throw new NotFoundError(`Turn not found: ${id}`, 'turn', id);
        }

        return { turn };
      },
    );
  }

  async fail(id: string): Promise<{ turn: Turn }> {
    return this.withLogging('fail', { metadata: { turnId: id } }, async () => {
      const turn = await repo.failTurn(this.serviceCtx.db, id);

      if (!turn) {
        throw new NotFoundError(`Turn not found: ${id}`, 'turn', id);
      }

      return { turn };
    });
  }

  async updateStatus(id: string, status: TurnStatus): Promise<{ turn: Turn }> {
    return this.withLogging(
      'updateStatus',
      { metadata: { turnId: id, status } },
      async () => {
        const turn = await repo.updateTurnStatus(this.serviceCtx.db, id, status);

        if (!turn) {
          throw new NotFoundError(`Turn not found: ${id}`, 'turn', id);
        }

        return { turn };
      },
    );
  }

  async linkContextAssembly(turnId: string, workflowRunId: string): Promise<{ turn: Turn }> {
    return this.withLogging(
      'linkContextAssembly',
      { metadata: { turnId, workflowRunId } },
      async () => {
        const turn = await repo.linkContextAssembly(this.serviceCtx.db, turnId, workflowRunId);

        if (!turn) {
          throw new NotFoundError(`Turn not found: ${turnId}`, 'turn', turnId);
        }

        return { turn };
      },
    );
  }

  async linkMemoryExtraction(turnId: string, workflowRunId: string): Promise<{ turn: Turn }> {
    return this.withLogging(
      'linkMemoryExtraction',
      { metadata: { turnId, workflowRunId } },
      async () => {
        const turn = await repo.linkMemoryExtraction(this.serviceCtx.db, turnId, workflowRunId);

        if (!turn) {
          throw new NotFoundError(`Turn not found: ${turnId}`, 'turn', turnId);
        }

        return { turn };
      },
    );
  }
}

export type { Turn, TurnCaller, TurnIssues, TurnStatus };
