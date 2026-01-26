/** Actions RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import {
  createDefinition,
  deleteDefinition,
  getDefinition,
  listDefinitions,
  type Definition,
} from '~/shared/definitions';
import type { ActionContent, ActionKind as ContentActionKind } from '~/shared/content-schemas';
import type { Action, ActionInput, ActionKind } from './types';

/**
 * Maps a Definition to the legacy Action shape for API compatibility.
 */
function toAction(def: Definition): Action {
  const content = def.content as ActionContent;
  return {
    id: def.id,
    version: def.version,
    name: content.name,
    description: def.description,
    reference: def.reference,
    kind: content.kind,
    implementation: content.implementation,
    requires: content.requires ?? null,
    produces: content.produces ?? null,
    execution: content.execution ?? null,
    idempotency: content.idempotency ?? null,
    contentHash: def.contentHash,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

export class Actions extends Resource {
  async create(data: ActionInput): Promise<{
    actionId: string;
    action: Action;
    /** True if an existing action was reused (autoversion matched content hash) */
    reused: boolean;
    /** Version number of the created/reused action */
    version: number;
    /** Latest version for this name (only present when reused=true) */
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'action.create.started',
      metadata: { name: data.name, kind: data.kind, autoversion: data.autoversion ?? false },
    });

    // Actions require a reference for autoversioning
    if (data.autoversion && !data.reference) {
      throw new Error('reference is required when autoversion is true');
    }

    const reference = data.reference ?? data.name;

    try {
      const result = await createDefinition(this.serviceCtx.db, 'action', {
        reference,
        name: data.name,
        description: data.description,
        content: {
          name: data.name,
          kind: data.kind as ContentActionKind,
          implementation: data.implementation,
          requires: data.requires,
          produces: data.produces,
          execution: data.execution,
          idempotency: data.idempotency,
        },
        autoversion: data.autoversion,
        force: data.force,
      });

      if (result.reused) {
        return {
          actionId: result.definition.id,
          action: toAction(result.definition),
          reused: true,
          version: result.definition.version,
          latestVersion: result.latestVersion,
        };
      }

      return {
        actionId: result.definition.id,
        action: toAction(result.definition),
        reused: false,
        version: result.definition.version,
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
      { actionId: id, version, metadata: { actionId: id, version } },
      async () => {
        const definition = await getDefinition(this.serviceCtx.db, id, version);

        if (!definition || definition.kind !== 'action') {
          throw new NotFoundError(
            `Action not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'action',
            id,
          );
        }

        return { action: toAction(definition) };
      },
    );
  }

  async list(params?: { limit?: number; kind?: ActionKind }): Promise<{
    actions: Action[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const defs = await listDefinitions(this.serviceCtx.db, 'action', {
        limit: params?.limit,
      });

      let actions = defs.map(toAction);

      // Filter by action kind if specified
      if (params?.kind) {
        actions = actions.filter((a) => a.kind === params.kind);
      }

      return { actions };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { actionId: id, version, metadata: { actionId: id, version } },
      async () => {
        const existing = await getDefinition(this.serviceCtx.db, id, version);

        if (!existing || existing.kind !== 'action') {
          throw new NotFoundError(
            `Action not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'action',
            id,
          );
        }

        await deleteDefinition(this.serviceCtx.db, id, version);
        return { success: true };
      },
    );
  }
}
