import type { CreatePromptSpecRequest, PromptSpec } from '../types/prompt-specs';

export class PromptSpecsResource {
  constructor(private baseUrl: string) {}

  async create(
    request: CreatePromptSpecRequest,
  ): Promise<{ prompt_spec_id: string; prompt_spec: PromptSpec }> {
    const response = await fetch(`${this.baseUrl}/api/prompt-specs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create prompt spec: ${response.statusText}`);
    }

    return (await response.json()) as { prompt_spec_id: string; prompt_spec: PromptSpec };
  }

  async get(promptSpecId: string): Promise<{ prompt_spec: PromptSpec }> {
    const response = await fetch(`${this.baseUrl}/api/prompt-specs/${promptSpecId}`);

    if (!response.ok) {
      throw new Error(`Failed to get prompt spec: ${response.statusText}`);
    }

    return (await response.json()) as { prompt_spec: PromptSpec };
  }
}
