/** Service layer for workspace domain operations */

import type { ServiceContext } from '~/infrastructure/context';
import * as workspaceRepo from './repository';

/**
 * Create a new workspace
 */
export async function createWorkspace(
  ctx: ServiceContext,
  data: { name: string; settings?: unknown },
) {
  ctx.logger.info('workspace_create_started', { name: data.name });

  const workspace = await workspaceRepo.createWorkspace(ctx.db, {
    name: data.name,
    settings: data.settings ?? null,
  });

  ctx.logger.info('workspace_created', {
    workspace_id: workspace.id,
    name: workspace.name,
  });

  return workspace;
}

/**
 * Get a workspace by ID
 */
export async function getWorkspace(ctx: ServiceContext, workspaceId: string) {
  ctx.logger.info('workspace_get', { workspace_id: workspaceId });

  const workspace = await workspaceRepo.getWorkspace(ctx.db, workspaceId);
  if (!workspace) {
    ctx.logger.error('workspace_not_found', { workspace_id: workspaceId });
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  return workspace;
}

/**
 * List workspaces with optional pagination
 */
export async function listWorkspaces(
  ctx: ServiceContext,
  options?: { limit?: number; offset?: number },
) {
  ctx.logger.info('workspace_list', options);
  return await workspaceRepo.listWorkspaces(ctx.db, options);
}

/**
 * Update a workspace
 */
export async function updateWorkspace(
  ctx: ServiceContext,
  workspaceId: string,
  data: { name?: string; settings?: unknown },
) {
  ctx.logger.info('workspace_update_started', { workspace_id: workspaceId });

  const workspace = await workspaceRepo.updateWorkspace(ctx.db, workspaceId, {
    name: data.name,
    settings: data.settings ?? undefined,
  });

  ctx.logger.info('workspace_updated', {
    workspace_id: workspace.id,
    name: workspace.name,
  });

  return workspace;
}

/**
 * Delete a workspace
 */
export async function deleteWorkspace(ctx: ServiceContext, workspaceId: string) {
  ctx.logger.info('workspace_delete_started', { workspace_id: workspaceId });

  // Verify workspace exists
  const workspace = await workspaceRepo.getWorkspace(ctx.db, workspaceId);
  if (!workspace) {
    ctx.logger.error('workspace_not_found', { workspace_id: workspaceId });
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  await workspaceRepo.deleteWorkspace(ctx.db, workspaceId);
  ctx.logger.info('workspace_deleted', { workspace_id: workspaceId });
}

/**
 * Create a new project
 */
export async function createProject(
  ctx: ServiceContext,
  data: {
    workspace_id: string;
    name: string;
    description?: string;
    settings?: unknown;
  },
) {
  ctx.logger.info('project_create_started', {
    workspace_id: data.workspace_id,
    name: data.name,
  });

  const project = await workspaceRepo.createProject(ctx.db, {
    workspace_id: data.workspace_id,
    name: data.name,
    description: data.description ?? null,
    settings: data.settings ?? null,
  });

  ctx.logger.info('project_created', {
    project_id: project.id,
    workspace_id: project.workspace_id,
    name: project.name,
  });

  return project;
}

/**
 * Get a project by ID
 */
export async function getProject(ctx: ServiceContext, projectId: string) {
  ctx.logger.info('project_get', { project_id: projectId });

  const project = await workspaceRepo.getProject(ctx.db, projectId);
  if (!project) {
    ctx.logger.error('project_not_found', { project_id: projectId });
    throw new Error(`Project not found: ${projectId}`);
  }
  return project;
}

/**
 * Delete a project
 */
export async function deleteProject(ctx: ServiceContext, projectId: string) {
  ctx.logger.info('project_delete_started', { project_id: projectId });

  // Verify project exists
  const project = await workspaceRepo.getProject(ctx.db, projectId);
  if (!project) {
    ctx.logger.error('project_not_found', { project_id: projectId });
    throw new Error(`Project not found: ${projectId}`);
  }

  await workspaceRepo.deleteProject(ctx.db, projectId);
  ctx.logger.info('project_deleted', { project_id: projectId });
}
