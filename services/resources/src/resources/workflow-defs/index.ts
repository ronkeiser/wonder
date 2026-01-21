/** WorkflowDefs RPC resource */

import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import { transformWorkflowDef } from './transformer';
import type { Node, Transition, WorkflowDef, WorkflowDefInput } from './types';
import { validateWorkflowDef } from './validator';

export class WorkflowDefs extends Resource {
  async create(data: WorkflowDefInput): Promise<{
    workflowDefId: string;
    workflowDef: WorkflowDef;
    /** True if an existing workflow def was reused (autoversion matched content hash) */
    reused: boolean;
    /** Version number of the created/reused workflow def */
    version: number;
    /** Latest version for this name (only present when reused=true) */
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

    const scope = {
      projectId: data.projectId ?? null,
      libraryId: data.libraryId ?? null,
    };

    // 2. Autoversion deduplication check
    const autoversionResult = await this.withAutoversion<WorkflowDef>(
      data as unknown as Record<string, unknown> & { name: string; reference?: string; autoversion?: boolean },
      {
        findByReferenceAndHash: (reference, hash, s) =>
          repo.getWorkflowDefByReferenceAndHash(
            this.serviceCtx.db,
            reference,
            s?.projectId ?? null,
            s?.libraryId ?? null,
            hash,
          ),
        getMaxVersion: (reference, s) =>
          repo.getMaxVersionByReference(
            this.serviceCtx.db,
            reference,
            s?.projectId ?? null,
            s?.libraryId ?? null,
          ),
      },
      scope,
    );

    if (autoversionResult.reused) {
      return {
        workflowDefId: autoversionResult.entity.id,
        workflowDef: autoversionResult.entity,
        reused: true,
        version: autoversionResult.entity.version,
        latestVersion: autoversionResult.latestVersion,
      };
    }

    const version = data.autoversion ? autoversionResult.version : 1;

    // 3. Create with computed version and content hash
    // Transform refs → IDs (single-pass: generates all IDs inline)
    const transformed = transformWorkflowDef(data);

    // DEBUG: Log transformed transitions
    this.serviceCtx.logger.info({
      eventType: 'workflow_def.transitions.transformed',
      metadata: {
        workflowDefId: transformed.workflowDefId,
        transitions: transformed.transitions.map((t) => ({
          id: t.id,
          ref: t.ref,
          spawnCount: t.spawnCount,
          synchronization: t.synchronization,
        })),
      },
    });

    // Create workflow def with pre-generated ID, version, and content hash
    let workflowDef;
    try {
      workflowDef = await repo.createWorkflowDefWithId(this.serviceCtx.db, {
        ...data,
        id: transformed.workflowDefId,
        version,
        initialNodeId: transformed.initialNodeId,
        contentHash: autoversionResult.contentHash,
      });
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn({
          eventType: 'workflow_def.create.conflict',
          metadata: { name: data.name, field: dbError.field },
        });
        throw new ConflictError(
          `WorkflowDef with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      this.serviceCtx.logger.error({
        eventType: 'workflow_def.create.failed',
        message: dbError.message,
        metadata: { name: data.name },
      });
      throw error;
    }

    // Create all nodes with pre-generated IDs
    try {
      for (const node of transformed.nodes) {
        await repo.createNodeWithId(this.serviceCtx.db, {
          ...node,
          workflowDefId: workflowDef.id,
          workflowDefVersion: workflowDef.version,
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

    // Create transitions with transformed IDs (including synchronization.siblingGroup)
    try {
      for (const transition of transformed.transitions) {
        console.log('[RESOURCES] Creating transition:', {
          id: transition.id,
          ref: transition.ref,
          spawnCount: transition.spawnCount,
          synchronization: transition.synchronization,
        });
        await repo.createTransitionWithId(this.serviceCtx.db, {
          ...transition,
          workflowDefId: workflowDef.id,
          workflowDefVersion: workflowDef.version,
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
        content_hash: autoversionResult.contentHash,
      },
    });

    return {
      workflowDefId: workflowDef.id,
      workflowDef: workflowDef,
      reused: false,
      version,
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
      {
        workflowDefId: workflowDefId,
        version,
        metadata: { workflowDefId: workflowDefId, version },
      },
      async () => {
        const workflowDef = await repo.getWorkflowDef(this.serviceCtx.db, workflowDefId, version);
        if (!workflowDef) {
          throw new NotFoundError(
            `WorkflowDef not found: ${workflowDefId}`,
            'workflow_def',
            workflowDefId,
          );
        }

        const nodes = await repo.listNodesByWorkflowDef(this.serviceCtx.db, workflowDefId);
        const transitions = await repo.listTransitionsByWorkflowDef(
          this.serviceCtx.db,
          workflowDefId,
        );

        return {
          workflowDef: workflowDef,
          nodes,
          transitions,
        };
      },
    );
  }

  async list(options?: {
    projectId?: string;
    libraryId?: string;
    name?: string;
    limit?: number;
  }): Promise<{
    workflowDefs: WorkflowDef[];
  }> {
    return this.withLogging('list', { metadata: options }, async () => {
      // If name is specified, return single-item list or empty
      if (options?.name) {
        const workflowDef = await repo.getWorkflowDefByName(
          this.serviceCtx.db,
          options.name,
          options?.projectId ?? null,
          options?.libraryId ?? null,
        );
        return { workflowDefs: workflowDef ? [workflowDef] : [] };
      }

      let workflowDefs: WorkflowDef[];

      if (options?.projectId) {
        workflowDefs = await repo.listWorkflowDefsByProject(this.serviceCtx.db, options.projectId);
      } else if (options?.libraryId) {
        workflowDefs = await repo.listWorkflowDefsByLibrary(this.serviceCtx.db, options.libraryId);
      } else {
        workflowDefs = await repo.listWorkflowDefs(this.serviceCtx.db, options?.limit);
      }

      return { workflowDefs };
    });
  }

  async delete(workflowDefId: string, version?: number): Promise<void> {
    return this.withLogging(
      'delete',
      {
        workflowDefId: workflowDefId,
        version,
        metadata: { workflowDefId: workflowDefId, version },
      },
      async () => {
        const workflowDef = await repo.getWorkflowDef(this.serviceCtx.db, workflowDefId, version);
        if (!workflowDef) {
          throw new NotFoundError(
            `WorkflowDef not found: ${workflowDefId}`,
            'workflow_def',
            workflowDefId,
          );
        }

        await repo.deleteWorkflowDef(this.serviceCtx.db, workflowDefId, version);
      },
    );
  }
}
