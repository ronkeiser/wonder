/** ArtifactTypes RPC resource */

import { ulid } from 'ulid';
import { artifactTypes } from '~/schema';
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
import type { ArtifactType, ArtifactTypeInput } from './types';

function hashableContent(data: ArtifactTypeInput): Record<string, unknown> {
  return {
    name: data.name,
    schema: data.schema,
  };
}

export class ArtifactTypes extends Resource {
  async create(data: ArtifactTypeInput): Promise<{
    artifactTypeId: string;
    artifactType: ArtifactType;
    reused: boolean;
    version: number;
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'artifact_type.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    const reference = data.name;
    const contentHash = await computeContentHash(hashableContent(data));

    if (data.autoversion && !data.force) {
      const existing = await getByReferenceAndHash(
        this.serviceCtx.db, artifactTypes, reference, contentHash,
      );

      if (existing) {
        const latestVersion = await getMaxVersion(this.serviceCtx.db, artifactTypes, reference);
        return {
          artifactTypeId: existing.id,
          artifactType: existing,
          reused: true,
          version: existing.version,
          latestVersion,
        };
      }
    }

    const maxVersion = await getMaxVersion(this.serviceCtx.db, artifactTypes, reference);
    const version = (data.autoversion || data.force) ? maxVersion + 1 : 1;

    let stableId: string;
    if (maxVersion > 0) {
      const latest = await getLatestByReference(this.serviceCtx.db, artifactTypes, reference);
      stableId = latest?.id ?? ulid();
    } else {
      stableId = ulid();
    }

    const now = new Date().toISOString();

    try {
      const [artifactType] = await this.serviceCtx.db
        .insert(artifactTypes)
        .values({
          id: stableId,
          version,
          reference,
          name: data.name,
          description: data.description ?? '',
          contentHash,
          schema: data.schema,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        artifactTypeId: artifactType.id,
        artifactType,
        reused: false,
        version: artifactType.version,
      };
    } catch (error) {
      const dbError = extractDbError(error);
      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `ArtifactType with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }
      throw error;
    }
  }

  async get(id: string, version?: number): Promise<{ artifactType: ArtifactType }> {
    return this.withLogging('get', { metadata: { artifactTypeId: id, version } }, async () => {
      const artifactType = await getByIdAndVersion(this.serviceCtx.db, artifactTypes, id, version);

      if (!artifactType) {
        throw new NotFoundError(
          `ArtifactType not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
          'artifactType',
          id,
        );
      }

      return { artifactType };
    });
  }

  async list(params?: { limit?: number; name?: string }): Promise<{ artifactTypes: ArtifactType[] }> {
    return this.withLogging('list', { metadata: params }, async () => {
      if (params?.name) {
        const artifactType = await getLatestByReference(
          this.serviceCtx.db, artifactTypes, params.name,
        );
        return { artifactTypes: artifactType ? [artifactType] : [] };
      }

      const results = await this.serviceCtx.db
        .select()
        .from(artifactTypes)
        .limit(params?.limit ?? 100)
        .all();

      return { artifactTypes: results };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { metadata: { artifactTypeId: id, version } },
      async () => {
        const existing = await getByIdAndVersion(this.serviceCtx.db, artifactTypes, id, version);

        if (!existing) {
          throw new NotFoundError(
            `ArtifactType not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'artifactType',
            id,
          );
        }

        await deleteById(this.serviceCtx.db, artifactTypes, id, version);
        return { success: true };
      },
    );
  }
}

export type { ArtifactType };
