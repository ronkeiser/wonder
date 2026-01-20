import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { listMessagesForConversationRoute, listMessagesForTurnRoute } from './spec';

/**
 * Messages for a conversation.
 * Mounted at /conversations/:conversationId/messages
 */
export const conversationMessages = new OpenAPIHono<HttpEnv>();

conversationMessages.openapi(listMessagesForConversationRoute, async (c) => {
  const { conversationId } = c.req.valid('param');
  const { limit } = c.req.valid('query');

  // Get messages from the Conversation DO (source of truth)
  const conversationDOId = c.env.CONVERSATION.idFromName(conversationId);
  const conversationDO = c.env.CONVERSATION.get(conversationDOId);
  const result = await conversationDO.getMessages(conversationId, limit);

  return c.json(result);
});

/**
 * Messages for a specific turn.
 * Mounted at /conversations/:conversationId/turns/:turnId/messages
 */
export const turnMessages = new OpenAPIHono<HttpEnv>();

turnMessages.openapi(listMessagesForTurnRoute, async (c) => {
  const { conversationId, turnId } = c.req.valid('param');

  // Get messages from the Conversation DO (source of truth)
  const conversationDOId = c.env.CONVERSATION.idFromName(conversationId);
  const conversationDO = c.env.CONVERSATION.get(conversationDOId);
  const result = await conversationDO.getMessagesForTurn(conversationId, turnId);

  return c.json(result);
});