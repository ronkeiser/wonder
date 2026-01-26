/** Personas RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import {
  createDefinition,
  deleteDefinition,
  getDefinition,
  getLatestDefinition,
  listDefinitions,
  type Definition,
} from '~/shared/definitions';
import type { PersonaContent } from '~/shared/content-schemas';
import type { Persona, PersonaInput } from './types';

/**
 * Maps a Definition to the legacy Persona shape for API compatibility.
 */
function toPersona(def: Definition): Persona {
  const content = def.content as PersonaContent;
  return {
    id: def.id,
    version: def.version,
    name: content.name,
    description: def.description,
    reference: def.reference,
    libraryId: def.libraryId,
    systemPrompt: content.systemPrompt,
    // New reference-based fields
    modelProfileRef: content.modelProfileRef,
    modelProfileVersion: content.modelProfileVersion,
    contextAssemblyWorkflowRef: content.contextAssemblyWorkflowRef,
    contextAssemblyWorkflowVersion: content.contextAssemblyWorkflowVersion,
    memoryExtractionWorkflowRef: content.memoryExtractionWorkflowRef,
    memoryExtractionWorkflowVersion: content.memoryExtractionWorkflowVersion,
    recentTurnsLimit: content.recentTurnsLimit,
    toolIds: content.toolIds,
    constraints: content.constraints ?? null,
    contentHash: def.contentHash,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

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

    // Personas require a reference for autoversioning
    if (data.autoversion && !data.reference) {
      throw new Error('reference is required when autoversion is true');
    }

    const reference = data.reference ?? data.name;

    try {
      const result = await createDefinition(this.serviceCtx.db, 'persona', {
        reference,
        name: data.name,
        description: data.description,
        libraryId: data.libraryId,
        content: {
          name: data.name,
          systemPrompt: data.systemPrompt,
          modelProfileRef: data.modelProfileRef,
          modelProfileVersion: data.modelProfileVersion ?? null,
          contextAssemblyWorkflowRef: data.contextAssemblyWorkflowRef,
          contextAssemblyWorkflowVersion: data.contextAssemblyWorkflowVersion ?? null,
          memoryExtractionWorkflowRef: data.memoryExtractionWorkflowRef,
          memoryExtractionWorkflowVersion: data.memoryExtractionWorkflowVersion ?? null,
          recentTurnsLimit: data.recentTurnsLimit ?? 20,
          toolIds: data.toolIds,
          constraints: data.constraints,
        },
        autoversion: data.autoversion,
        force: data.force,
      });

      if (result.reused) {
        return {
          personaId: result.definition.id,
          persona: toPersona(result.definition),
          reused: true,
          version: result.definition.version,
          latestVersion: result.latestVersion,
        };
      }

      return {
        personaId: result.definition.id,
        persona: toPersona(result.definition),
        reused: false,
        version: result.definition.version,
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
      const definition = await getDefinition(this.serviceCtx.db, id, version);

      if (!definition || definition.kind !== 'persona') {
        throw new NotFoundError(
          `Persona not found: ${id}${version ? ` version ${version}` : ''}`,
          'persona',
          id,
        );
      }

      return { persona: toPersona(definition) };
    });
  }

  async list(options?: { libraryId?: string; name?: string; limit?: number }): Promise<{
    personas: Persona[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      // If name is specified, find by reference (name is normalized to reference)
      if (options?.name) {
        const definition = await getLatestDefinition(
          this.serviceCtx.db,
          'persona',
          options.name,
          { libraryId: options.libraryId ?? null },
        );
        return { personas: definition ? [toPersona(definition)] : [] };
      }

      const defs = await listDefinitions(this.serviceCtx.db, 'persona', {
        libraryId: options?.libraryId,
        limit: options?.limit,
      });

      return { personas: defs.map(toPersona) };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { personaId: id, version } }, async () => {
      const existing = await getDefinition(this.serviceCtx.db, id, version);

      if (!existing || existing.kind !== 'persona') {
        throw new NotFoundError(
          `Persona not found: ${id}${version ? ` version ${version}` : ''}`,
          'persona',
          id,
        );
      }

      await deleteDefinition(this.serviceCtx.db, id, version);
      return { success: true };
    });
  }
}

export type { Persona };
