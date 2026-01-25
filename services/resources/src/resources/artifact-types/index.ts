/** ArtifactTypes RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import {
  createDefinition,
  deleteDefinition,
  getDefinition,
  listDefinitions,
  type Definition,
} from '~/shared/definitions';
import type { ArtifactTypeContent } from '~/shared/content-schemas';
import type { ArtifactType, ArtifactTypeInput } from './types';

/**
 * Maps a Definition to the legacy ArtifactType shape for API compatibility.
 */
function toArtifactType(def: Definition): ArtifactType {
  const content = def.content as ArtifactTypeContent;
  return {
    id: def.id,
    version: def.version,
    name: content.name,
    description: def.description,
    schema: content.schema,
    contentHash: def.contentHash,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

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

    // Artifact types use name as reference (normalize name-based to reference-based)
    const reference = data.name;

    try {
      const result = await createDefinition(this.serviceCtx.db, 'artifact_type', {
        reference,
        name: data.name,
        description: data.description,
        content: {
          name: data.name,
          schema: data.schema,
        },
        autoversion: data.autoversion,
      });

      if (result.reused) {
        return {
          artifactTypeId: result.definition.id,
          artifactType: toArtifactType(result.definition),
          reused: true,
        };
      }

      return {
        artifactTypeId: result.definition.id,
        artifactType: toArtifactType(result.definition),
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
      const definition = await getDefinition(this.serviceCtx.db, id, version);

      if (!definition || definition.kind !== 'artifact_type') {
        throw new NotFoundError(
          `ArtifactType not found: ${id}${version ? ` version ${version}` : ''}`,
          'artifactType',
          id,
        );
      }

      return { artifactType: toArtifactType(definition) };
    });
  }

  async list(params?: { limit?: number }): Promise<{
    artifactTypes: ArtifactType[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const defs = await listDefinitions(this.serviceCtx.db, 'artifact_type', {
        limit: params?.limit,
      });
      return { artifactTypes: defs.map(toArtifactType) };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { metadata: { artifactTypeId: id, version } },
      async () => {
        const existing = await getDefinition(this.serviceCtx.db, id, version);

        if (!existing || existing.kind !== 'artifact_type') {
          throw new NotFoundError(
            `ArtifactType not found: ${id}${version ? ` version ${version}` : ''}`,
            'artifactType',
            id,
          );
        }

        await deleteDefinition(this.serviceCtx.db, id, version);
        return { success: true };
      },
    );
  }
}

export type { ArtifactType };
