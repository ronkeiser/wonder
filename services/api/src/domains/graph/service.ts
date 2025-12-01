/** Graph domain service - orchestrates workflow definition operations */

import { ConflictError, NotFoundError, ValidationError, extractDbError } from '~/errors';
import type { ServiceContext } from '~/infrastructure/context';
import * as graphRepo from './repository';

export type WorkflowDefOwner =
  | { type: 'project'; project_id: string }
  | { type: 'library'; library_id: string };

export type FanIn = 'any' | 'all' | { m_of_n: number };

export interface CreateWorkflowDefInput {
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
}

/**
 * Create a workflow definition with nodes and transitions.
 * Validates refs, assigns ULIDs, and creates all entities atomically.
 */
export async function createWorkflowDefinition(ctx: ServiceContext, data: CreateWorkflowDefInput) {
  ctx.logger.info('workflow_def_create_started', { name: data.name });

  // 1. Validate all node refs are unique
  const nodeRefs = new Set<string>();
  for (const nodeData of data.nodes) {
    if (nodeRefs.has(nodeData.ref)) {
      ctx.logger.warn('workflow_def_validation_failed', {
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
      ctx.logger.warn('workflow_def_validation_failed', {
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
      ctx.logger.warn('workflow_def_validation_failed', {
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
    ctx.logger.warn('workflow_def_validation_failed', {
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
      ctx.logger.warn('workflow_def_validation_failed', {
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

  // 5. Create workflow definition (initial_node_id will be set after nodes created)
  let workflowDef;
  try {
    workflowDef = await graphRepo.createWorkflowDef(ctx.db, {
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
      ctx.logger.warn('workflow_def_create_conflict', { name: data.name, field: dbError.field });
      throw new ConflictError(
        `WorkflowDef with ${dbError.field} already exists`,
        dbError.field,
        'unique',
      );
    }

    ctx.logger.error('workflow_def_create_failed', { name: data.name, error: dbError.message });
    throw error;
  }

  // 6. Create nodes and build ref→ULID map
  const refToIdMap = new Map<string, string>();
  for (const nodeData of data.nodes) {
    const node = await graphRepo.createNode(ctx.db, {
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
      joins_node: nodeData.joins_node_ref ? null : null, // Will be resolved in second pass
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
      await graphRepo.updateNode(ctx.db, nodeId, { joins_node: joinsNodeId });
    }
  }

  // 8. Update initial_node_id using resolved ULID
  const initialNodeId = refToIdMap.get(data.initial_node_ref)!;
  await graphRepo.updateWorkflowDef(ctx.db, workflowDef.id, workflowDef.version, {
    initial_node_id: initialNodeId,
  });
  workflowDef.initial_node_id = initialNodeId;

  // 9. Create transitions using resolved ULIDs
  if (data.transitions) {
    for (const transitionData of data.transitions) {
      await graphRepo.createTransition(ctx.db, {
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

  ctx.logger.info('workflow_def_created', {
    workflow_def_id: workflowDef.id,
    version: workflowDef.version,
    name: workflowDef.name,
  });

  return {
    workflow_def_id: workflowDef.id,
    workflow_def: workflowDef,
  };
}

/**
 * Get a workflow definition with its nodes and transitions
 */
export async function getWorkflowDefinition(
  ctx: ServiceContext,
  workflowDefId: string,
  version?: number,
) {
  ctx.logger.info('workflow_def_get', { workflow_def_id: workflowDefId, version });

  const workflowDef = await graphRepo.getWorkflowDef(ctx.db, workflowDefId, version);
  if (!workflowDef) {
    ctx.logger.warn('workflow_def_not_found', { workflow_def_id: workflowDefId, version });
    throw new NotFoundError(
      `WorkflowDef not found: ${workflowDefId}`,
      'workflow_def',
      workflowDefId,
    );
  }

  const nodes = await graphRepo.listNodesByWorkflowDef(ctx.db, workflowDefId);
  const transitions = await graphRepo.listTransitionsByWorkflowDef(ctx.db, workflowDefId);

  return {
    workflow_def: workflowDef,
    nodes,
    transitions,
  };
}

/**
 * List workflow definitions by owner
 */
export async function listWorkflowDefinitionsByOwner(
  ctx: ServiceContext,
  ownerType: 'project' | 'library',
  ownerId: string,
) {
  const workflowDefs = await graphRepo.listWorkflowDefsByOwner(ctx.db, ownerType, ownerId);
  return { workflow_defs: workflowDefs };
}

/**
 * Create a new workflow (binds a workflow_def to a project)
 */
export async function createWorkflow(
  ctx: ServiceContext,
  data: {
    project_id: string;
    name: string;
    description?: string;
    workflow_def_id: string;
    pinned_version?: number;
    enabled?: boolean;
  },
) {
  ctx.logger.info('workflow_create_started', { project_id: data.project_id, name: data.name });

  try {
    const workflow = await graphRepo.createWorkflow(ctx.db, {
      project_id: data.project_id,
      name: data.name,
      description: data.description || data.name,
      workflow_def_id: data.workflow_def_id,
      pinned_version: data.pinned_version ?? null,
      enabled: data.enabled ?? true,
    });

    ctx.logger.info('workflow_created', { workflow_id: workflow.id, name: workflow.name });
    return workflow;
  } catch (error) {
    const dbError = extractDbError(error);

    if (dbError.constraint === 'unique') {
      ctx.logger.warn('workflow_create_conflict', {
        project_id: data.project_id,
        name: data.name,
        field: dbError.field,
      });
      throw new ConflictError(
        `Workflow with ${dbError.field} already exists`,
        dbError.field,
        'unique',
      );
    }

    if (dbError.constraint === 'foreign_key') {
      ctx.logger.warn('workflow_create_invalid_reference', {
        project_id: data.project_id,
        workflow_def_id: data.workflow_def_id,
      });
      throw new NotFoundError(
        'Referenced project or workflow_def does not exist',
        'reference',
        data.workflow_def_id,
      );
    }

    ctx.logger.error('workflow_create_failed', {
      project_id: data.project_id,
      name: data.name,
      error: dbError.message,
    });
    throw error;
  }
}

/**
 * Get a workflow by ID
 */
export async function getWorkflow(ctx: ServiceContext, workflowId: string) {
  ctx.logger.info('workflow_get', { workflow_id: workflowId });

  const workflow = await graphRepo.getWorkflow(ctx.db, workflowId);
  if (!workflow) {
    ctx.logger.warn('workflow_not_found', { workflow_id: workflowId });
    throw new NotFoundError(`Workflow not found: ${workflowId}`, 'workflow', workflowId);
  }
  return workflow;
}
