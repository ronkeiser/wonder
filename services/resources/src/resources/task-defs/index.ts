/** TaskDefs RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import type { RetryConfig, Step } from '../../infrastructure/db/schema';
import { Resource } from '../base';
import * as repo from './repository';
import type { TaskDef } from './types';

export class TaskDefs extends Resource {
  async create(data: {
    version?: number;
    name: string;
    description?: string;
    project_id?: string;
    library_id?: string;
    tags?: string[];
    input_schema: object;
    output_schema: object;
    steps: Step[];
    retry?: RetryConfig;
    timeout_ms?: number;
  }): Promise<{
    task_def_id: string;
    task_def: TaskDef;
  }> {
    return this.withLogging(
      'create',
      { metadata: { name: data.name, version: data.version ?? 1 } },
      async () => {
        try {
          const taskDef = await repo.createTaskDef(this.serviceCtx.db, {
            version: data.version ?? 1,
            name: data.name,
            description: data.description ?? '',
            project_id: data.project_id ?? null,
            library_id: data.library_id ?? null,
            tags: data.tags ?? null,
            input_schema: data.input_schema,
            output_schema: data.output_schema,
            steps: data.steps,
            retry: data.retry ?? null,
            timeout_ms: data.timeout_ms ?? null,
          });

          return {
            task_def_id: taskDef.id,
            task_def: taskDef,
          };
        } catch (error) {
          const dbError = extractDbError(error);

          if (dbError.constraint === 'unique') {
            throw new ConflictError(
              `TaskDef with ${dbError.field} already exists`,
              dbError.field,
              'unique',
            );
          }

          if (dbError.constraint === 'foreign_key') {
            throw new ConflictError('Referenced entity does not exist', undefined, 'foreign_key');
          }

          throw error;
        }
      },
    );
  }

  async get(
    id: string,
    version?: number,
  ): Promise<{
    task_def: TaskDef;
  }> {
    return this.withLogging('get', { metadata: { task_def_id: id, version } }, async () => {
      const taskDef = version
        ? await repo.getTaskDefVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestTaskDef(this.serviceCtx.db, id);

      if (!taskDef) {
        throw new NotFoundError(
          `TaskDef not found: ${id}${version ? ` version ${version}` : ''}`,
          'task_def',
          id,
        );
      }

      return { task_def: taskDef };
    });
  }

  async list(options?: { project_id?: string; library_id?: string; limit?: number }): Promise<{
    task_defs: TaskDef[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      let taskDefs: TaskDef[];

      if (options?.project_id) {
        taskDefs = await repo.listTaskDefsByProject(
          this.serviceCtx.db,
          options.project_id,
          options?.limit,
        );
      } else if (options?.library_id) {
        taskDefs = await repo.listTaskDefsByLibrary(
          this.serviceCtx.db,
          options.library_id,
          options?.limit,
        );
      } else {
        taskDefs = await repo.listTaskDefs(this.serviceCtx.db, options?.limit);
      }

      return { task_defs: taskDefs };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { task_def_id: id, version } }, async () => {
      // Check if exists first
      const existing = version
        ? await repo.getTaskDefVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestTaskDef(this.serviceCtx.db, id);

      if (!existing) {
        throw new NotFoundError(
          `TaskDef not found: ${id}${version ? ` version ${version}` : ''}`,
          'task_def',
          id,
        );
      }

      await repo.deleteTaskDef(this.serviceCtx.db, id, version);
      return { success: true };
    });
  }
}

export type { TaskDef };
