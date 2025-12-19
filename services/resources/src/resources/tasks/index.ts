/** Tasks RPC resource */

import { ulid } from 'ulid';
import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import type { RetryConfig, Step } from '../../schema';
import { Resource } from '../base';
import { computeFingerprint } from './fingerprint';
import * as repo from './repository';
import type { Task, StepInput } from './types';

export class Tasks extends Resource {
  async create(data: {
    version?: number;
    name: string;
    description?: string;
    project_id?: string;
    library_id?: string;
    tags?: string[];
    input_schema: object;
    output_schema: object;
    steps: StepInput[];
    retry?: RetryConfig;
    timeout_ms?: number;
    autoversion?: boolean;
  }): Promise<{
    task_id: string;
    task: Task;
    /** True if an existing task was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'task.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    // Autoversion deduplication check
    if (data.autoversion) {
      const contentHash = await computeFingerprint(data);
      const projectId = data.project_id ?? null;
      const libraryId = data.library_id ?? null;

      // Check for existing task with same name + owner + content
      const existing = await repo.getTaskByNameAndHash(
        this.serviceCtx.db,
        data.name,
        contentHash,
        projectId,
        libraryId,
      );

      if (existing) {
        this.serviceCtx.logger.info({
          event_type: 'task.autoversion.matched',
          metadata: {
            task_id: existing.id,
            version: existing.version,
            name: existing.name,
            content_hash: contentHash,
          },
        });

        return {
          task_id: existing.id,
          task: existing,
          reused: true,
        };
      }

      // No exact match - determine version number
      const maxVersion = await repo.getMaxVersionByName(
        this.serviceCtx.db,
        data.name,
        projectId,
        libraryId,
      );
      const newVersion = maxVersion + 1;

      this.serviceCtx.logger.info({
        event_type: 'task.autoversion.creating',
        metadata: {
          name: data.name,
          version: newVersion,
          content_hash: contentHash,
          existing_max_version: maxVersion,
        },
      });

      return this.createWithVersionAndHash(data, newVersion, contentHash);
    }

    // Non-autoversion path: create with version 1 (original behavior)
    return this.createWithVersionAndHash(data, data.version ?? 1, null);
  }

  private async createWithVersionAndHash(
    data: {
      name: string;
      description?: string;
      project_id?: string;
      library_id?: string;
      tags?: string[];
      input_schema: object;
      output_schema: object;
      steps: StepInput[];
      retry?: RetryConfig;
      timeout_ms?: number;
    },
    version: number,
    contentHash: string | null,
  ): Promise<{
    task_id: string;
    task: Task;
    reused: boolean;
  }> {
    // Generate step IDs
    const stepsWithIds: Step[] = data.steps.map((step) => ({
      id: ulid(),
      ref: step.ref,
      ordinal: step.ordinal,
      action_id: step.action_id,
      action_version: step.action_version,
      input_mapping: step.input_mapping ?? null,
      output_mapping: step.output_mapping ?? null,
      on_failure: step.on_failure,
      condition: step.condition ?? null,
    }));

    try {
      const task = await repo.createTask(this.serviceCtx.db, {
        version,
        name: data.name,
        description: data.description ?? '',
        project_id: data.project_id ?? null,
        library_id: data.library_id ?? null,
        tags: data.tags ?? null,
        input_schema: data.input_schema,
        output_schema: data.output_schema,
        steps: stepsWithIds,
        retry: data.retry ?? null,
        timeout_ms: data.timeout_ms ?? null,
        content_hash: contentHash,
      });

      return {
        task_id: task.id,
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
    return this.withLogging('get', { metadata: { task_id: id, version } }, async () => {
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

  async list(options?: { project_id?: string; library_id?: string; limit?: number }): Promise<{
    tasks: Task[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      let tasks: Task[];

      if (options?.project_id) {
        tasks = await repo.listTasksByProject(
          this.serviceCtx.db,
          options.project_id,
          options?.limit,
        );
      } else if (options?.library_id) {
        tasks = await repo.listTasksByLibrary(
          this.serviceCtx.db,
          options.library_id,
          options?.limit,
        );
      } else {
        tasks = await repo.listTasks(this.serviceCtx.db, options?.limit);
      }

      return { tasks };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { task_id: id, version } }, async () => {
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
