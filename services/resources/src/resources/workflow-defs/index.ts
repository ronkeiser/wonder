/** WorkflowDefs RPC resource */

import { and, eq } from 'drizzle-orm';
import { workflowDefs } from '~/schema';
import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/shared/errors';
import { computeContentHash } from '~/shared/fingerprint';
import { Resource } from '~/shared/resource';
import {
  getByIdAndVersion,
  getByReferenceAndHash,
  getLatestByReference,
  getMaxVersion,
  deleteById,
} from '~/shared/versioning';
import * as repo from './repository';
import { transformWorkflowDef } from './transformer';
import type { Node, Transition, WorkflowDef, WorkflowDefInput } from './types';
import { validateWorkflowDef } from './validator';

const scopeCols = { projectId: workflowDefs.projectId, libraryId: workflowDefs.libraryId };

function hashableContent(
  data: WorkflowDefInput,
  transformed: { initialNodeId: string; nodes: unknown[]; transitions: unknown[] },
): Record<string, unknown> {
  return {
    name: data.name,
    inputSchema: data.inputSchema,
    outputSchema: data.outputSchema,
    outputMapping: data.outputMapping ?? null,
    contextSchema: data.contextSchema ?? null,
    initialNodeId: transformed.initialNodeId,
    nodes: transformed.nodes,
    transitions: transformed.transitions,
  };
}

export class WorkflowDefs extends Resource {
  async create(data: WorkflowDefInput): Promise<{
    workflowDefId: string;
    workflowDef: WorkflowDef;
    reused: boolean;
    version: number;
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'workflow_def.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    // 1. Validate all input data (pure validation, no side effects)
    try {
      validateWorkflowDef(data);
    } catch (error) {
      if (error instanceof ValidationError) {
        this.serviceCtx.logger.warn({
          eventType: 'workflow_def.validation.failed',
          metadata: { error: error.code, path: error.path },
        });
      }
      throw error;
    }

    // Transform refs → IDs (single-pass: generates all IDs inline)
    const transformed = transformWorkflowDef(data);

    this.serviceCtx.logger.info({
      eventType: 'workflow_def.transitions.transformed',
      metadata: {
        definitionId: transformed.definitionId,
        transitions: transformed.transitions.map((t) => ({
          id: t.id,
          ref: t.ref,
          spawnCount: t.spawnCount,
          synchronization: t.synchronization,
        })),
      },
    });

    const reference = data.reference ?? data.name;
    const scope = { projectId: data.projectId ?? null, libraryId: data.libraryId ?? null };

    const contentHash = await computeContentHash(
      hashableContent(data, transformed),
    );

    // 2. Check for dedup (autoversion without force)
    if (data.autoversion && !data.force) {
      const existing = await getByReferenceAndHash(
        this.serviceCtx.db, workflowDefs, reference, contentHash, scope, scopeCols,
      );

      if (existing) {
        const latestVersion = await getMaxVersion(
          this.serviceCtx.db, workflowDefs, reference, scope, scopeCols,
        );
        return {
          workflowDefId: existing.id,
          workflowDef: existing,
          reused: true,
          version: existing.version,
          latestVersion,
        };
      }
    }

    // 3. Determine version and stable ID
    const maxVersion = await getMaxVersion(
      this.serviceCtx.db, workflowDefs, reference, scope, scopeCols,
    );
    const version = (data.autoversion || data.force) ? maxVersion + 1 : 1;

    let stableId: string;
    if (maxVersion > 0) {
      const latest = await getLatestByReference(
        this.serviceCtx.db, workflowDefs, reference, scope, scopeCols,
      );
      stableId = latest?.id ?? transformed.definitionId;
    } else {
      stableId = transformed.definitionId;
    }

    const now = new Date().toISOString();

    // 4. Insert workflow def
    let workflowDef: WorkflowDef;
    try {
      const [row] = await this.serviceCtx.db
        .insert(workflowDefs)
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
          outputMapping: data.outputMapping ?? null,
          contextSchema: data.contextSchema ?? null,
          initialNodeId: transformed.initialNodeId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      workflowDef = row;
    } catch (error) {
      const dbError = extractDbError(error);
      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn({
          eventType: 'workflow_def.create.conflict',
          metadata: { name: data.name, field: dbError.field },
        });
        throw new ConflictError(`WorkflowDef with ${dbError.field} already exists`, dbError.field, 'unique');
      }
      this.serviceCtx.logger.error({
        eventType: 'workflow_def.create.failed',
        message: dbError.message,
        metadata: { name: data.name },
      });
      throw error;
    }

