import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { conversationMessages, turnMessages } from '../messages/route';
import {
  createConversationRoute,
  deleteConversationRoute,
  getConversationRoute,
  listConversationsRoute,
  startTurnRoute,
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

/** POST /{id}/turns - Start a new turn with optional SSE streaming */
conversations.openapi(startTurnRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { stream, content, enableTraceEvents } = c.req.valid('json');

  // Get Conversation DO
  const conversationDOId = c.env.CONVERSATION.idFromName(id);
  const conversationDO = c.env.CONVERSATION.get(conversationDOId);

  // Non-streaming mode: start and return immediately
  if (!stream) {
    const result = await conversationDO.startTurn(
      id,
      content,
      { type: 'user', userId: 'api_user' },
      { enableTraceEvents },
    );
    return c.json({ turnId: result.turnId, conversationId: id }, 200);
  }

  // Streaming mode: connect to Streamer DO for SSE
  // Conversations use conversationId as streamId
  const streamerId = c.env.EVENTS_STREAMER.idFromName(id);
  const streamer = c.env.EVENTS_STREAMER.get(streamerId);

  // Start turn in background (don't await)
  c.executionCtx.waitUntil(
    conversationDO.startTurn(
      id,
      content,
      { type: 'user', userId: 'api_user' },
      { enableTraceEvents },
    ),
  );

  // Connect to Streamer's SSE endpoint
  const sseUrl = new URL(c.req.url);
  sseUrl.pathname = '/sse';
  sseUrl.searchParams.set('streamId', id);
  sseUrl.searchParams.set('executionType', 'conversation');

  const sseResponse = await streamer.fetch(new Request(sseUrl));

  // Return the SSE stream directly from the Streamer
  return new Response(sseResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

conversations.route('/:conversationId/messages', conversationMessages);
conversations.route('/:conversationId/turns/:turnId/messages', turnMessages);
