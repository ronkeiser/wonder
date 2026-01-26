import type { promptSpecs } from '~/schema';

/** PromptSpec entity — inferred from database schema. */
export type PromptSpec = typeof promptSpecs.$inferSelect;

/** API input for creating a prompt spec. */
export type PromptSpecInput = {
  name: string;
  description?: string;
  systemPrompt?: string | null;
  template: string;
  requires?: Record<string, unknown>;
  produces?: Record<string, unknown>;
  examples?: Record<string, unknown> | null;
  autoversion?: boolean;
  force?: boolean;
};
