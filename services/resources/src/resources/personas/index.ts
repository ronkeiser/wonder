/** Personas RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Persona, PersonaInput } from './types';

export class Personas extends Resource {
  async create(data: PersonaInput): Promise<{
    personaId: string;
    persona: Persona;
    /** True if an existing persona was reused (autoversion matched content hash) */
    reused: boolean;
    /** Version number of the created/reused persona */
    version: number;
    /** Latest version for this name (only present when reused=true) */
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'persona.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    const scope = {
      libraryId: data.libraryId ?? null,
    };

    const autoversionResult = await this.withAutoversion<Persona>(
      data,
      {
        findByReferenceAndHash: (reference, hash, s) =>
          repo.getPersonaByReferenceAndHash(this.serviceCtx.db, reference, hash, s?.libraryId ?? null),
        getMaxVersion: (reference, s) =>
          repo.getMaxVersionByReference(this.serviceCtx.db, reference, s?.libraryId ?? null),
      },
      scope,
    );

    if (autoversionResult.reused) {
      return {
        personaId: autoversionResult.entity.id,
        persona: autoversionResult.entity,
        reused: true,
        version: autoversionResult.entity.version,
        latestVersion: autoversionResult.latestVersion,
      };
    }

    const version = data.autoversion ? autoversionResult.version : (data.version ?? 1);

    try {
      const persona = await repo.createPersona(this.serviceCtx.db, {
        ...data,
        version,
        contentHash: autoversionResult.contentHash,
      });

      return {
        personaId: persona.id,
        persona,
        reused: false,
        version,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `Persona with ${dbError.field} already exists`,
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
    persona: Persona;
  }> {
    return this.withLogging('get', { metadata: { personaId: id, version } }, async () => {
      const persona = version
        ? await repo.getPersonaVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestPersona(this.serviceCtx.db, id);

      if (!persona) {
        throw new NotFoundError(
          `Persona not found: ${id}${version ? ` version ${version}` : ''}`,
          'persona',
          id,
        );
      }

      return { persona };
    });
  }

  async list(options?: { libraryId?: string; name?: string; limit?: number }): Promise<{
    personas: Persona[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      // If name is specified, return single-item list or empty
      if (options?.name) {
        const persona = await repo.getPersonaByName(
          this.serviceCtx.db,
          options.name,
          options?.libraryId ?? null,
        );
        return { personas: persona ? [persona] : [] };
      }

      let personas: Persona[];

      if (options?.libraryId) {
        personas = await repo.listPersonasByLibrary(
          this.serviceCtx.db,
          options.libraryId,
          options?.limit,
        );
      } else {
        personas = await repo.listPersonas(this.serviceCtx.db, options?.limit);
      }

      return { personas };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { personaId: id, version } }, async () => {
      const existing = version
        ? await repo.getPersonaVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestPersona(this.serviceCtx.db, id);

      if (!existing) {
        throw new NotFoundError(
          `Persona not found: ${id}${version ? ` version ${version}` : ''}`,
          'persona',
          id,
        );
      }

      await repo.deletePersona(this.serviceCtx.db, id, version);
      return { success: true };
    });
  }
}

export type { Persona };
