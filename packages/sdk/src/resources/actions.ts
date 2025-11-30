import type { Action, CreateActionRequest } from '../types/actions';

export class ActionsResource {
  constructor(private baseUrl: string) {}

  async create(request: CreateActionRequest): Promise<{ action_id: string; action: Action }> {
    const response = await fetch(`${this.baseUrl}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create action: ${response.statusText}`);
    }

    return (await response.json()) as { action_id: string; action: Action };
  }

  async get(actionId: string): Promise<{ action: Action }> {
    const response = await fetch(`${this.baseUrl}/api/actions/${actionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get action: ${response.statusText}`);
    }

    return (await response.json()) as { action: Action };
  }
}
