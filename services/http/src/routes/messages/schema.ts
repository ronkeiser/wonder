import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateMessageSchema = z
  .object({
    id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    conversationId: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    turnId: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    role: z.enum(['user', 'agent']).openapi({ example: 'user' }),
    content: z.string().min(1).openapi({ example: 'Hello, how can I help?' }),
  })
  .openapi('CreateMessage');

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

export const MessageCreateResponseSchema = z
  .object({
    message: MessageSchema,
  })
  .openapi('MessageCreateResponse');

export const MessageGetResponseSchema = z
  .object({
    message: MessageSchema,
  })
  .openapi('MessageGetResponse');

export const MessageListResponseSchema = z
  .object({
    messages: z.array(MessageSchema),
  })
  .openapi('MessageListResponse');
