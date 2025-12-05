/** WorkflowDefs RPC resource */

import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';
import type { Node, Transition, WorkflowDef } from './types';

export class WorkflowDefs extends Resource {
  async create(data: {
    name: string;
    description: string;
    owner: {
      type: 'project' | 'library';
      project_id?: string;
      library_id?: string;
    };
    tags?: string[];
    input_schema: object;
    output_schema: object;
    output_mapping?: object;
    context_schema?: object;
    initial_node_ref: string;
    nodes: Array<{
      ref: string;
      name: string;
      action_id: string;
      action_version: number;
      input_mapping?: object;
      output_mapping?: object;
      // No branching logic - nodes only execute actions
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

    // 4. Create workflow def (initial_node_id will be set after nodes created)
    let workflowDef;
    try {
      const owner_id =
        data.owner.type === 'project' ? data.owner.project_id! : data.owner.library_id!;

      workflowDef = await repo.createWorkflowDef(this.serviceCtx.db, {
        name: data.name,
        description: data.description,
        owner_type: data.owner.type,
        owner_id,
        tags: data.tags ?? null,
        input_schema: data.input_schema,
        output_schema: data.output_schema,
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

    // 5. Create all nodes and build ref→ID map
    const refToIdMap = new Map<string, string>();
    for (const nodeData of data.nodes) {
      const node = await repo.createNode(this.serviceCtx.db, {
        ref: nodeData.ref,
        workflow_def_id: workflowDef.id,
        workflow_def_version: workflowDef.version,
        name: nodeData.name,
        action_id: nodeData.action_id,
        action_version: nodeData.action_version,
        input_mapping: nodeData.input_mapping ?? null,
        output_mapping: nodeData.output_mapping ?? null,
      });
      refToIdMap.set(nodeData.ref, node.id);
    }

    // 6. Set initial_node_id using ref→ID map
    const initialNodeId = refToIdMap.get(data.initial_node_ref)!;
    await repo.updateWorkflowDef(this.serviceCtx.db, workflowDef.id, workflowDef.version, {
      initial_node_id: initialNodeId,
    });
    workflowDef.initial_node_id = initialNodeId;

    // 7. Create transitions (from_node_ref/to_node_ref → from_node_id/to_node_id)
    if (data.transitions) {
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
    this.serviceCtx.logger.info({
      event_type: 'workflow_def_get',
      metadata: { workflow_def_id: workflowDefId, version },
    });

    const workflowDef = await repo.getWorkflowDef(this.serviceCtx.db, workflowDefId, version);
    if (!workflowDef) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_def_not_found',
        metadata: { workflow_def_id: workflowDefId, version },
      });
      throw new NotFoundError(
        `WorkflowDef not found: ${workflowDefId}`,
        'workflow_def',
        workflowDefId,
      );
    }

    const nodes = await repo.listNodesByWorkflowDef(this.serviceCtx.db, workflowDefId);
    const transitions = await repo.listTransitionsByWorkflowDef(this.serviceCtx.db, workflowDefId);

    return {
      workflow_def: workflowDef,
      nodes,
      transitions,
    };
  }

  async delete(workflowDefId: string, version?: number): Promise<void> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_def_delete_started',
      metadata: { workflow_def_id: workflowDefId, version },
    });

    // Check if workflow def exists
    const workflowDef = await repo.getWorkflowDef(this.serviceCtx.db, workflowDefId, version);
    if (!workflowDef) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_def_not_found',
        metadata: { workflow_def_id: workflowDefId, version },
      });
      throw new NotFoundError(
        `WorkflowDef not found: ${workflowDefId}`,
        'workflow_def',
        workflowDefId,
      );
    }

    await repo.deleteWorkflowDef(this.serviceCtx.db, workflowDefId, version);

    this.serviceCtx.logger.info({
      event_type: 'workflow_def_deleted',
      metadata: { workflow_def_id: workflowDefId, version },
    });
  }
}
