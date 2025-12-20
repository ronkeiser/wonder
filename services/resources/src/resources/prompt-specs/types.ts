/** Type definitions for prompt specs */

import { prompt_specs } from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** PromptSpec entity - inferred from database schema */
export type PromptSpec = typeof prompt_specs.$inferSelect;

// ============================================================================
// API DTOs (explicit - have fields not in DB)
// ============================================================================

export type PromptSpecInput = {
  version?: number;
  name: string;
  description?: string;
  systemPrompt?: string;
  template: string;
  requires?: object;
  produces?: object;
  examples?: object;
  tags?: string[];
  autoversion?: boolean;
};
