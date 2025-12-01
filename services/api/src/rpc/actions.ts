import * as effectsService from '~/domains/effects/service';
import { Resource } from './resource';

/**
 * Actions RPC resource
 * Exposes action CRUD operations
 */
export class Actions extends Resource {
  /**
   * Create a new action
   */
  async create(data: {
    version: number;
    name: string;
    description?: string;
    kind:
      | 'llm_call'
      | 'mcp_tool'
      | 'http_request'
      | 'human_input'
      | 'update_context'
      | 'write_artifact'
      | 'workflow_call'
      | 'vector_search'
      | 'emit_metric';
    implementation: unknown;
    requires?: unknown;
    produces?: unknown;
    execution?: unknown;
    idempotency?: unknown;
  }) {
    const action = await effectsService.createAction(this.serviceCtx, data);
    return {
      action_id: action.id,
      action,
    };
  }

  /**
   * Get an action by ID
   */
  async get(actionId: string) {
    const action = await effectsService.getAction(this.serviceCtx, actionId);
    return { action };
  }

  /**
   * Delete an action
   */
  async delete(actionId: string) {
    await effectsService.deleteAction(this.serviceCtx, actionId);
    return { success: true };
  }
}
