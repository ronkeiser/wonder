/** WorkflowDefs RPC resource */

import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/errors';
import { Resource } from '../base';
import { computeFingerprint } from './fingerprint';
import * as repo from './repository';
import { generateIds, transformWorkflowDef } from './transformer';
import type { Node, Transition, WorkflowDef } from './types';
import { validateWorkflowDef, type WorkflowDefInput } from './validator';

export class WorkflowDefs extends Resource {
  async create(data: WorkflowDefInput): Promise<{
    workflow_def_id: string;
    workflow_def: WorkflowDef;
    /** True if an existing workflow def was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_def.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    // 1. Validate all input data (pure validation, no side effects)
    try {
      validateWorkflowDef(data);
    } catch (error) {
      if (error instanceof ValidationError) {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_def.validation.failed',
          metadata: { error: error.code, path: error.path },
        });
      }
      throw error;
    }

    // 2. Autoversion deduplication check
    if (data.autoversion) {
      const contentHash = await computeFingerprint(data);
      const projectId = data.project_id ?? null;
      const libraryId = data.library_id ?? null;

      // Check for existing workflow with same name + owner + content
      const existing = await repo.getWorkflowDefByNameAndHash(
        this.serviceCtx.db,
        data.name,
        projectId,
        libraryId,
        contentHash,
      );

      if (existing) {
        // Exact match found - return existing without creating
        this.serviceCtx.logger.info({
          event_type: 'workflow_def.autoversion.matched',
          metadata: {
            workflow_def_id: existing.id,
            version: existing.version,
            name: existing.name,
            content_hash: contentHash,
          },
        });

        return {
          workflow_def_id: existing.id,
          workflow_def: existing,
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
        event_type: 'workflow_def.autoversion.creating',
        metadata: {
          name: data.name,
          version: newVersion,
          content_hash: contentHash,
          existing_max_version: maxVersion,
        },
      });

      // Create with computed version and content hash
      return this.createWithVersionAndHash(data, newVersion, contentHash);
    }

    // 3. Non-autoversion path: create with version 1 (original behavior)
    return this.createWithVersionAndHash(data, 1, null);
  }

  /**
   * Internal helper to create a workflow def with specified version and content hash.
   */
  private async createWithVersionAndHash(
    data: WorkflowDefInput,
    version: number,
    contentHash: string | null,
  ): Promise<{
    workflow_def_id: string;
    workflow_def: WorkflowDef;
    reused: boolean;
  }> {
    // Generate IDs and transform refs → IDs
    const ids = generateIds(data);
    const transformed = transformWorkflowDef(data, ids);

    // DEBUG: Log transformed transitions
    this.serviceCtx.logger.info({
      event_type: 'workflow_def.transitions.transformed',
      metadata: {
        workflow_def_id: ids.workflowDefId,
        transitions: transformed.transitions.map((t) => ({
          id: t.id,
          ref: t.ref,
          spawn_count: t.spawn_count,
          synchronization: t.synchronization,
        })),
      },
    });

    // Create workflow def with pre-generated ID, version, and content hash
    let workflowDef;
    try {
      workflowDef = await repo.createWorkflowDefWithId(this.serviceCtx.db, {
        id: ids.workflowDefId,
        name: data.name,
        description: data.description,
        version,
        project_id: data.project_id ?? null,
        library_id: data.library_id ?? null,
        tags: data.tags ?? null,
        input_schema: data.input_schema,
        output_schema: data.output_schema,
        output_mapping: data.output_mapping ?? null,
        context_schema: data.context_schema ?? null,
        initial_node_id: transformed.initialNodeId,
        content_hash: contentHash,
      });
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_def.create.conflict',
          metadata: { name: data.name, field: dbError.field },
        });
        throw new ConflictError(
          `WorkflowDef with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      this.serviceCtx.logger.error({
        event_type: 'workflow_def.create.failed',
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
          workflow_def_id: workflowDef.id,
          workflow_def_version: workflowDef.version,
        });
      }
    } catch (error) {
      this.serviceCtx.logger.error({
        event_type: 'workflow_def.node.create.failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: { workflow_def_id: workflowDef.id, name: data.name },
      });
      throw error;
    }

    // Create transitions with transformed IDs (including synchronization.sibling_group)
    try {
      for (const transition of transformed.transitions) {
        console.log('[RESOURCES] Creating transition:', {
          id: transition.id,
          ref: transition.ref,
          spawn_count: transition.spawn_count,
          synchronization: transition.synchronization,
        });
        await repo.createTransitionWithId(this.serviceCtx.db, {
          ...transition,
          workflow_def_id: workflowDef.id,
          workflow_def_version: workflowDef.version,
        });
      }
    } catch (error) {
      this.serviceCtx.logger.error({
        event_type: 'workflow_def.transition.create.failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: { workflow_def_id: workflowDef.id, name: data.name },
      });
      throw error;
    }

    this.serviceCtx.logger.info({
      event_type: 'workflow_def.created',
      metadata: {
        workflow_def_id: workflowDef.id,
        version: workflowDef.version,
        name: workflowDef.name,
        content_hash: contentHash,
      },
    });

    return {
      workflow_def_id: workflowDef.id,
      workflow_def: workflowDef,
      reused: false,
    };
  }

  async get(
    workflowDefId: string,
    version?: number,
  ): Promise<{
    workflow_def: WorkflowDef;
    nodes: Node[];
    transitions: Transition[];
  }> {
    return this.withLogging(
      'get',
      {
        workflow_def_id: workflowDefId,
        version,
        metadata: { workflow_def_id: workflowDefId, version },
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
          workflow_def: workflowDef,
          nodes,
          transitions,
        };
      },
    );
  }

  async delete(workflowDefId: string, version?: number): Promise<void> {
    return this.withLogging(
      'delete',
      {
        workflow_def_id: workflowDefId,
        version,
        metadata: { workflow_def_id: workflowDefId, version },
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
