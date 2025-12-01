/** WorkflowDefs RPC resource */

import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/errors';
import { Resource } from '~/rpc/resource';
import type { FanIn, WorkflowDefOwner } from './repository';
import * as repo from './repository';

export class WorkflowDefs extends Resource {
  async create(data: {
    name: string;
    description: string;
    owner: WorkflowDefOwner;
    tags?: string[];
    input_schema: unknown;
    output_schema: unknown;
    context_schema?: unknown;
    initial_node_ref: string;
    nodes: Array<{
      ref: string;
      name: string;
      action_id: string;
      action_version: number;
      input_mapping?: unknown;
      output_mapping?: unknown;
      fan_out?: 'first_match' | 'all';
      fan_in?: FanIn;
      joins_node_ref?: string;
      merge?: unknown;
      on_early_complete?: 'cancel' | 'abandon' | 'allow_late_merge';
    }>;
    transitions?: Array<{
      ref?: string;
      from_node_ref: string;
      to_node_ref: string;
      priority: number;
      condition?: unknown;
      foreach?: unknown;
      loop_config?: unknown;
    }>;
  }): Promise<{
    workflow_def_id: string;
    workflow_def: any;
  }> {
    this.serviceCtx.logger.info('workflow_def_create_started', { name: data.name });

    // 1. Validate all node refs are unique
    const nodeRefs = new Set<string>();
    for (const nodeData of data.nodes) {
      if (nodeRefs.has(nodeData.ref)) {
        this.serviceCtx.logger.warn('workflow_def_validation_failed', {
          error: 'duplicate_node_ref',
          ref: nodeData.ref,
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
        this.serviceCtx.logger.warn('workflow_def_validation_failed', {
          error: 'invalid_from_node_ref',
          ref: transition.from_node_ref,
        });
        throw new ValidationError(
          `Invalid from_node_ref: ${transition.from_node_ref}`,
          'transitions.from_node_ref',
          'INVALID_NODE_REF',
        );
      }
      if (!nodeRefs.has(transition.to_node_ref)) {
        this.serviceCtx.logger.warn('workflow_def_validation_failed', {
          error: 'invalid_to_node_ref',
          ref: transition.to_node_ref,
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
      this.serviceCtx.logger.warn('workflow_def_validation_failed', {
        error: 'invalid_initial_node_ref',
        ref: data.initial_node_ref,
      });
      throw new ValidationError(
        `Invalid initial_node_ref: ${data.initial_node_ref}`,
        'initial_node_ref',
        'INVALID_NODE_REF',
      );
    }

    // 4. Validate joins_node_ref if provided
    for (const nodeData of data.nodes) {
      if (nodeData.joins_node_ref && !nodeRefs.has(nodeData.joins_node_ref)) {
        this.serviceCtx.logger.warn('workflow_def_validation_failed', {
          error: 'invalid_joins_node_ref',
          ref: nodeData.joins_node_ref,
        });
        throw new ValidationError(
          `Invalid joins_node_ref: ${nodeData.joins_node_ref}`,
          `nodes[${nodeData.ref}].joins_node_ref`,
          'INVALID_NODE_REF',
        );
      }
    }

    // 5. Create workflow def (initial_node_id will be set after nodes created)
    let workflowDef;
    try {
      workflowDef = await repo.createWorkflowDef(this.serviceCtx.db, {
        name: data.name,
        description: data.description,
        owner: data.owner,
        tags: data.tags ?? null,
        input_schema: data.input_schema,
        output_schema: data.output_schema,
        context_schema: data.context_schema ?? null,
        initial_node_id: null,
      });
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn('workflow_def_create_conflict', {
          name: data.name,
          field: dbError.field,
        });
        throw new ConflictError(
          `WorkflowDef with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      this.serviceCtx.logger.error('workflow_def_create_failed', {
        name: data.name,
        error: dbError.message,
      });
      throw error;
    }

    // 6. Create nodes and build ref→ULID map
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
        fan_out: nodeData.fan_out ?? 'first_match',
        fan_in: nodeData.fan_in ?? 'any',
        joins_node: null, // Will be resolved in second pass
        merge: nodeData.merge ?? null,
        on_early_complete: nodeData.on_early_complete ?? null,
      });
      refToIdMap.set(nodeData.ref, node.id);
    }

    // 7. Second pass: update joins_node references
    for (const nodeData of data.nodes) {
      if (nodeData.joins_node_ref) {
        const nodeId = refToIdMap.get(nodeData.ref)!;
        const joinsNodeId = refToIdMap.get(nodeData.joins_node_ref)!;
        await repo.updateNode(this.serviceCtx.db, nodeId, { joins_node: joinsNodeId });
      }
    }

    // 8. Update initial_node_id using resolved ULID
    const initialNodeId = refToIdMap.get(data.initial_node_ref)!;
    await repo.updateWorkflowDef(this.serviceCtx.db, workflowDef.id, workflowDef.version, {
      initial_node_id: initialNodeId,
    });
    workflowDef.initial_node_id = initialNodeId;

    // 9. Create transitions using resolved ULIDs
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
          foreach: transitionData.foreach ?? null,
          loop_config: transitionData.loop_config ?? null,
        });
      }
    }

    this.serviceCtx.logger.info('workflow_def_created', {
      workflow_def_id: workflowDef.id,
      version: workflowDef.version,
      name: workflowDef.name,
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
    workflow_def: any;
    nodes: any[];
    transitions: any[];
  }> {
    this.serviceCtx.logger.info('workflow_def_get', {
      workflow_def_id: workflowDefId,
      version,
    });

    const workflowDef = await repo.getWorkflowDef(this.serviceCtx.db, workflowDefId, version);
    if (!workflowDef) {
      this.serviceCtx.logger.warn('workflow_def_not_found', {
        workflow_def_id: workflowDefId,
        version,
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

  async listByOwner(owner: {
    type: 'project' | 'library';
    id: string;
  }): Promise<{ workflow_defs: any[] }> {
    const workflowDefs = await repo.listWorkflowDefsByOwner(
      this.serviceCtx.db,
      owner.type,
      owner.id,
    );
    return { workflow_defs: workflowDefs };
  }
}
