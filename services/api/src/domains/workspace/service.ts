/** Service layer for workspace domain operations */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
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

  try {
    const workspace = await workspaceRepo.createWorkspace(ctx.db, {
      name: data.name,
      settings: data.settings ?? null,
    });

    ctx.logger.info('workspace_created', {
      workspace_id: workspace.id,
      name: workspace.name,
    });

    return workspace;
  } catch (error) {
    const dbError = extractDbError(error);

    if (dbError.constraint === 'unique') {
      ctx.logger.warn('workspace_create_conflict', {
        name: data.name,
        field: dbError.field,
      });
      throw new ConflictError(
        `Workspace with ${dbError.field} already exists`,
        dbError.field,
        'unique',
      );
    }

    ctx.logger.error('workspace_create_failed', { name: data.name, error: dbError.message });
    throw error;
  }
}

/**
 * Get a workspace by ID
 */
export async function getWorkspace(ctx: ServiceContext, workspaceId: string) {
  ctx.logger.info('workspace_get', { workspace_id: workspaceId });

  const workspace = await workspaceRepo.getWorkspace(ctx.db, workspaceId);
  if (!workspace) {
    ctx.logger.warn('workspace_not_found', { workspace_id: workspaceId });
    throw new NotFoundError(`Workspace not found: ${workspaceId}`, 'workspace', workspaceId);
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
    ctx.logger.warn('workspace_not_found', { workspace_id: workspaceId });
    throw new NotFoundError(`Workspace not found: ${workspaceId}`, 'workspace', workspaceId);
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

  try {
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
  } catch (error) {
    const dbError = extractDbError(error);

    if (dbError.constraint === 'unique') {
      ctx.logger.warn('project_create_conflict', {
        workspace_id: data.workspace_id,
        name: data.name,
        field: dbError.field,
      });
      throw new ConflictError(
        `Project with ${dbError.field} already exists`,
        dbError.field,
        'unique',
      );
    }

    if (dbError.constraint === 'foreign_key') {
      ctx.logger.warn('project_create_invalid_workspace', {
        workspace_id: data.workspace_id,
      });
      throw new NotFoundError(
        `Workspace not found: ${data.workspace_id}`,
        'workspace',
        data.workspace_id,
      );
    }

    ctx.logger.error('project_create_failed', {
      workspace_id: data.workspace_id,
      name: data.name,
      error: dbError.message,
    });
    throw error;
  }
}

/**
 * Get a project by ID
 */
export async function getProject(ctx: ServiceContext, projectId: string) {
  ctx.logger.info('project_get', { project_id: projectId });

  const project = await workspaceRepo.getProject(ctx.db, projectId);
  if (!project) {
    ctx.logger.warn('project_not_found', { project_id: projectId });
    throw new NotFoundError(`Project not found: ${projectId}`, 'project', projectId);
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
    ctx.logger.warn('project_not_found', { project_id: projectId });
    throw new NotFoundError(`Project not found: ${projectId}`, 'project', projectId);
  }

  await workspaceRepo.deleteProject(ctx.db, projectId);
  ctx.logger.info('project_deleted', { project_id: projectId });
}
