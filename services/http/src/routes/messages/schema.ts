import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const MessageSchema = z
  .object({
    id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    conversationId: z.string(),
    turnId: z.string(),
    role: z.enum(['user', 'agent']),
    content: z.string(),
    createdAt: z.string(),
  })
  .openapi('Message');

export const MessageListResponseSchema = z
  .object({
    messages: z.array(MessageSchema),
  })
  .openapi('MessageListResponse');
