/** Type definitions for actions */

import { actions } from '../../schema';

// ============================================================================
// Enums (explicit - used by schema via .$type<T>())
// ============================================================================

export type ActionKind =
  | 'llm'
  | 'mcp'
  | 'http'
  | 'human'
  | 'context'
  | 'artifact'
  | 'vector'
  | 'metric'
  | 'mock';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Action entity - inferred from database schema */
export type Action = typeof actions.$inferSelect;

// ============================================================================
// API DTOs (inferred from schema)
// ============================================================================

import type { NewEntity } from '~/shared/types';

/** Base input for creating an action - inferred from schema */
type ActionInsert = NewEntity<typeof actions.$inferInsert>;

/** API input for creating an action - adds autoversion option */
export type ActionInput = Omit<ActionInsert, 'contentHash'> & {
  autoversion?: boolean;
};
