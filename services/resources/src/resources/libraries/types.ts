/** Type definitions for libraries */

import { libraries } from '../../schema';
import type { NewEntity } from '~/shared/types';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Library entity - inferred from database schema */
export type Library = typeof libraries.$inferSelect;

// ============================================================================
// API DTOs (inferred from schema with API-specific modifications)
// ============================================================================

/** Base input for creating a library - inferred from schema */
type LibraryInsert = NewEntity<typeof libraries.$inferInsert>;

/** API input for creating a library */
export type LibraryInput = LibraryInsert;

// ============================================================================
// Standard Library Types
// ============================================================================

/** Definition type for standard library manifest */
export type DefinitionType = 'workflow' | 'task' | 'action' | 'tool';

/** Information about a definition in a standard library */
export interface DefinitionInfo {
  name: string;
  type: DefinitionType;
  id: string;
}

/** Standard library manifest for validation */
export interface StandardLibraryManifest {
  libraries: Record<
    string,
    {
      definitions: Record<string, DefinitionType>;
    }
  >;
}
