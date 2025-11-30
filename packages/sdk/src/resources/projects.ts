import type { CreateProjectRequest, Project } from '../types/projects';

export class ProjectsResource {
  constructor(private baseUrl: string) {}

  async create(request: CreateProjectRequest): Promise<{ project_id: string; project: Project }> {
    const response = await fetch(`${this.baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create project: ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { project_id: string; project: Project };
  }

  async get(projectId: string): Promise<{ project: Project }> {
    const response = await fetch(`${this.baseUrl}/api/projects/${projectId}`);

    if (!response.ok) {
      throw new Error(`Failed to get project: ${response.statusText}`);
    }

    return (await response.json()) as { project: Project };
  }

  async delete(projectId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.statusText}`);
    }

    return (await response.json()) as { success: boolean };
  }
}
