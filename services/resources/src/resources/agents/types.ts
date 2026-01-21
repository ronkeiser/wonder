/** Type definitions for agents */

import { agents } from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Agent entity - inferred from database schema */
export type Agent = typeof agents.$inferSelect;

/** Agent with expanded relations */
export type AgentWithRelations = Agent & {
  personaName: string | null;
};

// ============================================================================
// API DTOs (inferred from schema with API-specific modifications)
// ============================================================================

import type { NewEntity } from '~/shared/types';

/** Base input for creating an agent - inferred from schema */
type AgentInsert = NewEntity<typeof agents.$inferInsert>;

/** API input for creating an agent */
export type AgentInput = AgentInsert;
