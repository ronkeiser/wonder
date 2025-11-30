import type { ModelProfile as DbModelProfile, NewModelProfile } from '@wonder/api/types';

// Re-export canonical types from API
export type ModelProfile = DbModelProfile;

// Request type for creating model profiles (subset of NewModelProfile)
export interface CreateModelProfileRequest {
  name: string;
  provider: NewModelProfile['provider'];
  model_id: string;
  parameters?: unknown;
  execution_config?: unknown;
  cost_per_1k_input_tokens?: number;
  cost_per_1k_output_tokens?: number;
}
