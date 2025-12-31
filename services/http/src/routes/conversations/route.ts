import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { conversationMessages, turnMessages } from '../messages/route';
import {
  createConversationRoute,
  deleteConversationRoute,
  getConversationRoute,
  listConversationsRoute,
  updateConversationStatusRoute,
} from './spec';

export const conversations = new OpenAPIHono<HttpEnv>();

conversations.openapi(createConversationRoute, async (c) => {
  const validated = c.req.valid('json');
  using resource = c.env.RESOURCES.conversations();
  const result = await resource.create(validated);
  return c.json(result, 201);
});

conversations.openapi(listConversationsRoute, async (c) => {
  const { status, limit } = c.req.valid('query');
  using resource = c.env.RESOURCES.conversations();
  const result = await resource.list({ status, limit });
  return c.json(result);
});

conversations.openapi(getConversationRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.conversations();
  const result = await resource.get(id);
  return c.json(result);
});

conversations.openapi(updateConversationStatusRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { status } = c.req.valid('json');
  using resource = c.env.RESOURCES.conversations();
  const result = await resource.updateStatus(id, status);
  return c.json(result);
});

conversations.openapi(deleteConversationRoute, async (c) => {
  const { id } = c.req.valid('param');
  using resource = c.env.RESOURCES.conversations();
  await resource.delete(id);
  return c.json({ success: true });
});

conversations.route('/:conversationId/messages', conversationMessages);
conversations.route('/:conversationId/turns/:turnId/messages', turnMessages);
