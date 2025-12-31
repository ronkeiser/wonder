/** Type definitions for personas */

import { personas } from '../../schema';

// ============================================================================
// Embedded JSON Types (explicit - used by schema via .$type<T>())
// ============================================================================

/**
 * Agent constraints embedded in Persona
 * @see docs/architecture/agent.md
 */
export type AgentConstraints = {
  maxMovesPerTurn?: number;
};

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Persona entity - inferred from database schema */
export type Persona = typeof personas.$inferSelect;

// ============================================================================
// API DTOs (inferred from schema with API-specific modifications)
// ============================================================================

import type { NewEntity } from '~/shared/types';

/** Base input for creating a persona - inferred from schema */
type PersonaInsert = NewEntity<typeof personas.$inferInsert>;

/** API input for creating a persona - adds autoversion */
export type PersonaInput = Omit<PersonaInsert, 'contentHash'> & {
  autoversion?: boolean;
};
