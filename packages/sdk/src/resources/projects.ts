import type { APIClient } from '../client';
import type { components } from '../generated/schema';

type Project = components['schemas']['Project'];
type CreateProject = components['schemas']['CreateProject'];

export class ProjectsResource {
  constructor(private client: APIClient) {}

  async create(data: CreateProject) {
    return this.client.post<Project>('/api/projects', { body: data });
  }

  async get(id: string) {
    return this.client.get<Project>(`/api/projects/${id}`);
  }

  async delete(id: string) {
    return this.client.delete<{ success: boolean }>(`/api/projects/${id}`);
  }
}
