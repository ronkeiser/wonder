/** Tasks RPC resource */

import { and, eq, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { tasks } from '~/schema';
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
import type { Task, TaskInput } from './types';

const scopeCols = { projectId: tasks.projectId, libraryId: tasks.libraryId };

function hashableContent(data: TaskInput, stepsWithIds: unknown[]): Record<string, unknown> {
  return {
    name: data.name,
    inputSchema: data.inputSchema,
    outputSchema: data.outputSchema,
    steps: stepsWithIds,
    retry: data.retry ?? null,
    timeoutMs: data.timeoutMs ?? null,
  };
}

export class Tasks extends Resource {
  async create(data: TaskInput): Promise<{
    taskId: string;
    task: Task;
    reused: boolean;
    version: number;
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'task.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    const reference = data.reference ?? data.name;
    const scope = { projectId: data.projectId ?? null, libraryId: data.libraryId ?? null };

    // Generate step IDs
    const stepsWithIds = data.steps.map((step) => ({ ...step, id: ulid() }));

    const contentHash = await computeContentHash(hashableContent(data, stepsWithIds));

    if (data.autoversion && !data.force) {
      const existing = await getByReferenceAndHash(
        this.serviceCtx.db, tasks, reference, contentHash, scope, scopeCols,
      );

      if (existing) {
        const latestVersion = await getMaxVersion(
          this.serviceCtx.db, tasks, reference, scope, scopeCols,
        );
        return {
          taskId: existing.id,
          task: existing,
          reused: true,
          version: existing.version,
          latestVersion,
        };
      }
    }

    const maxVersion = await getMaxVersion(
      this.serviceCtx.db, tasks, reference, scope, scopeCols,
    );
    const version = (data.autoversion || data.force) ? maxVersion + 1 : 1;

    let stableId: string;
    if (maxVersion > 0) {
      const latest = await getLatestByReference(
        this.serviceCtx.db, tasks, reference, scope, scopeCols,
      );
      stableId = latest?.id ?? ulid();
    } else {
      stableId = ulid();
    }

    const now = new Date().toISOString();

    try {
      const [task] = await this.serviceCtx.db
        .insert(tasks)
        .values({
          id: stableId,
          version,
          reference,
          name: data.name,
          description: data.description ?? '',
          contentHash,
          projectId: data.projectId ?? null,
          libraryId: data.libraryId ?? null,
          inputSchema: data.inputSchema,
          outputSchema: data.outputSchema,
          steps: stepsWithIds,
          retry: data.retry ?? null,
          timeoutMs: data.timeoutMs ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        taskId: task.id,
        task,
        reused: false,
        version: task.version,
      };
    } catch (error) {
      const dbError = extractDbError(error);
      if (dbError.constraint === 'unique') {
        throw new ConflictError(`Task with ${dbError.field} already exists`, dbError.field, 'unique');
      }
      if (dbError.constraint === 'foreign_key') {
        throw new ConflictError('Referenced entity does not exist', undefined, 'foreign_key');
      }
      throw error;
    }
  }

  async get(id: string, version?: number): Promise<{ task: Task }> {
    return this.withLogging('get', { metadata: { taskId: id, version } }, async () => {
      const task = await getByIdAndVersion(this.serviceCtx.db, tasks, id, version);

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
  }): Promise<{ tasks: Task[] }> {
    return this.withLogging('list', { metadata: options }, async () => {
      if (options?.name) {
        const scope = { projectId: options.projectId ?? null, libraryId: options.libraryId ?? null };
        const task = await getLatestByReference(
          this.serviceCtx.db, tasks, options.name, scope, scopeCols,
        );
        return { tasks: task ? [task] : [] };
      }

      const conditions = [];
      if (options?.projectId) {
        conditions.push(eq(tasks.projectId, options.projectId));
      } else if (options?.libraryId) {
        conditions.push(eq(tasks.libraryId, options.libraryId));
      }

      const results = await this.serviceCtx.db
        .select()
        .from(tasks)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(options?.limit ?? 100)
        .all();

      return { tasks: results };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging('delete', { metadata: { taskId: id, version } }, async () => {
      const existing = await getByIdAndVersion(this.serviceCtx.db, tasks, id, version);

      if (!existing) {
        throw new NotFoundError(
          `Task not found: ${id}${version ? ` version ${version}` : ''}`,
          'task',
          id,
        );
      }

      await deleteById(this.serviceCtx.db, tasks, id, version);
      return { success: true };
    });
  }
}

export type { Task };
