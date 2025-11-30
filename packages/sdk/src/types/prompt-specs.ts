import type { PromptSpec as DbPromptSpec, NewPromptSpec } from '@wonder/api/types';

// Re-export canonical types from API
export type PromptSpec = DbPromptSpec;

// Request type for creating prompt specs (subset of NewPromptSpec)
export interface CreatePromptSpecRequest {
  name: string;
  description?: string;
  template_language?: NewPromptSpec['template_language'];
  system_prompt?: string;
  template: string;
  requires?: unknown;
  produces?: unknown;
  examples?: unknown;
  tags?: unknown;
}
