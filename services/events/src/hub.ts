import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import type {
  HubSubscription,
  HubSubscriptionFilter,
  HubSubscriptionMessage,
  WorkflowStatusChange,
} from './types';

export type { WorkflowRunStatus, WorkflowStatusChange } from './types';

/**
 * EventHub Durable Object - singleton for workflow lifecycle events
 *
 * Responsibilities:
 * - Broadcast workflow lifecycle events (started, completed, failed)
 * - Allow clients to discover active workflows
 * - Lightweight - only lifecycle transitions, not detailed events
 *
 * Detailed events (token.*, task.*, context.*, trace.*) go to per-workflow Streamer DOs.
 */
export class EventHub extends DurableObject<Env> {
  private logger: Logger;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = createLogger(ctx, env.LOGS, {
      service: `${env.SERVICE}-hub`,
      environment: env.ENVIRONMENT,
    });
  }

  // ============================================================================
  // RPC Methods - Called by Resources Service
  // ============================================================================

  /**
   * Notify about a workflow run status change
   *
   * Called by resources service when workflow run status changes.
   * Broadcasts to all connected WebSocket clients.
   */
  notifyStatusChange(change: WorkflowStatusChange): void {
    this.broadcastStatusChange(change);
  }

  // ============================================================================
  // WebSocket Management
  // ============================================================================

  /**
   * Handle WebSocket upgrade and initial connection
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/stream') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.serializeAttachment({});
      this.ctx.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle incoming WebSocket messages for subscription management
   */
  webSocketMessage(ws: WebSocket, message: string): void {
    try {
      const msg = JSON.parse(message) as HubSubscriptionMessage;
      const subsObj = (ws.deserializeAttachment() as Record<string, HubSubscription>) || {};

      if (msg.type === 'subscribe') {
        subsObj[msg.id] = {
          id: msg.id,
          filters: msg.filters,
        };
        ws.serializeAttachment(subsObj);
      } else if (msg.type === 'unsubscribe') {
        delete subsObj[msg.id];
        ws.serializeAttachment(subsObj);
      }
    } catch (error) {
      this.logger.error({ message: 'Error handling WebSocket message', metadata: { error } });
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid subscription message' }));
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    this.logger.error({ message: 'WebSocket error', metadata: { error } });
  }

  // ============================================================================
  // Broadcasting
  // ============================================================================

  private broadcastStatusChange(change: WorkflowStatusChange): void {
    this.ctx.getWebSockets().forEach((ws) => {
      const subsObj = (ws.deserializeAttachment() as Record<string, HubSubscription>) || {};

      for (const sub of Object.values(subsObj)) {
        if (this.matchesFilter(change, sub.filters)) {
          try {
            ws.send(
              JSON.stringify({
                type: 'status_change',
                subscriptionId: sub.id,
                change,
              }),
            );
          } catch (error) {
            this.logger.error({
              message: 'Error broadcasting status change to WebSocket',
              metadata: { error },
            });
          }
        }
      }
    });
  }

  // ============================================================================
  // Filtering
  // ============================================================================

  private matchesFilter(change: WorkflowStatusChange, filter: HubSubscriptionFilter): boolean {
    if (filter.projectId && change.projectId !== filter.projectId) return false;
    if (filter.workflowDefId && change.workflowDefId !== filter.workflowDefId) return false;
    if (filter.status && change.status !== filter.status) return false;
    return true;
  }
}