    // 5. Create all nodes with pre-generated IDs
    try {
      for (const node of transformed.nodes) {
        await repo.createNodeWithId(this.serviceCtx.db, {
          ...node,
          definitionId: workflowDef.id,
          definitionVersion: workflowDef.version,
        });
      }
    } catch (error) {
      this.serviceCtx.logger.error({
        eventType: 'workflow_def.node.create.failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: { workflowDefId: workflowDef.id, name: data.name },
      });
      throw error;
    }

    // 6. Create transitions with transformed IDs
    try {
      for (const transition of transformed.transitions) {
        await repo.createTransitionWithId(this.serviceCtx.db, {
          ...transition,
          definitionId: workflowDef.id,
          definitionVersion: workflowDef.version,
        });
      }
    } catch (error) {
      this.serviceCtx.logger.error({
        eventType: 'workflow_def.transition.create.failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: { workflowDefId: workflowDef.id, name: data.name },
      });
      throw error;
    }

    this.serviceCtx.logger.info({
      eventType: 'workflow_def.created',
      metadata: {
        workflowDefId: workflowDef.id,
        version: workflowDef.version,
        name: workflowDef.name,
        content_hash: workflowDef.contentHash,
      },
    });

    return {
      workflowDefId: workflowDef.id,
      workflowDef,
      reused: false,
      version: workflowDef.version,
    };
  }

  async get(
    workflowDefId: string,
    version?: number,
  ): Promise<{
    workflowDef: WorkflowDef;
    nodes: Node[];
    transitions: Transition[];
  }> {
    return this.withLogging(
      'get',
      { metadata: { workflowDefId, version } },
      async () => {
        const workflowDef = await getByIdAndVersion(
          this.serviceCtx.db, workflowDefs, workflowDefId, version,
        );

        if (!workflowDef) {
          throw new NotFoundError(`WorkflowDef not found: ${workflowDefId}`, 'workflow_def', workflowDefId);
        }

        const nodes = await repo.listNodesByDefinition(this.serviceCtx.db, workflowDefId, workflowDef.version);
        const transitions = await repo.listTransitionsByDefinition(this.serviceCtx.db, workflowDefId, workflowDef.version);

        return { workflowDef, nodes, transitions };
      },
    );
  }

  async list(options?: {
    projectId?: string;
    libraryId?: string;
    name?: string;
    limit?: number;
  }): Promise<{ workflowDefs: WorkflowDef[] }> {
    return this.withLogging('list', { metadata: options }, async () => {
      if (options?.name) {
        const scope = { projectId: options.projectId ?? null, libraryId: options.libraryId ?? null };
        const workflowDef = await getLatestByReference(
          this.serviceCtx.db, workflowDefs, options.name, scope, scopeCols,
        );
        return { workflowDefs: workflowDef ? [workflowDef] : [] };
      }

      const conditions = [];
      if (options?.projectId) {
        conditions.push(eq(workflowDefs.projectId, options.projectId));
      } else if (options?.libraryId) {
        conditions.push(eq(workflowDefs.libraryId, options.libraryId));
      }

      const results = await this.serviceCtx.db
        .select()
        .from(workflowDefs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(options?.limit ?? 100)
        .all();

      return { workflowDefs: results };
    });
  }

  async delete(workflowDefId: string, version?: number): Promise<void> {
    return this.withLogging(
      'delete',
      { metadata: { workflowDefId, version } },
      async () => {
        const workflowDef = await getByIdAndVersion(
          this.serviceCtx.db, workflowDefs, workflowDefId, version,
        );

        if (!workflowDef) {
          throw new NotFoundError(`WorkflowDef not found: ${workflowDefId}`, 'workflow_def', workflowDefId);
        }

        // Delete nodes and transitions first (they have FK to workflow_defs)
        await repo.deleteNodesAndTransitions(this.serviceCtx.db, workflowDefId, workflowDef.version);

        // Delete the workflow def
        await deleteById(this.serviceCtx.db, workflowDefs, workflowDefId, version);
      },
    );
  }
}

export type { WorkflowDef };
