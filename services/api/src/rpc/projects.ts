import { eq } from 'drizzle-orm';
import * as graphRepo from '~/domains/graph/repository';
import { projects } from '~/infrastructure/db/schema';
import { Resource } from './resource';

/**
 * Projects RPC resource
 * Exposes project CRUD operations
 */
export class Projects extends Resource {
  /**
   * Create a new project
   */
  async create(data: {
    workspace_id: string;
    name: string;
    description?: string;
    settings?: unknown;
  }) {
    const project = await graphRepo.createProject(this.serviceCtx.db, {
      workspace_id: data.workspace_id,
      name: data.name,
      description: data.description ?? null,
      settings: data.settings ?? null,
    });

    return {
      project_id: project.id,
      project,
    };
  }

  /**
   * Get a project by ID
   */
  async get(projectId: string) {
    const project = await graphRepo.getProject(this.serviceCtx.db, projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return { project };
  }

  /**
   * Delete a project
   * Note: Cascading deletes handled by DB foreign key constraints
   */
  async delete(projectId: string) {
    // Verify project exists
    const project = await graphRepo.getProject(this.serviceCtx.db, projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Delete project (cascades to workflows, workflow_defs, etc.)
    await this.serviceCtx.db.delete(projects).where(eq(projects.id, projectId));

    return { success: true };
  }
}
