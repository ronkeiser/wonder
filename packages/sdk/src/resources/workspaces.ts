import type { APIClient } from '../client';
import type { components } from '../generated/schema';

type Workspace = components['schemas']['Workspace'];
type CreateWorkspace = components['schemas']['CreateWorkspace'];

export class WorkspacesResource {
  constructor(private client: APIClient) {}

  async create(data: CreateWorkspace) {
    return this.client.post<Workspace>('/api/workspaces', { body: data });
  }

  async get(id: string) {
    return this.client.get<Workspace>('/api/workspaces/{id}', {
      params: { id },
    });
  }

  async delete(id: string) {
    return this.client.delete<{ success: boolean }>('/api/workspaces/{id}', {
      params: { id },
    });
  }
}
