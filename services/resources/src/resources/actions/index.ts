/** Actions RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';

type ActionKind =
  | 'llm_call'
  | 'mcp_tool'
  | 'http_request'
  | 'human_input'
  | 'update_context'
  | 'write_artifact'
  | 'workflow_call'
  | 'vector_search'
  | 'emit_metric';

export class Actions extends Resource {
  async create(data: {
    version: number;
    name: string;
    description?: string;
    kind: ActionKind;
    implementation: object;
    requires?: object;
    produces?: object;
    execution?: object;
    idempotency?: object;
  }): Promise<{
    action_id: string;
    action: {
      id: string;
      name: string;
      description: string;
      version: number;
      kind: ActionKind;
      implementation: object;
      requires: object | null;
      produces: object | null;
      execution: object | null;
      idempotency: object | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info({
      event_type: 'action_create_started',
      metadata: {
        name: data.name,
        version: data.version,
        kind: data.kind,
      },
    });

    try {
      const action = await repo.createAction(this.serviceCtx.db, {
        version: data.version,
        name: data.name,
        description: data.description ?? '',
        kind: data.kind,
        implementation: data.implementation,
        requires: data.requires ?? null,
        produces: data.produces ?? null,
        execution: data.execution ?? null,
        idempotency: data.idempotency ?? null,
      });

      this.serviceCtx.logger.info({
        event_type: 'action_created',
        metadata: {
          action_id: action.id,
          name: action.name,
          version: action.version,
        },
      });

      return {
        action_id: action.id,
        action,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn({
          event_type: 'action_create_conflict',
          metadata: {
            name: data.name,
            version: data.version,
            field: dbError.field,
          },
        });
        throw new ConflictError(
          `Action with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      if (dbError.constraint === 'foreign_key') {
        this.serviceCtx.logger.warn({
          event_type: 'action_create_invalid_reference',
          metadata: { name: data.name },
        });
        throw new ConflictError('Referenced entity does not exist', undefined, 'foreign_key');
      }

      this.serviceCtx.logger.error({
        event_type: 'action_create_failed',
        message: dbError.message,
        metadata: { name: data.name },
      });
      throw error;
    }
  }

  async get(
    id: string,
    version?: number,
  ): Promise<{
    action: {
      id: string;
      name: string;
      description: string;
      version: number;
      kind: ActionKind;
      implementation: object;
      requires: object | null;
      produces: object | null;
      execution: object | null;
      idempotency: object | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info({
      event_type: 'action_get',
      metadata: { action_id: id, version },
    });

    const action =
      version !== undefined
        ? await repo.getActionVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestAction(this.serviceCtx.db, id);

    if (!action) {
      this.serviceCtx.logger.warn({
        event_type: 'action_not_found',
        metadata: { action_id: id, version },
      });
      throw new NotFoundError(
        `Action not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
        'action',
        id,
      );
    }

    return { action };
  }

  async list(params?: { limit?: number; kind?: ActionKind }): Promise<{
    actions: Array<{
      id: string;
      name: string;
      description: string;
      version: number;
      kind: ActionKind;
      implementation: object;
      requires: object | null;
      produces: object | null;
      execution: object | null;
      idempotency: object | null;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    this.serviceCtx.logger.info({ event_type: 'action_list', metadata: params ?? {} });

    const actionsResult = params?.kind
      ? await repo.listActionsByKind(this.serviceCtx.db, params.kind, params.limit)
      : await repo.listActions(this.serviceCtx.db, params?.limit);

    return { actions: actionsResult };
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info({
      event_type: 'action_delete_started',
      metadata: { action_id: id, version },
    });

    // Verify action exists
    const action =
      version !== undefined
        ? await repo.getActionVersion(this.serviceCtx.db, id, version)
        : await repo.getAction(this.serviceCtx.db, id);

    if (!action) {
      this.serviceCtx.logger.warn({
        event_type: 'action_not_found',
        metadata: { action_id: id, version },
      });
      throw new NotFoundError(
        `Action not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
        'action',
        id,
      );
    }

    await repo.deleteAction(this.serviceCtx.db, id, version);
    this.serviceCtx.logger.info({
      event_type: 'action_deleted',
      metadata: { action_id: id, version },
    });

    return { success: true };
  }
}
