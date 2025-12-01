/** RPC adapter for coordination operations */

import type { Context } from '~/domains/execution/definitions';
import * as coordinationService from '../domains/coordination/service';
import { Resource } from './resource';

/**
 * Coordination RPC resource.
 * Exposes workflow coordination operations (primarily WebSocket streaming).
 */
export class Coordination extends Resource {
  /**
   * Get WebSocket connection for live event streaming.
   * Forwards WebSocket upgrade to the appropriate DO.
   */
  async streamEvents(durableObjectId: string, request: Request): Promise<Response> {
    return await coordinationService.streamWorkflowEvents(
      this.serviceCtx,
      durableObjectId,
      request,
    );
  }

  /**
   * Get pending events and context from coordinator.
   * Used for persistence after workflow completion.
   */
  async getPendingData(
    durableObjectId: string,
  ): Promise<{ events: unknown[]; context: Context | null }> {
    return await coordinationService.getPendingData(this.serviceCtx, durableObjectId);
  }
}
