import * as graphService from '~/domains/graph/service';
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
    return await graphService.createWorkflowDef(this.serviceCtx, data);
  }

  /**
   * Get a workflow definition by ID and version
   */
  async get(workflowDefId: string, version?: number) {
    return await graphService.getWorkflowDef(this.serviceCtx, workflowDefId, version);
  }

  /**
   * List workflow definitions by owner
   */
  async listByOwner(owner: { type: 'project' | 'library'; id: string }) {
    return await graphService.listWorkflowDefsByOwner(this.serviceCtx, owner.type, owner.id);
  }
}
