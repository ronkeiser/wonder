/** Projects RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';

export class Projects extends Resource {
  async create(data: {
    workspace_id: string;
    name: string;
    description?: string;
    settings?: Record<string, unknown>;
  }): Promise<{
    project_id: string;
    project: {
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      settings: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info('project_create_started', {
      workspace_id: data.workspace_id,
      name: data.name,
    });

    try {
      const project = await repo.createProject(this.serviceCtx.db, {
        workspace_id: data.workspace_id,
        name: data.name,
        description: data.description ?? null,
        settings: data.settings ?? null,
      });

      this.serviceCtx.logger.info('project_created', {
        project_id: project.id,
        workspace_id: project.workspace_id,
        name: project.name,
      });

      return {
        project_id: project.id,
        project: {
          ...project,
          settings: project.settings as Record<string, unknown> | null,
        },
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn('project_create_conflict', {
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
        this.serviceCtx.logger.warn('project_create_invalid_workspace', {
          workspace_id: data.workspace_id,
        });
        throw new NotFoundError(
          `Workspace not found: ${data.workspace_id}`,
          'workspace',
          data.workspace_id,
        );
      }

      this.serviceCtx.logger.error('project_create_failed', {
        workspace_id: data.workspace_id,
        name: data.name,
        error: dbError.message,
      });
      throw error;
    }
  }

  async get(id: string): Promise<{
    project: {
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      settings: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info('project_get', { project_id: id });

    const project = await repo.getProject(this.serviceCtx.db, id);
    if (!project) {
      this.serviceCtx.logger.warn('project_not_found', { project_id: id });
      throw new NotFoundError(`Project not found: ${id}`, 'project', id);
    }

    return {
      project: {
        ...project,
        settings: project.settings as Record<string, unknown> | null,
      },
    };
  }

  async list(params?: { workspace_id?: string; limit?: number }): Promise<{
    projects: Array<{
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      settings: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    this.serviceCtx.logger.info('project_list', params);

    const projects = await repo.listProjects(
      this.serviceCtx.db,
      params?.workspace_id,
      params?.limit,
    );

    return {
      projects: projects.map((p) => ({
        ...p,
        settings: p.settings as Record<string, unknown> | null,
      })),
    };
  }

  async update(
    id: string,
    data: { name?: string; description?: string; settings?: Record<string, unknown> },
  ): Promise<{
    project: {
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      settings: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info('project_update_started', { project_id: id });

    const project = await repo.updateProject(this.serviceCtx.db, id, data);
    if (!project) {
      this.serviceCtx.logger.warn('project_not_found', { project_id: id });
      throw new NotFoundError(`Project not found: ${id}`, 'project', id);
    }

    this.serviceCtx.logger.info('project_updated', {
      project_id: project.id,
      name: project.name,
    });

    return {
      project: {
        ...project,
        settings: project.settings as Record<string, unknown> | null,
      },
    };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info('project_delete_started', { project_id: id });

    // Verify project exists
    const project = await repo.getProject(this.serviceCtx.db, id);
    if (!project) {
      this.serviceCtx.logger.warn('project_not_found', { project_id: id });
      throw new NotFoundError(`Project not found: ${id}`, 'project', id);
    }

    await repo.deleteProject(this.serviceCtx.db, id);
    this.serviceCtx.logger.info('project_deleted', { project_id: id });

    return { success: true };
  }
}
