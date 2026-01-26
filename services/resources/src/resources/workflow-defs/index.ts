/** WorkflowDefs RPC resource */

import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import {
  createDefinition,
  deleteDefinition,
  getDefinition,
  getLatestDefinition,
  listDefinitions,
  type Definition,
} from '~/shared/definitions';
import type { WorkflowDefContent } from '~/shared/content-schemas';
import * as repo from './repository';
import { transformWorkflowDef } from './transformer';
import type { Node, Transition, WorkflowDef, WorkflowDefInput } from './types';
import { validateWorkflowDef } from './validator';

/**
 * Maps a Definition to the legacy WorkflowDef shape for API compatibility.
 */
function toWorkflowDef(def: Definition): WorkflowDef {
  const content = def.content as WorkflowDefContent;
  return {
    id: def.id,
    version: def.version,
    name: content.name,
    description: def.description,
    reference: def.reference,
    projectId: def.projectId,
    libraryId: def.libraryId,
    tags: null, // Tags not stored in content schema currently
    inputSchema: content.inputSchema,
    outputSchema: content.outputSchema,
    outputMapping: content.outputMapping ?? null,
    contextSchema: content.contextSchema ?? null,
    initialNodeId: content.initialNodeId ?? null,
    contentHash: def.contentHash,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

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

    // Transform refs → IDs (single-pass: generates all IDs inline)
    const transformed = transformWorkflowDef(data);

    // DEBUG: Log transformed transitions
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

    // 2. Create definition via definitions-repository
    let result;
    try {
      result = await createDefinition(this.serviceCtx.db, 'workflow_def', {
        id: transformed.definitionId, // Use pre-generated ID for consistency with nodes/transitions
        reference,
        name: data.name,
        description: data.description,
        projectId: data.projectId,
        libraryId: data.libraryId,
        content: {
          name: data.name,
          inputSchema: data.inputSchema,
          outputSchema: data.outputSchema,
          outputMapping: data.outputMapping,
          contextSchema: data.contextSchema,
          initialNodeId: transformed.initialNodeId,
          nodes: transformed.nodes,
          transitions: transformed.transitions,
        },
        autoversion: data.autoversion,
        force: data.force,
      });
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

    if (result.reused) {
      return {
        workflowDefId: result.definition.id,
        workflowDef: toWorkflowDef(result.definition),
        reused: true,
        version: result.definition.version,
        latestVersion: result.latestVersion,
      };
    }

    const workflowDef = toWorkflowDef(result.definition);

    // 3. Create all nodes with pre-generated IDs
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

    // 4. Create transitions with transformed IDs
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
      workflowDef: workflowDef,
      reused: false,
      version: workflowDef.version,
    };
  }

  async get(
    workflowDefId: string,
    version?: number,
  ): Promise<{
    workflowDef: WorkflowDef;
    /** Raw definition row for coordinator DO SQLite insertion */
    definition: Definition;
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
        const definition = await getDefinition(this.serviceCtx.db, workflowDefId, version);

        if (!definition || definition.kind !== 'workflow_def') {
          throw new NotFoundError(`WorkflowDef not found: ${workflowDefId}`, 'workflow_def', workflowDefId);
        }

        const nodes = await repo.listNodesByDefinition(this.serviceCtx.db, workflowDefId, definition.version);
        const transitions = await repo.listTransitionsByDefinition(this.serviceCtx.db, workflowDefId, definition.version);

        return {
          workflowDef: toWorkflowDef(definition),
          definition,
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
      // If name is specified, find by reference (name is normalized to reference)
      if (options?.name) {
        const definition = await getLatestDefinition(this.serviceCtx.db, 'workflow_def', options.name, {
          projectId: options.projectId ?? null,
          libraryId: options.libraryId ?? null,
        });
        return { workflowDefs: definition ? [toWorkflowDef(definition)] : [] };
      }

      const defs = await listDefinitions(this.serviceCtx.db, 'workflow_def', {
        projectId: options?.projectId,
        libraryId: options?.libraryId,
        limit: options?.limit,
      });

      return { workflowDefs: defs.map(toWorkflowDef) };
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
        const definition = await getDefinition(this.serviceCtx.db, workflowDefId, version);

        if (!definition || definition.kind !== 'workflow_def') {
          throw new NotFoundError(`WorkflowDef not found: ${workflowDefId}`, 'workflow_def', workflowDefId);
        }

        // Delete nodes and transitions first (they have FK to definitions)
        await repo.deleteNodesAndTransitions(this.serviceCtx.db, workflowDefId, definition.version);

        // Delete the definition
        await deleteDefinition(this.serviceCtx.db, workflowDefId, version);
      },
    );
  }
}

export type { WorkflowDef };
export type { Definition };
