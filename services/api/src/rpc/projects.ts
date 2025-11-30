import * as graphService from '~/domains/graph/service';
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
    const project = await graphService.createProject(this.serviceCtx, data);
    return {
      project_id: project.id,
      project,
    };
  }

  /**
   * Get a project by ID
   */
  async get(projectId: string) {
    const project = await graphService.getProject(this.serviceCtx, projectId);
    return { project };
  }

  /**
   * Delete a project
   * Note: Cascading deletes handled by DB foreign key constraints
   */
  async delete(projectId: string) {
    await graphService.deleteProject(this.serviceCtx, projectId);
    return { success: true };
  }
}
