/** Personas RPC resource */

import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { personas } from '~/schema';
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
import type { Persona, PersonaInput } from './types';

const scopeCols = { libraryId: personas.libraryId };

function hashableContent(data: PersonaInput): Record<string, unknown> {
  return {
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
    constraints: data.constraints ?? null,
  };
}

export class Personas extends Resource {
  async create(data: PersonaInput): Promise<{
    personaId: string;
    persona: Persona;
    reused: boolean;
    version: number;
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'persona.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    const reference = data.reference ?? data.name;
    const scope = { libraryId: data.libraryId ?? null };

    const contentHash = await computeContentHash(hashableContent(data));

    if (data.autoversion && !data.force) {
      const existing = await getByReferenceAndHash(
        this.serviceCtx.db, personas, reference, contentHash, scope, scopeCols,
      );

      if (existing) {
        const latestVersion = await getMaxVersion(
          this.serviceCtx.db, personas, reference, scope, scopeCols,
        );
        return {
          personaId: existing.id,
          persona: existing,
          reused: true,
          version: existing.version,
          latestVersion,
        };
      }
    }

    const maxVersion = await getMaxVersion(
      this.serviceCtx.db, personas, reference, scope, scopeCols,
    );
    const version = (data.autoversion || data.force) ? maxVersion + 1 : 1;

    let stableId: string;
    if (maxVersion > 0) {
      const latest = await getLatestByReference(
        this.serviceCtx.db, personas, reference, scope, scopeCols,
      );
      stableId = latest?.id ?? ulid();
    } else {
      stableId = ulid();
    }

    const now = new Date().toISOString();

    try {
      const [persona] = await this.serviceCtx.db
        .insert(personas)
        .values({
          id: stableId,
          version,
          reference,
          name: data.name,
          description: data.description ?? '',
          contentHash,
          libraryId: data.libraryId ?? null,
          systemPrompt: data.systemPrompt,
          modelProfileRef: data.modelProfileRef,
          modelProfileVersion: data.modelProfileVersion ?? null,
          contextAssemblyWorkflowRef: data.contextAssemblyWorkflowRef,
          contextAssemblyWorkflowVersion: data.contextAssemblyWorkflowVersion ?? null,
          memoryExtractionWorkflowRef: data.memoryExtractionWorkflowRef,
          memoryExtractionWorkflowVersion: data.memoryExtractionWorkflowVersion ?? null,
          recentTurnsLimit: data.recentTurnsLimit ?? 20,
          toolIds: data.toolIds,
          constraints: data.constraints ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        personaId: persona.id,
        persona,
        reused: false,
        version: persona.version,
      };
    } catch (error) {
      const dbError = extractDbError(error);
      if (dbError.constraint === 'unique') {
        throw new ConflictError(`Persona with ${dbError.field} already exists`, dbError.field, 'unique');
      }
      if (dbError.constraint === 'foreign_key') {
        throw new ConflictError('Referenced entity does not exist', undefined, 'foreign_key');
      }
      throw error;
    }
  }

  async get(id: string, version?: number): Promise<{ persona: Persona }> {
    return this.withLogging('get', { metadata: { personaId: id, version } }, async () => {
      const persona = await getByIdAndVersion(this.serviceCtx.db, personas, id, version);

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
      if (options?.name) {
        const scope = { libraryId: options.libraryId ?? null };
        const persona = await getLatestByReference(
          this.serviceCtx.db, personas, options.name, scope, scopeCols,
        );
        return { personas: persona ? [persona] : [] };
      }

      const conditions = [];
      if (options?.libraryId) {
        conditions.push(eq(personas.libraryId, options.libraryId));
      }

      const results = await this.serviceCtx.db
        .select()
        .from(personas)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(options?.limit ?? 100)
        .all();

      return { personas: results };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { personaId: id, version } }, async () => {
      const existing = await getByIdAndVersion(this.serviceCtx.db, personas, id, version);

      if (!existing) {
        throw new NotFoundError(
          `Persona not found: ${id}${version ? ` version ${version}` : ''}`,
          'persona',
          id,
        );
      }

      await deleteById(this.serviceCtx.db, personas, id, version);
      return { success: true };
    });
  }
}

export type { Persona };
