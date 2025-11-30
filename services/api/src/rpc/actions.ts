import * as effectsRepo from '~/domains/effects/repository';
import { withDbErrorHandling } from '~/errors';
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
    id: string;
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
    const action = await withDbErrorHandling(
      () =>
        effectsRepo.createAction(this.serviceCtx.db, {
          id: data.id,
          version: data.version,
          name: data.name,
          description: data.description ?? '',
          kind: data.kind,
          implementation: data.implementation,
          requires: data.requires ?? null,
          produces: data.produces ?? null,
          execution: data.execution ?? null,
          idempotency: data.idempotency ?? null,
        }),
      'Failed to create action',
    );

    return {
      action_id: action.id,
      action,
    };
  }

  /**
   * Get an action by ID
   */
  async get(actionId: string) {
    const action = await effectsRepo.getAction(this.serviceCtx.db, actionId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    return { action };
  }

  /**
   * Delete an action
   */
  async delete(actionId: string) {
    const action = await effectsRepo.getAction(this.serviceCtx.db, actionId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    await effectsRepo.deleteAction(this.serviceCtx.db, actionId);
    return { success: true };
  }
}
