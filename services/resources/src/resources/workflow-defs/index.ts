/** WorkflowDefs RPC resource */

import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';
import type { Node, Transition, WorkflowDef } from './types';

export class WorkflowDefs extends Resource {
  async create(data: {
    name: string;
    description: string;
    project_id?: string;
    library_id?: string;
    tags?: string[];
    input_schema: object;
    output_schema: object;
    output_mapping?: object;
    context_schema?: object;
    initial_node_ref: string;
    nodes: Array<{
      ref: string;
      name: string;
      task_id?: string;
      task_version?: number;
      input_mapping?: object;
      output_mapping?: object;
      resource_bindings?: Record<string, string>;
      // No branching logic - nodes only execute tasks
    }>;
    transitions?: Array<{
      ref?: string;
      from_node_ref: string;
      to_node_ref: string;
      priority: number;
      condition?: object;
      spawn_count?: number;
      foreach?: object;
      synchronization?: object;
      loop_config?: object;
    }>;
  }): Promise<{
    workflow_def_id: string;
    workflow_def: WorkflowDef;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_def_create_started',
      metadata: { name: data.name },
    });

    // 1. Validate all node refs are unique
    const nodeRefs = new Set<string>();
    for (const nodeData of data.nodes) {
      if (nodeRefs.has(nodeData.ref)) {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_def_validation_failed',
          metadata: { error: 'duplicate_node_ref', ref: nodeData.ref },
        });
        throw new ValidationError(
          `Duplicate node ref: ${nodeData.ref}`,
          `nodes[${nodeData.ref}]`,
          'DUPLICATE_NODE_REF',
        );
      }
      nodeRefs.add(nodeData.ref);
    }

    // 2. Validate all transition refs point to valid nodes
    for (const transition of data.transitions ?? []) {
      if (!nodeRefs.has(transition.from_node_ref)) {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_def_validation_failed',
          metadata: { error: 'invalid_from_node_ref', ref: transition.from_node_ref },
        });
        throw new ValidationError(
          `Invalid from_node_ref: ${transition.from_node_ref}`,
          'transitions.from_node_ref',
          'INVALID_NODE_REF',
        );
      }
      if (!nodeRefs.has(transition.to_node_ref)) {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_def_validation_failed',
          metadata: { error: 'invalid_to_node_ref', ref: transition.to_node_ref },
        });
        throw new ValidationError(
          `Invalid to_node_ref: ${transition.to_node_ref}`,
          'transitions.to_node_ref',
          'INVALID_NODE_REF',
        );
      }
    }

    // 3. Validate initial_node_ref exists
    if (!nodeRefs.has(data.initial_node_ref)) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_def_validation_failed',
        metadata: { error: 'invalid_initial_node_ref', ref: data.initial_node_ref },
      });
      throw new ValidationError(
        `Invalid initial_node_ref: ${data.initial_node_ref}`,
        'initial_node_ref',
        'INVALID_NODE_REF',
      );
    }

    // 4. Validate ownership - exactly one of project_id or library_id must be set
    if (!data.project_id && !data.library_id) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_def_validation_failed',
        metadata: { error: 'missing_owner' },
      });
      throw new ValidationError(
        'Either project_id or library_id must be provided',
        'project_id|library_id',
        'MISSING_OWNER',
      );
    }
    if (data.project_id && data.library_id) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_def_validation_failed',
        metadata: { error: 'multiple_owners' },
      });
      throw new ValidationError(
        'Cannot specify both project_id and library_id',
        'project_id|library_id',
        'MULTIPLE_OWNERS',
      );
    }

    // 5. Create workflow def (initial_node_id will be set after nodes created)
    let workflowDef;
    try {
      workflowDef = await repo.createWorkflowDef(this.serviceCtx.db, {
        name: data.name,
        description: data.description,
        project_id: data.project_id ?? null,
        library_id: data.library_id ?? null,
        tags: data.tags ?? null,
        input_schema: data.input_schema,
        output_schema: data.output_schema,
        output_mapping: data.output_mapping ?? null,
        context_schema: data.context_schema ?? null,
        initial_node_id: null,
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

    // 6. Create all nodes and build ref→ID map
    const refToIdMap = new Map<string, string>();
    try {
      for (const nodeData of data.nodes) {
        const node = await repo.createNode(this.serviceCtx.db, {
          ref: nodeData.ref,
          workflow_def_id: workflowDef.id,
          workflow_def_version: workflowDef.version,
          name: nodeData.name,
          task_id: nodeData.task_id,
          task_version: nodeData.task_version,
          input_mapping: nodeData.input_mapping ?? null,
          output_mapping: nodeData.output_mapping ?? null,
          resource_bindings: nodeData.resource_bindings ?? null,
        });
        refToIdMap.set(nodeData.ref, node.id);
      }
    } catch (error) {
      this.serviceCtx.logger.error({
        event_type: 'workflow_def_node_create_failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: { workflow_def_id: workflowDef.id, name: data.name },
      });
      throw error;
    }

    // 7. Set initial_node_id using ref→ID map
    const initialNodeId = refToIdMap.get(data.initial_node_ref)!;
    try {
      await repo.updateWorkflowDef(this.serviceCtx.db, workflowDef.id, workflowDef.version, {
        initial_node_id: initialNodeId,
      });
      workflowDef.initial_node_id = initialNodeId;
    } catch (error) {
      this.serviceCtx.logger.error({
        event_type: 'workflow_def_update_initial_node_failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: { workflow_def_id: workflowDef.id, initial_node_id: initialNodeId },
      });
      throw error;
    }

    // 8. Create transitions (from_node_ref/to_node_ref → from_node_id/to_node_id)
    if (data.transitions) {
      try {
        for (const transitionData of data.transitions) {
          await repo.createTransition(this.serviceCtx.db, {
            ref: transitionData.ref ?? null,
            workflow_def_id: workflowDef.id,
            workflow_def_version: workflowDef.version,
            from_node_id: refToIdMap.get(transitionData.from_node_ref)!,
            to_node_id: refToIdMap.get(transitionData.to_node_ref)!,
            priority: transitionData.priority,
            condition: transitionData.condition ?? null,
            spawn_count: transitionData.spawn_count ?? null,
            foreach: transitionData.foreach ?? null,
            synchronization: transitionData.synchronization ?? null,
            loop_config: transitionData.loop_config ?? null,
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
