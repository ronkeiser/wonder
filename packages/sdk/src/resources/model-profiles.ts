import type { APIClient } from '../client';
import type { components } from '../generated/schema';

type ModelProfile = components['schemas']['ModelProfile'];
type CreateModelProfile = components['schemas']['CreateModelProfile'];

export class ModelProfilesResource {
  constructor(private client: APIClient) {}

  async list(filters?: { provider?: 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local' }) {
    const params = filters?.provider ? `?provider=${filters.provider}` : '';
    return this.client.get<{ profiles: ModelProfile[] }>(`/api/model-profiles${params}`);
  }

  async create(data: CreateModelProfile) {
    return this.client.post<ModelProfile>('/api/model-profiles', { body: data });
  }

  async get(id: string) {
    return this.client.get<ModelProfile>(`/api/model-profiles/${id}`);
  }

  async delete(id: string) {
    return this.client.delete<{ success: boolean }>(`/api/model-profiles/${id}`);
  }
}
