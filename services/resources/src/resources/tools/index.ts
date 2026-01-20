/** Tools RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Tool, ToolInput } from './types';

export class Tools extends Resource {
  async create(data: ToolInput): Promise<{
    toolId: string;
    tool: Tool;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'tool.create.started',
      metadata: { name: data.name },
    });

    try {
      const tool = await repo.createTool(this.serviceCtx.db, data);

      return {
        toolId: tool.id,
        tool,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `Tool with ${dbError.field} already exists`,
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

  async get(id: string): Promise<{
    tool: Tool;
  }> {
    return this.withLogging('get', { metadata: { toolId: id } }, async () => {
      const tool = await repo.getTool(this.serviceCtx.db, id);

      if (!tool) {
        throw new NotFoundError(`Tool not found: ${id}`, 'tool', id);
      }

      return { tool };
    });
  }

  async getByIds(ids: string[]): Promise<{
    tools: Tool[];
  }> {
    return this.withLogging('getByIds', { metadata: { toolIds: ids } }, async () => {
      const tools = await repo.listToolsByIds(this.serviceCtx.db, ids);
      return { tools };
    });
  }

  async list(options?: { libraryId?: string; name?: string; limit?: number }): Promise<{
    tools: Tool[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      // If name is specified, return single-item list or empty
      if (options?.name) {
        const tool = await repo.getToolByName(
          this.serviceCtx.db,
          options.name,
          options?.libraryId ?? null,
        );
        return { tools: tool ? [tool] : [] };
      }

      let tools: Tool[];

      if (options?.libraryId) {
        tools = await repo.listToolsByLibrary(
          this.serviceCtx.db,
          options.libraryId,
          options?.limit,
        );
      } else {
        tools = await repo.listTools(this.serviceCtx.db, options?.limit);
      }

      return { tools };
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { toolId: id } }, async () => {
      const existing = await repo.getTool(this.serviceCtx.db, id);

      if (!existing) {
        throw new NotFoundError(`Tool not found: ${id}`, 'tool', id);
      }

      await repo.deleteTool(this.serviceCtx.db, id);
      return { success: true };
    });
  }
}

export type { Tool };
