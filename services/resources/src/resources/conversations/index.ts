/** Conversations RPC resource */

import type { Broadcaster, ExecutionStatus } from '@wonder/events';
import { modelProfiles, personas, workflowDefs } from '~/schema';
import { NotFoundError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import {
  getByIdAndVersion,
  resolveReference,
} from '~/shared/versioning';
import * as agentRepo from '../agents/repository';
import * as repo from './repository';
import type { Conversation, ConversationInput, ConversationStatus, Participant } from './types';

/** Map conversation status to execution status for Broadcaster */
function toExecutionStatus(status: ConversationStatus): ExecutionStatus {
  // Conversation 'active' maps to execution 'running'
  return status === 'active' ? 'running' : status;
}

/** Extract agentId from participants array */
function getAgentId(participants: Participant[]): string | null {
  const agentParticipant = participants.find((p) => p.type === 'agent');
  return agentParticipant?.type === 'agent' ? agentParticipant.agentId : null;
}

/** Resolved definition references for a conversation */
type ResolvedRefs = {
  resolvedPersonaId: string | null;
  resolvedPersonaVersion: number | null;
  resolvedModelProfileId: string | null;
  resolvedModelProfileVersion: number | null;
  resolvedContextAssemblyWorkflowId: string | null;
  resolvedContextAssemblyWorkflowVersion: number | null;
  resolvedMemoryExtractionWorkflowId: string | null;
  resolvedMemoryExtractionWorkflowVersion: number | null;
};

export class Conversations extends Resource {
  /**
   * Resolve all definition references for a conversation.
   *
   * Given an agent, resolves:
   * 1. Persona (from agent.personaId + personaVersion)
   * 2. Model profile (from persona.modelProfileRef + version)
   * 3. Context assembly workflow (from persona ref + version)
   * 4. Memory extraction workflow (from persona ref + version)
   *
   * Returns resolved IDs and versions to be stored on the conversation.
   */
  private async resolveDefinitions(agentId: string): Promise<ResolvedRefs> {
    const db = this.serviceCtx.db;

    // Get agent
    const agent = await agentRepo.getAgent(db, agentId);
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${agentId}`, 'agent', agentId);
    }

    // If no persona, return nulls
    if (!agent.personaId) {
      return {
        resolvedPersonaId: null,
        resolvedPersonaVersion: null,
        resolvedModelProfileId: null,
        resolvedModelProfileVersion: null,
        resolvedContextAssemblyWorkflowId: null,
        resolvedContextAssemblyWorkflowVersion: null,
        resolvedMemoryExtractionWorkflowId: null,
        resolvedMemoryExtractionWorkflowVersion: null,
      };
    }

    // Get persona (by ID and optional version)
    const persona = await getByIdAndVersion(db, personas, agent.personaId, agent.personaVersion ?? undefined);
    if (!persona) {
      throw new NotFoundError(
        `Persona not found: ${agent.personaId}`,
        'persona',
        agent.personaId,
      );
    }

    // Resolve model profile — persona has typed columns directly, no cast needed
    let resolvedModelProfileId: string | null = null;
    let resolvedModelProfileVersion: number | null = null;
    if (persona.modelProfileRef) {
      const modelProfile = await resolveReference(
        db, modelProfiles, persona.modelProfileRef, persona.modelProfileVersion,
      );
      if (modelProfile) {
        resolvedModelProfileId = modelProfile.id;
        resolvedModelProfileVersion = modelProfile.version;
      }
    }

    // Resolve context assembly workflow
    let resolvedContextAssemblyWorkflowId: string | null = null;
    let resolvedContextAssemblyWorkflowVersion: number | null = null;
    if (persona.contextAssemblyWorkflowRef) {
      const workflow = await resolveReference(
        db, workflowDefs, persona.contextAssemblyWorkflowRef, persona.contextAssemblyWorkflowVersion,
      );
      if (workflow) {
        resolvedContextAssemblyWorkflowId = workflow.id;
        resolvedContextAssemblyWorkflowVersion = workflow.version;
      }
    }

    // Resolve memory extraction workflow
    let resolvedMemoryExtractionWorkflowId: string | null = null;
    let resolvedMemoryExtractionWorkflowVersion: number | null = null;
    if (persona.memoryExtractionWorkflowRef) {
      const workflow = await resolveReference(
        db, workflowDefs, persona.memoryExtractionWorkflowRef, persona.memoryExtractionWorkflowVersion,
      );
      if (workflow) {
        resolvedMemoryExtractionWorkflowId = workflow.id;
        resolvedMemoryExtractionWorkflowVersion = workflow.version;
      }
    }

    return {
      resolvedPersonaId: persona.id,
      resolvedPersonaVersion: persona.version,
      resolvedModelProfileId,
      resolvedModelProfileVersion,
      resolvedContextAssemblyWorkflowId,
      resolvedContextAssemblyWorkflowVersion,
      resolvedMemoryExtractionWorkflowId,
      resolvedMemoryExtractionWorkflowVersion,
    };
  }

  async create(data: ConversationInput): Promise<{
    conversationId: string;
    conversation: Conversation;
  }> {
    const agentId = getAgentId(data.participants);

    return this.withLogging(
      'create',
      { metadata: { agentId, participantCount: data.participants.length } },
      async () => {
        // Resolve all definition references at conversation creation
        let resolvedRefs: ResolvedRefs = {
          resolvedPersonaId: null,
          resolvedPersonaVersion: null,
          resolvedModelProfileId: null,
          resolvedModelProfileVersion: null,
          resolvedContextAssemblyWorkflowId: null,
          resolvedContextAssemblyWorkflowVersion: null,
          resolvedMemoryExtractionWorkflowId: null,
          resolvedMemoryExtractionWorkflowVersion: null,
        };

        if (agentId) {
          resolvedRefs = await this.resolveDefinitions(agentId);
        }

        // Create conversation with resolved refs
        const conversation = await repo.createConversation(this.serviceCtx.db, {
          ...data,
          ...resolvedRefs,
        });

        // Notify Broadcaster about the new conversation
        const broadcaster = (
          this.env as unknown as { BROADCASTER: DurableObjectNamespace<Broadcaster> }
        ).BROADCASTER;
        const broadcasterId = broadcaster.idFromName('global');
        const broadcasterStub = broadcaster.get(broadcasterId);
        broadcasterStub.notifyStatusChange({
          executionType: 'conversation',
          streamId: conversation.id,
          executionId: conversation.id,
          definitionId: agentId ?? conversation.id,
          parentExecutionId: null,
          status: toExecutionStatus(conversation.status),
          timestamp: Date.now(),
        });

        return {
          conversationId: conversation.id,
          conversation,
        };
      },
    );
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

      const agentId = getAgentId(conversation.participants);

      // Notify Broadcaster about the status change
      const broadcaster = (
        this.env as unknown as { BROADCASTER: DurableObjectNamespace<Broadcaster> }
      ).BROADCASTER;
      const broadcasterId = broadcaster.idFromName('global');
      const broadcasterStub = broadcaster.get(broadcasterId);
      broadcasterStub.notifyStatusChange({
        executionType: 'conversation',
        streamId: conversation.id,
        executionId: conversation.id,
        definitionId: agentId ?? conversation.id,
        parentExecutionId: null,
        status: toExecutionStatus(conversation.status),
        timestamp: Date.now(),
      });

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

  async listByAgentId(
    agentId: string,
    options?: { limit?: number },
  ): Promise<{
    conversations: Conversation[];
  }> {
    return this.withLogging('listByAgentId', { metadata: { agentId, ...options } }, async () => {
      const conversations = await repo.listConversationsByAgentId(
        this.serviceCtx.db,
        agentId,
        options?.limit,
      );
      return { conversations };
    });
  }
}

export type { Conversation };
