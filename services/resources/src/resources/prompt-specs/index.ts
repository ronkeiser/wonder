/** PromptSpecs RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import {
  createDefinition,
  deleteDefinition,
  getDefinition,
  listDefinitions,
  type Definition,
} from '~/shared/definitions-repository';
import type { PromptSpecContent } from '~/shared/content-schemas';
import type { PromptSpec, PromptSpecInput } from './types';

/**
 * Maps a Definition to the legacy PromptSpec shape for API compatibility.
 */
function toPromptSpec(def: Definition): PromptSpec {
  const content = def.content as PromptSpecContent;
  return {
    id: def.id,
    version: def.version,
    name: content.name,
    description: def.description,
    systemPrompt: content.systemPrompt ?? null,
    template: content.template,
    requires: content.requires,
    produces: content.produces,
    examples: content.examples ?? null,
    tags: null, // Tags are in definition.description or could be added to content
    contentHash: def.contentHash,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

export class PromptSpecs extends Resource {
  async create(data: PromptSpecInput): Promise<{
    promptSpecId: string;
    promptSpec: PromptSpec;
    /** True if an existing prompt spec was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'prompt_spec.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    // Prompt specs use name as reference (normalize name-based to reference-based)
    const reference = data.name;

    try {
      const result = await createDefinition(this.serviceCtx.db, 'prompt_spec', {
        reference,
        name: data.name,
        description: data.description,
        content: {
          name: data.name,
          systemPrompt: data.systemPrompt,
          template: data.template,
          requires: data.requires ?? {},
          produces: data.produces ?? {},
          examples: data.examples,
        },
        autoversion: data.autoversion,
      });

      if (result.reused) {
        return {
          promptSpecId: result.definition.id,
          promptSpec: toPromptSpec(result.definition),
          reused: true,
        };
      }

      return {
        promptSpecId: result.definition.id,
        promptSpec: toPromptSpec(result.definition),
        reused: false,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `PromptSpec with ${dbError.field} already exists`,
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
    promptSpec: PromptSpec;
  }> {
    return this.withLogging(
      'get',
      { promptSpecId: id, version, metadata: { promptSpecId: id, version } },
      async () => {
        const definition = await getDefinition(this.serviceCtx.db, id, version);

        if (!definition || definition.kind !== 'prompt_spec') {
          throw new NotFoundError(
            `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'promptSpec',
            id,
          );
        }

        return { promptSpec: toPromptSpec(definition) };
      },
    );
  }

  async list(params?: { limit?: number }): Promise<{
    promptSpecs: PromptSpec[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const defs = await listDefinitions(this.serviceCtx.db, 'prompt_spec', {
        limit: params?.limit,
      });
      return { promptSpecs: defs.map(toPromptSpec) };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { promptSpecId: id, version, metadata: { promptSpecId: id, version } },
      async () => {
        const existing = await getDefinition(this.serviceCtx.db, id, version);

        if (!existing || existing.kind !== 'prompt_spec') {
          throw new NotFoundError(
            `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'promptSpec',
            id,
          );
        }

        await deleteDefinition(this.serviceCtx.db, id, version);
        return { success: true };
      },
    );
  }
}
