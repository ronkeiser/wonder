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
    return this.withLogging(
      'create',
      { metadata: { name: data.name, version: data.version, kind: data.kind } },
      async () => {
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

          return {
            action_id: action.id,
            action,
          };
        } catch (error) {
          const dbError = extractDbError(error);

          if (dbError.constraint === 'unique') {
            throw new ConflictError(
              `Action with ${dbError.field} already exists`,
              dbError.field,
              'unique',
            );
          }

          if (dbError.constraint === 'foreign_key') {
            throw new ConflictError('Referenced entity does not exist', undefined, 'foreign_key');
          }

          throw error;
        }
      },
    );
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
    return this.withLogging(
      'get',
      { action_id: id, version, metadata: { action_id: id, version } },
      async () => {
        const action =
          version !== undefined
            ? await repo.getActionVersion(this.serviceCtx.db, id, version)
            : await repo.getLatestAction(this.serviceCtx.db, id);

        if (!action) {
          throw new NotFoundError(
            `Action not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'action',
            id,
          );
        }

        return { action };
      },
    );
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
    return this.withLogging('list', { metadata: params }, async () => {
      const actionsResult = params?.kind
        ? await repo.listActionsByKind(this.serviceCtx.db, params.kind, params.limit)
        : await repo.listActions(this.serviceCtx.db, params?.limit);

      return { actions: actionsResult };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { action_id: id, version, metadata: { action_id: id, version } },
      async () => {
        const action =
          version !== undefined
            ? await repo.getActionVersion(this.serviceCtx.db, id, version)
            : await repo.getAction(this.serviceCtx.db, id);

        if (!action) {
          throw new NotFoundError(
            `Action not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'action',
            id,
          );
        }

        await repo.deleteAction(this.serviceCtx.db, id, version);
        return { success: true };
      },
    );
  }
}
