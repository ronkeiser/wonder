/** Actions RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import { computeFingerprint } from './fingerprint';
import * as repo from './repository';
import type { Action, ActionKind } from './types';

export class Actions extends Resource {
  async create(data: {
    version?: number;
    name: string;
    description?: string;
    kind: ActionKind;
    implementation: object;
    requires?: object;
    produces?: object;
    execution?: object;
    idempotency?: object;
    autoversion?: boolean;
  }): Promise<{
    action_id: string;
    action: Action;
    /** True if an existing action was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'action.create.started',
      metadata: { name: data.name, kind: data.kind, autoversion: data.autoversion ?? false },
    });

    // Autoversion deduplication check
    if (data.autoversion) {
      const { hash: contentHash, input: fingerprintInput } = await computeFingerprint(data);

      // Check for existing action with same name + content
      const existing = await repo.getActionByNameAndHash(
        this.serviceCtx.db,
        data.name,
        contentHash,
      );

      if (existing) {
        this.serviceCtx.logger.info({
          event_type: 'action.autoversion.matched',
          metadata: {
            action_id: existing.id,
            version: existing.version,
            name: existing.name,
            content_hash: contentHash,
            fingerprint_input: fingerprintInput,
          },
        });

        return {
          action_id: existing.id,
          action: existing,
          reused: true,
        };
      }

      // No exact match - determine version number
      const maxVersion = await repo.getMaxVersionByName(this.serviceCtx.db, data.name);
      const newVersion = maxVersion + 1;

      this.serviceCtx.logger.info({
        event_type: 'action.autoversion.creating',
        metadata: {
          name: data.name,
          version: newVersion,
          content_hash: contentHash,
          fingerprint_input: fingerprintInput,
          existing_max_version: maxVersion,
        },
      });

      return this.createWithVersionAndHash(data, newVersion, contentHash);
    }

    // Non-autoversion path: create with version 1 (original behavior)
    return this.createWithVersionAndHash(data, data.version ?? 1, null);
  }

  private async createWithVersionAndHash(
    data: {
      name: string;
      description?: string;
      kind: ActionKind;
      implementation: object;
      requires?: object;
      produces?: object;
      execution?: object;
      idempotency?: object;
    },
    version: number,
    contentHash: string | null,
  ): Promise<{
    action_id: string;
    action: Action;
    reused: boolean;
  }> {
    try {
      const action = await repo.createAction(this.serviceCtx.db, {
        version,
        name: data.name,
        description: data.description ?? '',
        kind: data.kind,
        implementation: data.implementation,
        requires: data.requires ?? null,
        produces: data.produces ?? null,
        execution: data.execution ?? null,
        idempotency: data.idempotency ?? null,
        content_hash: contentHash,
      });

      return {
        action_id: action.id,
        action,
        reused: false,
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
  }

  async get(
    id: string,
    version?: number,
  ): Promise<{
    action: Action;
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
