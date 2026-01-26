/** Type definitions for prompt specs */

/**
 * PromptSpec entity - the API-facing shape.
 * Internally stored in the unified `definitions` table.
 */
export type PromptSpec = {
  id: string;
  version: number;
  name: string;
  description: string;
  systemPrompt: string | null;
  template: string;
  requires: object;
  produces: object;
  examples: object | null;
  tags: string[] | null;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * API input for creating a prompt spec.
 */
export type PromptSpecInput = {
  name: string;
  description?: string;
  systemPrompt?: string | null;
  template: string;
  requires?: Record<string, unknown>;
  produces?: Record<string, unknown>;
  examples?: Record<string, unknown> | null;
  tags?: string[] | null;
  autoversion?: boolean;
  force?: boolean;
};
