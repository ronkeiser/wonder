import type { CreateModelProfileRequest, ModelProfile } from '../types/model-profiles';

export class ModelProfilesResource {
  constructor(private baseUrl: string) {}

  async list(filters?: { provider?: string }): Promise<{ profiles: ModelProfile[] }> {
    const url = new URL(`${this.baseUrl}/api/model-profiles`);
    if (filters?.provider) {
      url.searchParams.set('provider', filters.provider);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Failed to list model profiles: ${response.statusText}`);
    }

    return (await response.json()) as { profiles: ModelProfile[] };
  }

  async get(modelProfileId: string): Promise<{ profile: ModelProfile }> {
    const response = await fetch(`${this.baseUrl}/api/model-profiles/${modelProfileId}`);

    if (!response.ok) {
      throw new Error(`Failed to get model profile: ${response.statusText}`);
    }

    return (await response.json()) as { profile: ModelProfile };
  }

  async create(
    request: CreateModelProfileRequest,
  ): Promise<{ model_profile_id: string; model_profile: ModelProfile }> {
    const response = await fetch(`${this.baseUrl}/api/model-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create model profile: ${response.statusText}`);
    }

    return (await response.json()) as { model_profile_id: string; model_profile: ModelProfile };
  }
}
