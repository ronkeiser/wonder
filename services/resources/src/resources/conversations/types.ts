/** Type definitions for conversations */

import { conversations } from '../../schema';

// ============================================================================
// Embedded JSON Types (explicit - used by schema via .$type<T>())
// ============================================================================

/**
 * Participant in a conversation
 */
export type Participant =
  | { type: 'user'; userId: string }
  | { type: 'agent'; agentId: string };

/**
 * Conversation status
 */
export type ConversationStatus = 'active' | 'waiting' | 'completed' | 'failed';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Conversation entity - inferred from database schema */
export type Conversation = typeof conversations.$inferSelect;

// ============================================================================
// API DTOs (inferred from schema with API-specific modifications)
// ============================================================================

import type { NewEntity } from '~/shared/types';

/** Base input for creating a conversation - inferred from schema */
type ConversationInsert = NewEntity<typeof conversations.$inferInsert>;

/** API input for creating a conversation */
export type ConversationInput = ConversationInsert;
