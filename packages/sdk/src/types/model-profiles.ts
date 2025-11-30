export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  parameters: unknown;
  execution_config: unknown | null;
  cost_per_1k_input_tokens: number;
  cost_per_1k_output_tokens: number;
}

export interface CreateModelProfileRequest {
  name: string;
  provider: string;
  model_id: string;
  parameters?: unknown;
  execution_config?: unknown;
  cost_per_1k_input_tokens?: number;
  cost_per_1k_output_tokens?: number;
}
