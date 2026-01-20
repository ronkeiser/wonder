/** Tasks RPC resource */

import { ulid } from 'ulid';
import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import type { Step } from '../../schema';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Task, TaskInput } from './types';

export class Tasks extends Resource {
  async create(data: TaskInput): Promise<{
    taskId: string;
    task: Task;
    /** True if an existing task was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'task.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    const scope = {
      projectId: data.projectId ?? null,
      libraryId: data.libraryId ?? null,
    };

    const autoversionResult = await this.withAutoversion(
      data,
      {
        findByNameAndHash: (name, hash, s) =>
          repo.getTaskByNameAndHash(
            this.serviceCtx.db,
            name,
            hash,
            s?.projectId ?? null,
            s?.libraryId ?? null,
          ),
        getMaxVersion: (name, s) =>
          repo.getMaxVersionByName(
            this.serviceCtx.db,
            name,
            s?.projectId ?? null,
            s?.libraryId ?? null,
          ),
      },
      scope,
    );

    if (autoversionResult.reused) {
      return {
        taskId: autoversionResult.entity.id,
        task: autoversionResult.entity,
        reused: true,
      };
    }

    const version = data.autoversion ? autoversionResult.version : (data.version ?? 1);

    // Generate step IDs
    const stepsWithIds: Step[] = data.steps.map((step) => ({
      ...step,
      id: ulid(),
    }));

    try {
      const task = await repo.createTask(this.serviceCtx.db, {
        ...data,
        version,
        steps: stepsWithIds,
        contentHash: autoversionResult.contentHash,
      });

      return {
        taskId: task.id,
        task,
        reused: false,
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
      const task = version
        ? await repo.getTaskVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestTask(this.serviceCtx.db, id);

      if (!task) {
        throw new NotFoundError(
          `Task not found: ${id}${version ? ` version ${version}` : ''}`,
          'task',
          id,
        );
      }

      return { task };
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
      // If name is specified, return single-item list or empty
      if (options?.name) {
        const task = await repo.getTaskByName(
          this.serviceCtx.db,
          options.name,
          options?.projectId ?? null,
          options?.libraryId ?? null,
        );
        return { tasks: task ? [task] : [] };
      }

      let tasks: Task[];

      if (options?.projectId) {
        tasks = await repo.listTasksByProject(
          this.serviceCtx.db,
          options.projectId,
          options?.limit,
        );
      } else if (options?.libraryId) {
        tasks = await repo.listTasksByLibrary(
          this.serviceCtx.db,
          options.libraryId,
          options?.limit,
        );
      } else {
        tasks = await repo.listTasks(this.serviceCtx.db, options?.limit);
      }

      return { tasks };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { taskId: id, version } }, async () => {
      // Check if exists first
      const existing = version
        ? await repo.getTaskVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestTask(this.serviceCtx.db, id);

      if (!existing) {
        throw new NotFoundError(
          `Task not found: ${id}${version ? ` version ${version}` : ''}`,
          'task',
          id,
        );
      }

      await repo.deleteTask(this.serviceCtx.db, id, version);
      return { success: true };
    });
  }
}

export type { Task };
