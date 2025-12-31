import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import {
  createMessageRoute,
  deleteMessageRoute,
  getMessageRoute,
  listMessagesForConversationRoute,
  listMessagesForTurnRoute,
} from './spec';

export const messages = new OpenAPIHono<HttpEnv>();

messages.openapi(createMessageRoute, async (c) => {
  const validated = c.req.valid('json');
  using resource = c.env.RESOURCES.messages();
  const result = await resource.create(validated);
  return c.json(result, 201);
});

messages.openapi(getMessageRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.messages();
  const result = await resource.get(id);
  return c.json(result);
});

messages.openapi(deleteMessageRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.messages();
  await resource.delete(id);
  return c.json({ success: true });
});

export const conversationMessages = new OpenAPIHono<HttpEnv>();

conversationMessages.openapi(listMessagesForConversationRoute, async (c) => {
  const { conversationId } = c.req.valid('param');
  const { limit } = c.req.valid('query');
  using resource = c.env.RESOURCES.messages();
  const result = await resource.listForConversation(conversationId, limit);
  return c.json(result);
});

export const turnMessages = new OpenAPIHono<HttpEnv>();

turnMessages.openapi(listMessagesForTurnRoute, async (c) => {
  const { turnId } = c.req.valid('param');
  using resource = c.env.RESOURCES.messages();
  const result = await resource.listForTurn(turnId);
  return c.json(result);
});
