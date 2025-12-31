import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

const UserParticipantSchema = z.object({
  type: z.literal('user'),
  userId: z.string(),
});

const AgentParticipantSchema = z.object({
  type: z.literal('agent'),
  agentId: z.string(),
});

const ParticipantSchema = z.union([UserParticipantSchema, AgentParticipantSchema]);

const ConversationStatusSchema = z.enum(['active', 'waiting', 'completed', 'failed']);

export const CreateConversationSchema = z
  .object({
    participants: z.array(ParticipantSchema).min(1).openapi({
      example: [
        { type: 'user', userId: 'user_123' },
        { type: 'agent', agentId: 'agent_456' },
      ],
    }),
    status: ConversationStatusSchema.default('active').openapi({ example: 'active' }),
  })
  .openapi('CreateConversation');

export const ConversationSchema = z
  .object({
    id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    participants: z.array(ParticipantSchema),
    status: ConversationStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Conversation');

export const ConversationCreateResponseSchema = z
  .object({
    conversationId: z.string(),
    conversation: ConversationSchema,
  })
  .openapi('ConversationCreateResponse');

export const ConversationGetResponseSchema = z
  .object({
    conversation: ConversationSchema,
  })
  .openapi('ConversationGetResponse');

export const ConversationListResponseSchema = z
  .object({
    conversations: z.array(ConversationSchema),
  })
  .openapi('ConversationListResponse');

export const UpdateConversationStatusSchema = z
  .object({
    status: ConversationStatusSchema.openapi({ example: 'completed' }),
  })
  .openapi('UpdateConversationStatus');
