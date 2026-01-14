import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { conversationMessages, turnMessages } from '../messages/route';
import {
  connectWebSocketRoute,
  createConversationRoute,
  deleteConversationRoute,
  getConversationRoute,
  listConversationsRoute,
  startTurnRoute,
  updateConversationStatusRoute,
  WebSocketSendMessageSchema,
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

/**
 * GET /{id}/ws - WebSocket connection for real-time conversation events
 *
 * This endpoint upgrades to WebSocket and connects to the Streamer DO.
 * The client can:
 * - Receive all events for the conversation (both events and trace streams)
 * - Send messages to start new turns
 *
 * Protocol:
 * - Client sends: { type: 'send', content: '...', enableTraceEvents?: boolean }
 * - Server sends: { type: 'event', stream: 'events'|'trace', subscriptionId: '...', event: {...} }
 */
conversations.openapi(connectWebSocketRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { enableTraceEvents } = c.req.valid('query');

  // Check for WebSocket upgrade
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  // Get the Streamer DO for this conversation
  const streamerId = c.env.EVENTS_STREAMER.idFromName(id);
  const streamer = c.env.EVENTS_STREAMER.get(streamerId);

  // Get the Conversation DO for starting turns
  const conversationDOId = c.env.CONVERSATION.idFromName(id);
  const conversationDO = c.env.CONVERSATION.get(conversationDOId);

  // Create WebSocket pair - one for client, one for server-side handling
  const pair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(pair);

  // Connect to Streamer DO's WebSocket endpoint
  const streamerWsUrl = new URL(c.req.url);
  streamerWsUrl.pathname = '/ws';

  const streamerResponse = await streamer.fetch(
    new Request(streamerWsUrl, {
      headers: { Upgrade: 'websocket' },
    }),
  );

  const streamerWs = streamerResponse.webSocket;
  if (!streamerWs) {
    return c.json({ error: 'Failed to connect to event streamer' }, 500);
  }

  // Accept the streamer WebSocket
  streamerWs.accept();

  // Subscribe to both events and trace for this conversation
  const subscriptionId = `conv-${id}`;
  streamerWs.send(
    JSON.stringify({
      type: 'subscribe',
      id: subscriptionId,
      stream: 'events',
      filters: { streamId: id, executionType: 'conversation' },
    }),
  );
  streamerWs.send(
    JSON.stringify({
      type: 'subscribe',
      id: `${subscriptionId}-trace`,
      stream: 'trace',
      filters: { streamId: id, executionType: 'conversation' },
    }),
  );

  // Accept the client-facing WebSocket
  serverWs.accept();

  // Forward events from Streamer to client
  streamerWs.addEventListener('message', (event) => {
    try {
      serverWs.send(event.data as string);
    } catch {
      // Client disconnected
    }
  });

  // Handle messages from client (starting turns)
  serverWs.addEventListener('message', async (event) => {
    try {
      const data = JSON.parse(event.data as string);
      const parsed = WebSocketSendMessageSchema.safeParse(data);

      if (parsed.success && parsed.data.type === 'send') {
        // Start a new turn
        c.executionCtx.waitUntil(
          conversationDO.startTurn(id, parsed.data.content, { type: 'user', userId: 'api_user' }, {
            enableTraceEvents: parsed.data.enableTraceEvents ?? enableTraceEvents,
          }),
        );
      } else {
        serverWs.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    } catch (error) {
      serverWs.send(
        JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' }),
      );
    }
  });

  // Clean up on close
  serverWs.addEventListener('close', () => {
    streamerWs.close();
  });

  streamerWs.addEventListener('close', () => {
    serverWs.close();
  });

  // Return the client WebSocket
  return new Response(null, {
    status: 101,
    webSocket: clientWs,
  });
});

conversations.route('/:conversationId/messages', conversationMessages);
conversations.route('/:conversationId/turns/:turnId/messages', turnMessages);
