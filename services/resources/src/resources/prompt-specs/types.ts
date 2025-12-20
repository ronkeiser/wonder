/** Type definitions for prompt specs */

import { promptSpecs } from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** PromptSpec entity - inferred from database schema */
export type PromptSpec = typeof promptSpecs.$inferSelect;

// ============================================================================
// API DTOs (inferred from schema)
// ============================================================================

import type { NewEntity } from '~/shared/types';

/** Base input for creating a prompt spec - inferred from schema */
type PromptSpecInsert = NewEntity<typeof promptSpecs.$inferInsert>;

/** API input for creating a prompt spec - adds autoversion option */
export type PromptSpecInput = Omit<PromptSpecInsert, 'contentHash'> & {
  autoversion?: boolean;
};
