/** WorkflowDefs RPC resource */

import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';
import { generateIds, transformWorkflowDef } from './transformer';
import type { Node, Transition, WorkflowDef } from './types';
import { validateWorkflowDef, type WorkflowDefInput } from './validator';

export class WorkflowDefs extends Resource {
  async create(data: WorkflowDefInput): Promise<{
    workflow_def_id: string;
    workflow_def: WorkflowDef;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_def_create_started',
      metadata: { name: data.name },
    });

    // 1. Validate all input data (pure validation, no side effects)
    try {
      validateWorkflowDef(data);
    } catch (error) {
      if (error instanceof ValidationError) {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_def_validation_failed',
          metadata: { error: error.code, path: error.path },
        });
      }
      throw error;
    }

    // 2. Generate IDs and transform refs → IDs
    const ids = generateIds(data);
    const transformed = transformWorkflowDef(data, ids);

    // DEBUG: Log transformed transitions
    this.serviceCtx.logger.info({
      event_type: 'workflow_def_transitions_transformed',
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

    // 3. Create workflow def with pre-generated ID and initial_node_id
    let workflowDef;
    try {
      workflowDef = await repo.createWorkflowDefWithId(this.serviceCtx.db, {
        id: ids.workflowDefId,
        name: data.name,
        description: data.description,
        project_id: data.project_id ?? null,
        library_id: data.library_id ?? null,
        tags: data.tags ?? null,
        input_schema: data.input_schema,
        output_schema: data.output_schema,
        output_mapping: data.output_mapping ?? null,
        context_schema: data.context_schema ?? null,
        initial_node_id: transformed.initialNodeId,
      });
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_def_create_conflict',
          metadata: { name: data.name, field: dbError.field },
        });
        throw new ConflictError(
          `WorkflowDef with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      this.serviceCtx.logger.error({
        event_type: 'workflow_def_create_failed',
        message: dbError.message,
        metadata: { name: data.name },
      });
      throw error;
    }

    // 4. Create all nodes with pre-generated IDs
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
        event_type: 'workflow_def_node_create_failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: { workflow_def_id: workflowDef.id, name: data.name },
      });
      throw error;
    }

    // 5. Create transitions with transformed IDs (including synchronization.sibling_group)
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
        event_type: 'workflow_def_transition_create_failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: { workflow_def_id: workflowDef.id, name: data.name },
      });
      throw error;
    }

    this.serviceCtx.logger.info({
      event_type: 'workflow_def_created',
      metadata: {
        workflow_def_id: workflowDef.id,
        version: workflowDef.version,
        name: workflowDef.name,
      },
    });

    return {
      workflow_def_id: workflowDef.id,
      workflow_def: workflowDef,
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
