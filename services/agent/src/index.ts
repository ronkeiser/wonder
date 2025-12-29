/**
 * Wonder Agent Service
 *
 * Durable Object-based conversation orchestration service.
 * Manages agent conversations and tool execution via RPC.
 *
 * Each AgentDO instance manages a single conversation, following
 * the same actor/decision pattern as WorkflowCoordinator:
 * receive → decide → dispatch → wait → resume
 */
import { DurableObject } from 'cloudflare:workers';

/**
 * AgentDO Durable Object
 *
 * Each instance manages a single conversation.
 */
export class AgentDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /**
   * Placeholder: Start a new conversation
   */
  async start(conversationId: string): Promise<{ status: string }> {
    return { status: 'ok' };
  }
}

/**
 * Worker entrypoint
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('OK');
  },
};
