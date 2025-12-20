/** ArtifactTypes RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { ArtifactType, ArtifactTypeInput } from './types';

export class ArtifactTypes extends Resource {
  async create(data: ArtifactTypeInput): Promise<{
    artifactTypeId: string;
    artifactType: ArtifactType;
    /** True if an existing artifact type was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'artifact_type.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    const autoversionResult = await this.withAutoversion(data, {
      findByNameAndHash: (name, hash) =>
        repo.getArtifactTypeByNameAndHash(this.serviceCtx.db, name, hash),
      getMaxVersion: (name) => repo.getMaxVersionByName(this.serviceCtx.db, name),
    });

    if (autoversionResult.reused) {
      return {
        artifactTypeId: autoversionResult.entity.id,
        artifactType: autoversionResult.entity,
        reused: true,
      };
    }

    const version = data.autoversion ? autoversionResult.version : (data.version ?? 1);

    try {
      const artifactType = await repo.createArtifactType(this.serviceCtx.db, {
        ...data,
        version,
        contentHash: autoversionResult.contentHash,
      });

      return {
        artifactTypeId: artifactType.id,
        artifactType,
        reused: false,
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

  async get(
    id: string,
    version?: number,
  ): Promise<{
    artifactType: ArtifactType;
  }> {
    return this.withLogging('get', { metadata: { artifactTypeId: id, version } }, async () => {
      const artifactType = version
        ? await repo.getArtifactTypeVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestArtifactType(this.serviceCtx.db, id);

      if (!artifactType) {
        throw new NotFoundError(
          `ArtifactType not found: ${id}${version ? ` version ${version}` : ''}`,
          'artifactType',
          id,
        );
      }

      return { artifactType };
    });
  }

  async list(params?: { limit?: number }): Promise<{
    artifactTypes: ArtifactType[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const artifactTypes = await repo.listArtifactTypes(this.serviceCtx.db, params?.limit);
      return { artifactTypes };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { metadata: { artifactTypeId: id, version } },
      async () => {
        const existing = version
          ? await repo.getArtifactTypeVersion(this.serviceCtx.db, id, version)
          : await repo.getArtifactType(this.serviceCtx.db, id);

        if (!existing) {
          throw new NotFoundError(
            `ArtifactType not found: ${id}${version ? ` version ${version}` : ''}`,
            'artifactType',
            id,
          );
        }

        await repo.deleteArtifactType(this.serviceCtx.db, id, version);
        return { success: true };
      },
    );
  }
}

export type { ArtifactType };
