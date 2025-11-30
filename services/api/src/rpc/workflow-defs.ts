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
    initial_node_id: string;
    nodes: Array<{
      id: string;
      name: string;
      action_id: string;
      input_mapping?: unknown;
      output_mapping?: unknown;
      fan_out?: 'first_match' | 'all';
      fan_in?: 'any' | 'all' | { m_of_n: number };
      joins_node?: string;
      merge?: unknown;
      on_early_complete?: 'cancel' | 'abandon' | 'allow_late_merge';
    }>;
    transitions?: Array<{
      from_node_id: string;
      to_node_id: string;
      priority: number;
      condition?: unknown;
      foreach?: unknown;
      loop_config?: unknown;
    }>;
  }) {
    // Create workflow definition
    const workflowDef = await graphRepo.createWorkflowDef(this.serviceCtx.db, {
      name: data.name,
      description: data.description,
      owner: data.owner,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      input_schema: JSON.stringify(data.input_schema),
      output_schema: JSON.stringify(data.output_schema),
      context_schema: data.context_schema ? JSON.stringify(data.context_schema) : null,
      initial_node_id: data.initial_node_id,
    });

    // Create nodes
    for (const nodeData of data.nodes) {
      await graphRepo.createNode(this.serviceCtx.db, {
        workflow_def_id: workflowDef.id,
        workflow_def_version: workflowDef.version,
        name: nodeData.name,
        action_id: nodeData.action_id,
        input_mapping: nodeData.input_mapping ? JSON.stringify(nodeData.input_mapping) : null,
        output_mapping: nodeData.output_mapping ? JSON.stringify(nodeData.output_mapping) : null,
        fan_out: nodeData.fan_out ?? 'first_match',
        fan_in: nodeData.fan_in ?? 'any',
        joins_node: nodeData.joins_node ?? null,
        merge: nodeData.merge ? JSON.stringify(nodeData.merge) : null,
        on_early_complete: nodeData.on_early_complete as
          | 'cancel'
          | 'abandon'
          | 'allow_late_merge'
          | null,
      });
    }

    // Create transitions if provided
    if (data.transitions) {
      for (const transitionData of data.transitions) {
        await graphRepo.createTransition(this.serviceCtx.db, {
          workflow_def_id: workflowDef.id,
          workflow_def_version: workflowDef.version,
          from_node_id: transitionData.from_node_id,
          to_node_id: transitionData.to_node_id,
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
