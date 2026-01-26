/** Actions RPC resource */

import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { actions } from '~/schema';
import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { computeContentHash } from '~/shared/fingerprint';
import { Resource } from '~/shared/resource';
import {
  getByIdAndVersion,
  getByReferenceAndHash,
  getLatestByReference,
  getMaxVersion,
  deleteById,
} from '~/shared/versioning';
import type { Action, ActionInput } from './types';

/** Fields that affect the content hash. */
function hashableContent(data: ActionInput): Record<string, unknown> {
  return {
    name: data.name,
    kind: data.kind,
    implementation: data.implementation,
    requires: data.requires ?? null,
    produces: data.produces ?? null,
    execution: data.execution ?? null,
    idempotency: data.idempotency ?? null,
  };
}

export class Actions extends Resource {
  async create(data: ActionInput): Promise<{
    actionId: string;
    action: Action;
    reused: boolean;
    version: number;
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'action.create.started',
      metadata: { name: data.name, kind: data.kind, autoversion: data.autoversion ?? false },
    });

    const reference = data.reference ?? data.name;
    const contentHash = await computeContentHash(hashableContent(data));

    if (data.autoversion && !data.force) {
      const existing = await getByReferenceAndHash(
        this.serviceCtx.db, actions, reference, contentHash,
      );

      if (existing) {
        const latestVersion = await getMaxVersion(this.serviceCtx.db, actions, reference);
        return {
          actionId: existing.id,
          action: existing,
          reused: true,
          version: existing.version,
          latestVersion,
        };
      }
    }

    // Determine version and stable ID
    const maxVersion = await getMaxVersion(this.serviceCtx.db, actions, reference);
    const version = (data.autoversion || data.force) ? maxVersion + 1 : 1;

    // Reuse stable ID from existing versions, or generate new
    let stableId: string;
    if (maxVersion > 0) {
      const existing = await getLatestByReference(this.serviceCtx.db, actions, reference);
      stableId = existing?.id ?? ulid();
    } else {
      stableId = ulid();
    }

    const now = new Date().toISOString();

    try {
      const [action] = await this.serviceCtx.db
        .insert(actions)
        .values({
          id: stableId,
          version,
          reference,
          name: data.name,
          description: data.description ?? '',
          contentHash,
          kind: data.kind,
          implementation: data.implementation,
          requires: data.requires ?? null,
          produces: data.produces ?? null,
          execution: data.execution ?? null,
          idempotency: data.idempotency ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        actionId: action.id,
        action,
        reused: false,
        version: action.version,
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
      throw error;
    }
  }

  async get(id: string, version?: number): Promise<{ action: Action }> {
    return this.withLogging(
      'get',
      { actionId: id, version, metadata: { actionId: id, version } },
      async () => {
        const action = await getByIdAndVersion(this.serviceCtx.db, actions, id, version);

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

  async list(params?: { limit?: number; kind?: string }): Promise<{ actions: Action[] }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const conditions = [];

      if (params?.kind) {
        conditions.push(eq(actions.kind, params.kind as Action['kind']));
      }

      const results = await this.serviceCtx.db
        .select()
        .from(actions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(params?.limit ?? 100)
        .all();

      return { actions: results };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { actionId: id, version, metadata: { actionId: id, version } },
      async () => {
        const existing = await getByIdAndVersion(this.serviceCtx.db, actions, id, version);

        if (!existing) {
          throw new NotFoundError(
            `Action not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'action',
            id,
          );
        }

        await deleteById(this.serviceCtx.db, actions, id, version);
        return { success: true };
      },
    );
  }
}
