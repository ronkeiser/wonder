/** Tasks RPC resource */

import { ulid } from 'ulid';
import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import {
  createDefinition,
  deleteDefinition,
  getDefinition,
  getLatestDefinition,
  listDefinitions,
  type Definition,
} from '~/shared/definitions-repository';
import type { TaskContent } from '~/shared/content-schemas';
import type { Step, Task, TaskInput } from './types';

/**
 * Maps a Definition to the legacy Task shape for API compatibility.
 */
function toTask(def: Definition): Task {
  const content = def.content as TaskContent;
  return {
    id: def.id,
    version: def.version,
    name: content.name,
    description: def.description,
    reference: def.reference,
    projectId: def.projectId,
    libraryId: def.libraryId,
    tags: null, // Tags could be stored in content if needed
    inputSchema: content.inputSchema,
    outputSchema: content.outputSchema,
    steps: content.steps,
    retry: content.retry ?? null,
    timeoutMs: content.timeoutMs ?? null,
    contentHash: def.contentHash,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

export class Tasks extends Resource {
  async create(data: TaskInput): Promise<{
    taskId: string;
    task: Task;
    /** True if an existing task was reused (autoversion matched content hash) */
    reused: boolean;
    /** Version number of the created/reused task */
    version: number;
    /** Latest version for this name (only present when reused=true) */
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'task.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    // Tasks require a reference for autoversioning
    if (data.autoversion && !data.reference) {
      throw new Error('reference is required when autoversion is true');
    }

    const reference = data.reference ?? data.name;

    // Generate step IDs
    const stepsWithIds: Step[] = data.steps.map((step) => ({
      ...step,
      id: ulid(),
    }));

    try {
      const result = await createDefinition(this.serviceCtx.db, 'task', {
        reference,
        name: data.name,
        description: data.description,
        projectId: data.projectId,
        libraryId: data.libraryId,
        content: {
          name: data.name,
          inputSchema: data.inputSchema,
          outputSchema: data.outputSchema,
          steps: stepsWithIds,
          retry: data.retry,
          timeoutMs: data.timeoutMs,
        },
        autoversion: data.autoversion,
      });

      if (result.reused) {
        return {
          taskId: result.definition.id,
          task: toTask(result.definition),
          reused: true,
          version: result.definition.version,
          latestVersion: result.latestVersion,
        };
      }

      return {
        taskId: result.definition.id,
        task: toTask(result.definition),
        reused: false,
        version: result.definition.version,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `Task with ${dbError.field} already exists`,
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
    task: Task;
  }> {
    return this.withLogging('get', { metadata: { taskId: id, version } }, async () => {
      const definition = await getDefinition(this.serviceCtx.db, id, version);

      if (!definition || definition.kind !== 'task') {
        throw new NotFoundError(
          `Task not found: ${id}${version ? ` version ${version}` : ''}`,
          'task',
          id,
        );
      }

      return { task: toTask(definition) };
    });
  }

  async list(options?: {
    projectId?: string;
    libraryId?: string;
    name?: string;
    limit?: number;
  }): Promise<{
    tasks: Task[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      // If name is specified, find by reference (name is normalized to reference)
      if (options?.name) {
        const definition = await getLatestDefinition(
          this.serviceCtx.db,
          'task',
          options.name,
          { projectId: options.projectId ?? null, libraryId: options.libraryId ?? null },
        );
        return { tasks: definition ? [toTask(definition)] : [] };
      }

      const defs = await listDefinitions(this.serviceCtx.db, 'task', {
        projectId: options?.projectId,
        libraryId: options?.libraryId,
        limit: options?.limit,
      });

      return { tasks: defs.map(toTask) };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { taskId: id, version } }, async () => {
      const existing = await getDefinition(this.serviceCtx.db, id, version);

      if (!existing || existing.kind !== 'task') {
        throw new NotFoundError(
          `Task not found: ${id}${version ? ` version ${version}` : ''}`,
          'task',
          id,
        );
      }

      await deleteDefinition(this.serviceCtx.db, id, version);
      return { success: true };
    });
  }
}

export type { Task };
