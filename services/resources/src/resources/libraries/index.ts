/** Libraries RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { DefinitionInfo, Library, LibraryInput, StandardLibraryManifest } from './types';

export class Libraries extends Resource {
  async create(data: LibraryInput): Promise<{
    libraryId: string;
    library: Library;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'library.create.started',
      metadata: { name: data.name, workspaceId: data.workspaceId },
    });

    try {
      const library = await repo.createLibrary(this.serviceCtx.db, data);

      return {
        libraryId: library.id,
        library,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `Library with name "${data.name}" already exists in this workspace`,
          dbError.field,
          'unique',
        );
      }

      if (dbError.constraint === 'foreign_key') {
        throw new ConflictError('Referenced workspace does not exist', undefined, 'foreign_key');
      }

      throw error;
    }
  }

  async get(id: string): Promise<{
    library: Library;
  }> {
    return this.withLogging('get', { metadata: { libraryId: id } }, async () => {
      const library = await repo.getLibrary(this.serviceCtx.db, id);

      if (!library) {
        throw new NotFoundError(`Library not found: ${id}`, 'library', id);
      }

      return { library };
    });
  }

  async getByName(
    name: string,
    workspaceId: string | null,
  ): Promise<{
    library: Library | null;
  }> {
    return this.withLogging(
      'getByName',
      { metadata: { name, workspaceId } },
      async () => {
        const library = await repo.getLibraryByName(this.serviceCtx.db, name, workspaceId);
        return { library };
      },
    );
  }

  async list(options?: {
    workspaceId?: string;
    standardOnly?: boolean;
    limit?: number;
  }): Promise<{
    libraries: Library[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      let libraries: Library[];

      if (options?.standardOnly) {
        libraries = await repo.listStandardLibraries(this.serviceCtx.db, options?.limit);
      } else if (options?.workspaceId) {
        libraries = await repo.listLibrariesByWorkspace(
          this.serviceCtx.db,
          options.workspaceId,
          options?.limit,
        );
      } else {
        libraries = await repo.listLibraries(this.serviceCtx.db, options?.limit);
      }

      return { libraries };
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { libraryId: id } }, async () => {
      const existing = await repo.getLibrary(this.serviceCtx.db, id);

      if (!existing) {
        throw new NotFoundError(`Library not found: ${id}`, 'library', id);
      }

      await repo.deleteLibrary(this.serviceCtx.db, id);
      return { success: true };
    });
  }

  async getStandardLibraryManifest(): Promise<{
    manifest: StandardLibraryManifest;
  }> {
    return this.withLogging('getStandardLibraryManifest', {}, async () => {
      const manifest = await repo.buildStandardLibraryManifest(this.serviceCtx.db);
      return { manifest };
    });
  }

  async getLibraryDefinitions(libraryId: string): Promise<{
    definitions: DefinitionInfo[];
  }> {
    return this.withLogging(
      'getLibraryDefinitions',
      { metadata: { libraryId } },
      async () => {
        const library = await repo.getLibrary(this.serviceCtx.db, libraryId);

        if (!library) {
          throw new NotFoundError(`Library not found: ${libraryId}`, 'library', libraryId);
        }

        const definitions = await repo.getLibraryDefinitions(this.serviceCtx.db, libraryId);
        return { definitions };
      },
    );
  }
}

export type { Library };
