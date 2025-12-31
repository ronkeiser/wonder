/** Agents RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Agent, AgentInput } from './types';

export class Agents extends Resource {
  async create(data: AgentInput): Promise<{
    agentId: string;
    agent: Agent;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'agent.create.started',
      metadata: { projectIds: data.projectIds },
    });

    try {
      const agent = await repo.createAgent(this.serviceCtx.db, data);

      return {
        agentId: agent.id,
        agent,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `Agent with ${dbError.field} already exists`,
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
    agent: Agent;
  }> {
    return this.withLogging('get', { metadata: { agentId: id } }, async () => {
      const agent = await repo.getAgent(this.serviceCtx.db, id);

      if (!agent) {
        throw new NotFoundError(`Agent not found: ${id}`, 'agent', id);
      }

      return { agent };
    });
  }

  async list(options?: { limit?: number }): Promise<{
    agents: Agent[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      const agents = await repo.listAgents(this.serviceCtx.db, options?.limit);
      return { agents };
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { agentId: id } }, async () => {
      const existing = await repo.getAgent(this.serviceCtx.db, id);

      if (!existing) {
        throw new NotFoundError(`Agent not found: ${id}`, 'agent', id);
      }

      await repo.deleteAgent(this.serviceCtx.db, id);
      return { success: true };
    });
  }
}

export type { Agent };
