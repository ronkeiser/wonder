/** ArtifactTypes RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { computeContentHash } from '~/shared/fingerprint';
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

    // Artifact types use name-based autoversioning (no reference field)
    const contentHash = await computeContentHash(data as Record<string, unknown>);
    let version = data.version ?? 1;

    if (data.autoversion) {
      // Check for existing artifact type with same name + content
      const existing = await repo.getArtifactTypeByNameAndHash(
        this.serviceCtx.db,
        data.name,
        contentHash,
      );

      if (existing) {
        return {
          artifactTypeId: existing.id,
          artifactType: existing,
          reused: true,
        };
      }

      // Get max version and increment
      const maxVersion = await repo.getMaxVersionByName(this.serviceCtx.db, data.name);
      version = maxVersion + 1;
    }

    try {
      const artifactType = await repo.createArtifactType(this.serviceCtx.db, {
        ...data,
        version,
        contentHash,
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
