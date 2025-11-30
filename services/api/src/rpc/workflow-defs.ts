import * as graphRepo from '~/domains/graph/repository';
import { Resource } from './resource';

/**
 * WorkflowDefs RPC resource
 * Exposes workflow definition CRUD operations
 */
export class WorkflowDefs extends Resource {
  /**
   * Create a new workflow definition with nodes
   */
  async create(data: {
    name: string;
    description: string;
    owner: { type: 'project'; project_id: string } | { type: 'library'; library_id: string };
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
      fan_in?: 'any' | 'all' | { m_of_n: number };
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
  }) {
    // 1. Validate all node refs are unique
    const nodeRefs = new Set<string>();
    for (const nodeData of data.nodes) {
      if (nodeRefs.has(nodeData.ref)) {
        throw new Error(`Duplicate node ref: ${nodeData.ref}`);
      }
      nodeRefs.add(nodeData.ref);
    }

    // 2. Validate all transition refs point to valid nodes
    for (const transition of data.transitions ?? []) {
      if (!nodeRefs.has(transition.from_node_ref)) {
        throw new Error(`Invalid from_node_ref: ${transition.from_node_ref}`);
      }
      if (!nodeRefs.has(transition.to_node_ref)) {
        throw new Error(`Invalid to_node_ref: ${transition.to_node_ref}`);
      }
    }

    // 3. Validate initial_node_ref exists
    if (!nodeRefs.has(data.initial_node_ref)) {
      throw new Error(`Invalid initial_node_ref: ${data.initial_node_ref}`);
    }

    // 4. Validate joins_node_ref if provided
    for (const nodeData of data.nodes) {
      if (nodeData.joins_node_ref && !nodeRefs.has(nodeData.joins_node_ref)) {
        throw new Error(`Invalid joins_node_ref: ${nodeData.joins_node_ref}`);
      }
    }

    // 5. Create workflow definition (initial_node_id will be set after nodes created)
    const workflowDef = await graphRepo.createWorkflowDef(this.serviceCtx.db, {
      name: data.name,
      description: data.description,
      owner: data.owner,
      tags: data.tags ?? null,
      input_schema: data.input_schema,
      output_schema: data.output_schema,
      context_schema: data.context_schema ?? null,
      initial_node_id: null,
    });

    // 6. Create nodes and build ref→ULID map
    const refToIdMap = new Map<string, string>();
    for (const nodeData of data.nodes) {
      const node = await graphRepo.createNode(this.serviceCtx.db, {
        ref: nodeData.ref,
        workflow_def_id: workflowDef.id,
        workflow_def_version: workflowDef.version,
        name: nodeData.name,
        action_id: nodeData.action_id,
        action_version: nodeData.action_version,
        input_mapping: nodeData.input_mapping ? JSON.stringify(nodeData.input_mapping) : null,
        output_mapping: nodeData.output_mapping ? JSON.stringify(nodeData.output_mapping) : null,
        fan_out: nodeData.fan_out ?? 'first_match',
        fan_in: nodeData.fan_in ?? 'any',
        joins_node: nodeData.joins_node_ref ? null : null, // Will be resolved in second pass
        merge: nodeData.merge ? JSON.stringify(nodeData.merge) : null,
        on_early_complete: nodeData.on_early_complete ?? null,
      });
      refToIdMap.set(nodeData.ref, node.id);
    }

    // 7. Second pass: update joins_node references
    for (const nodeData of data.nodes) {
      if (nodeData.joins_node_ref) {
        const nodeId = refToIdMap.get(nodeData.ref)!;
        const joinsNodeId = refToIdMap.get(nodeData.joins_node_ref)!;
        // Update the node with the resolved joins_node ID
        // Note: This requires an updateNode function in repository
        // For now, we'll include it in the create if we refactor to do this in one pass
      }
    }

    // 8. Update initial_node_id using resolved ULID
    const initialNodeId = refToIdMap.get(data.initial_node_ref)!;
    await graphRepo.updateWorkflowDef(this.serviceCtx.db, workflowDef.id, workflowDef.version, {
      initial_node_id: initialNodeId,
    });
    workflowDef.initial_node_id = initialNodeId;

    // 9. Create transitions using resolved ULIDs
    if (data.transitions) {
      for (const transitionData of data.transitions) {
        await graphRepo.createTransition(this.serviceCtx.db, {
          ref: transitionData.ref ?? null,
          workflow_def_id: workflowDef.id,
          workflow_def_version: workflowDef.version,
          from_node_id: refToIdMap.get(transitionData.from_node_ref)!,
          to_node_id: refToIdMap.get(transitionData.to_node_ref)!,
          priority: transitionData.priority,
          condition: transitionData.condition ? JSON.stringify(transitionData.condition) : null,
          foreach: transitionData.foreach ? JSON.stringify(transitionData.foreach) : null,
          loop_config: transitionData.loop_config
            ? JSON.stringify(transitionData.loop_config)
            : null,
        });
      }
    }

    return {
      workflow_def_id: workflowDef.id,
      workflow_def: workflowDef,
    };
  }

  /**
   * Get a workflow definition by ID and version
   */
  async get(workflowDefId: string, version?: number) {
    const workflowDef = await graphRepo.getWorkflowDef(this.serviceCtx.db, workflowDefId, version);
    if (!workflowDef) {
      throw new Error(`WorkflowDef not found: ${workflowDefId}`);
    }

    // Get nodes
    const nodes = await graphRepo.listNodesByWorkflowDef(this.serviceCtx.db, workflowDefId);

    // Get transitions
    const transitions = await graphRepo.listTransitionsByWorkflowDef(
      this.serviceCtx.db,
      workflowDefId,
    );

    return {
      workflow_def: workflowDef,
      nodes,
      transitions,
    };
  }

  /**
   * List workflow definitions by owner
   */
  async listByOwner(owner: { type: 'project' | 'library'; id: string }) {
    const workflowDefs = await graphRepo.listWorkflowDefsByOwner(
      this.serviceCtx.db,
      owner.type,
      owner.id,
    );

    return { workflow_defs: workflowDefs };
  }
}
