/** ArtifactTypes RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import { computeFingerprint } from './fingerprint';
import * as repo from './repository';
import type { ArtifactType } from './types';

export class ArtifactTypes extends Resource {
  async create(data: {
    version?: number;
    name: string;
    description?: string;
    schema: object;
    autoversion?: boolean;
  }): Promise<{
    artifact_type_id: string;
    artifact_type: ArtifactType;
    /** True if an existing artifact type was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'artifact_type.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    // Autoversion deduplication check
    if (data.autoversion) {
      const contentHash = await computeFingerprint(data);

      // Check for existing artifact type with same name + content
      const existing = await repo.getArtifactTypeByNameAndHash(
        this.serviceCtx.db,
        data.name,
        contentHash,
      );

      if (existing) {
        this.serviceCtx.logger.info({
          event_type: 'artifact_type.autoversion.matched',
          metadata: {
            artifact_type_id: existing.id,
            version: existing.version,
            name: existing.name,
            content_hash: contentHash,
          },
        });

        return {
          artifact_type_id: existing.id,
          artifact_type: existing,
          reused: true,
        };
      }

      // No exact match - determine version number
      const maxVersion = await repo.getMaxVersionByName(this.serviceCtx.db, data.name);
      const newVersion = maxVersion + 1;

      this.serviceCtx.logger.info({
        event_type: 'artifact_type.autoversion.creating',
        metadata: {
          name: data.name,
          version: newVersion,
          content_hash: contentHash,
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
      schema: object;
    },
    version: number,
    contentHash: string | null,
  ): Promise<{
    artifact_type_id: string;
    artifact_type: ArtifactType;
    reused: boolean;
  }> {
    try {
      const artifactType = await repo.createArtifactType(this.serviceCtx.db, {
        version,
        name: data.name,
        description: data.description ?? '',
        schema: data.schema,
        content_hash: contentHash,
      });

      return {
        artifact_type_id: artifactType.id,
        artifact_type: artifactType,
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
    artifact_type: ArtifactType;
  }> {
    return this.withLogging('get', { metadata: { artifact_type_id: id, version } }, async () => {
      const artifactType = version
        ? await repo.getArtifactTypeVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestArtifactType(this.serviceCtx.db, id);

      if (!artifactType) {
        throw new NotFoundError(
          `ArtifactType not found: ${id}${version ? ` version ${version}` : ''}`,
          'artifact_type',
          id,
        );
      }

      return { artifact_type: artifactType };
    });
  }

  async list(params?: { limit?: number }): Promise<{
    artifact_types: ArtifactType[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const artifactTypes = await repo.listArtifactTypes(this.serviceCtx.db, params?.limit);
      return { artifact_types: artifactTypes };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { metadata: { artifact_type_id: id, version } },
      async () => {
        const existing = version
          ? await repo.getArtifactTypeVersion(this.serviceCtx.db, id, version)
          : await repo.getArtifactType(this.serviceCtx.db, id);

        if (!existing) {
          throw new NotFoundError(
            `ArtifactType not found: ${id}${version ? ` version ${version}` : ''}`,
            'artifact_type',
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
